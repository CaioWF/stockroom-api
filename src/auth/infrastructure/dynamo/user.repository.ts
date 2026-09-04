/**
 * `UserRepository` over the shared DynamoDB table (FR4, AC-4, AC-6, AC-7).
 * Takes the document client and table name as plain constructor args —
 * same pattern `Rs256AccessTokenSigner` takes its `SigningKeyProvider` —
 * rather than building its own client; Task 13's composition root wires the
 * real one in.
 *
 * `create`'s email-uniqueness guarantee lives entirely in the transaction's
 * condition expression, never in a prior read (a read-then-write would race
 * two concurrent registrations for the same address, exactly what AC-4
 * forbids). No typed error translation beyond `EmailAlreadyRegisteredError`:
 * per `errors.ts`, any other DynamoDB failure propagates untranslated.
 */

import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  TransactionCanceledException,
  TransactionConflictException,
} from '@aws-sdk/client-dynamodb';

import { Account } from '../../domain/account';
import { EmailAddress } from '../../domain/email-address';
import { EmailAlreadyRegisteredError } from '../../domain/errors';
import { UserRepository } from '../../domain/ports/user-repository';
import {
  buildAccountKey,
  buildEmailLockKey,
} from '../../../shared/persistence/table-keys';
import { toAccount, toAccountItem, toEmailLockItem } from './user.mapper';

// Position of the email-lock `Put` inside `create`'s `TransactItems` array —
// the brief is explicit this is the ONLY index whose cancellation reason
// this method inspects, matching the lock's fixed position in the list.
const EMAIL_LOCK_TRANSACT_ITEM_INDEX = 1;
const CONDITIONAL_CHECK_FAILED_CODE = 'ConditionalCheckFailed';

// A fixed id that never addresses a real account item — `findByEmail`'s
// unknown-email path reads it anyway (result discarded) so both branches
// always pay two storage round-trips, not one, closing the residual timing
// side-channel that argon2's own dummy-verify fix (AuthenticateAccount) does
// not reach: a registered address costs one extra GetCommand this constant
// pays unconditionally.
const DUMMY_ACCOUNT_ID = '00000000-0000-7000-8000-000000000000';

// `TransactionConflictException` is DynamoDB's transient "another
// transaction is already touching this item" signal, distinct from a
// business `ConditionalCheckFailed` — retrying it changes nothing about
// which condition eventually governs the outcome (per the brief), so a
// small bounded backoff is safe here specifically. Never retry on the
// `ConditionalCheckFailed` case above; that outcome is real, not transient.
const MAX_TRANSACTION_CONFLICT_ATTEMPTS = 3;
const TRANSACTION_CONFLICT_RETRY_DELAY_MS = 20;

export class DynamoUserRepository implements UserRepository {
  constructor(
    private readonly documentClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async create(account: Account): Promise<void> {
    for (
      let attempt = 1;
      attempt <= MAX_TRANSACTION_CONFLICT_ATTEMPTS;
      attempt++
    ) {
      try {
        await this.attemptCreate(account);
        return;
      } catch (error: unknown) {
        if (
          !(error instanceof TransactionConflictException) ||
          attempt === MAX_TRANSACTION_CONFLICT_ATTEMPTS
        ) {
          throw error;
        }
        await this.delay(attempt * TRANSACTION_CONFLICT_RETRY_DELAY_MS);
      }
    }
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private async attemptCreate(account: Account): Promise<void> {
    const accountKey = buildAccountKey(account.id);
    const emailLockKey = buildEmailLockKey(account.email.toString());

    try {
      await this.documentClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.tableName,
                Item: { ...accountKey, ...toAccountItem(account) },
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: { ...emailLockKey, ...toEmailLockItem(account) },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ],
        }),
      );
    } catch (error: unknown) {
      throw this.translateCreateFailure(error, account.email);
    }
  }

  // Any error other than the lock's own condition failing (including a
  // cancellation whose reason at this index is undefined, e.g. because the
  // OTHER item in the transaction is what failed) propagates untranslated,
  // per FR23/errors.ts's "no typed error for the unexpected" policy.
  private translateCreateFailure(error: unknown, email: EmailAddress): unknown {
    if (
      error instanceof TransactionCanceledException &&
      error.CancellationReasons?.[EMAIL_LOCK_TRANSACT_ITEM_INDEX]?.Code ===
        CONDITIONAL_CHECK_FAILED_CODE
    ) {
      return new EmailAlreadyRegisteredError(email.toString());
    }
    return error;
  }

  async findByEmail(email: EmailAddress): Promise<Account | undefined> {
    const lock = await this.documentClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: buildEmailLockKey(email.toString()),
        ConsistentRead: true,
      }),
    );
    const accountId = lock.Item?.user_id as string | undefined;
    if (accountId === undefined) {
      await this.findById(DUMMY_ACCOUNT_ID);
      return undefined;
    }
    return this.findById(accountId);
  }

  async findById(accountId: string): Promise<Account | undefined> {
    const result = await this.documentClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: buildAccountKey(accountId),
        ConsistentRead: true,
      }),
    );
    if (result.Item === undefined) {
      return undefined;
    }
    return toAccount({ ...result.Item, id: accountId });
  }
}
