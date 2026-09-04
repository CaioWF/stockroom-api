/**
 * `RefreshTokenRepository` over the shared DynamoDB table (FR15-FR19,
 * AC-17, AC-21). Takes the document client and table name as plain
 * constructor args, same as `DynamoUserRepository` — Task 13's composition
 * root wires the real client in.
 *
 * `rotate`'s three-item transaction is the load-bearing part of this file:
 * a `ConditionCheck` on the account's generation, a conditional retirement
 * of the presented token, and an unconditional `Put` of the successor, all
 * three all-or-nothing. A `TransactionCanceledException` from either
 * condition failing returns `condition-failed` immediately, never retried —
 * retrying past a real condition failure risks granting a second successor
 * for the same presented token (AC-17's exact violation). A
 * `TransactionConflictException` (transient, non-business contention) is
 * safe to retry, same reasoning as `DynamoUserRepository.create`.
 */

import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  TransactionCanceledException,
  TransactionConflictException,
} from '@aws-sdk/client-dynamodb';

import { RefreshToken } from '../../domain/refresh-token';
import {
  RefreshTokenRepository,
  RefreshTokenRotationResult,
} from '../../domain/ports/refresh-token-repository';
import {
  buildAccountKey,
  buildRefreshTokenKey,
} from '../../../shared/persistence/table-keys';
import { toRefreshToken, toRefreshTokenItem } from './refresh-token.mapper';

// Same bounded-retry policy as `DynamoUserRepository.create`, for the same
// transient-contention reason — kept as its own constants here rather than
// a shared import, since this task's scope is exactly four files.
const MAX_TRANSACTION_CONFLICT_ATTEMPTS = 3;
const TRANSACTION_CONFLICT_RETRY_DELAY_MS = 20;

export class DynamoRefreshTokenRepository implements RefreshTokenRepository {
  constructor(
    private readonly documentClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async issue(token: RefreshToken): Promise<void> {
    await this.documentClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          ...buildRefreshTokenKey(token.accountId, token.tokenId),
          ...toRefreshTokenItem(token),
        },
      }),
    );
  }

  async findByIds(
    accountId: string,
    tokenId: string,
  ): Promise<RefreshToken | undefined> {
    const result = await this.documentClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: buildRefreshTokenKey(accountId, tokenId),
        ConsistentRead: true,
      }),
    );
    if (result.Item === undefined) {
      return undefined;
    }
    return toRefreshToken({ ...result.Item, accountId, tokenId });
  }

  // `for (;;)` (no bound in the test clause) rather than a counted loop:
  // every branch inside either returns or throws, so TypeScript's
  // control-flow analysis treats the code after the loop as unreachable —
  // the counted-loop form used by `DynamoUserRepository.create` needs no
  // such trick there only because `void` tolerates an implicit fallthrough.
  async rotate(
    presented: RefreshToken,
    successor: RefreshToken,
  ): Promise<RefreshTokenRotationResult> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.attemptRotate(presented, successor);
      } catch (error: unknown) {
        if (error instanceof TransactionCanceledException) {
          return { kind: 'condition-failed' };
        }
        if (
          !(error instanceof TransactionConflictException) ||
          attempt >= MAX_TRANSACTION_CONFLICT_ATTEMPTS
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

  private async attemptRotate(
    presented: RefreshToken,
    successor: RefreshToken,
  ): Promise<RefreshTokenRotationResult> {
    await this.documentClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: this.tableName,
              Key: buildAccountKey(presented.accountId),
              ConditionExpression: 'token_generation = :expected',
              ExpressionAttributeValues: {
                ':expected': presented.tokenGeneration,
              },
            },
          },
          {
            Update: {
              TableName: this.tableName,
              Key: buildRefreshTokenKey(presented.accountId, presented.tokenId),
              UpdateExpression:
                'SET rotated_at = :now, replaced_by = :successorId',
              ConditionExpression: 'attribute_not_exists(rotated_at)',
              ExpressionAttributeValues: {
                ':now': new Date().toISOString(),
                ':successorId': successor.tokenId,
              },
            },
          },
          {
            Put: {
              TableName: this.tableName,
              Item: {
                ...buildRefreshTokenKey(successor.accountId, successor.tokenId),
                ...toRefreshTokenItem(successor),
              },
            },
          },
        ],
      }),
    );
    return { kind: 'committed' };
  }

  async revokeAll(accountId: string): Promise<void> {
    await this.documentClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: buildAccountKey(accountId),
        UpdateExpression: 'SET token_generation = token_generation + :one',
        ExpressionAttributeValues: { ':one': 1 },
      }),
    );
  }
}
