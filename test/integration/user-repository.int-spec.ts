/**
 * AC-4: two concurrent registrations for the same normalized email must not
 * both succeed. This is exactly what a mocked-response unit test cannot
 * prove — it needs a real DynamoDB engine racing two `TransactWriteCommand`s
 * against the same conditional email-lock `Put` (plan.md: integration tests
 * are "reserved for what only the real engine can prove").
 *
 * Environment: dummy credentials passed directly to the client config
 * (DynamoDB Local ignores their value but the SDK still requires something
 * present before it will sign a request) plus the local compose endpoint —
 * no `.env`/shell export needed, and `test/jest-integration.json` stays
 * untouched. `beforeAll` calls `ensureTableExists` once per suite; every
 * test below uses its own randomly generated email/id so no truncation
 * between tests is needed (DynamoDB Local has no cheap "truncate").
 */

import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { ensureTableExists } from '../../scripts/create-table';
import { DynamoUserRepository } from '../../src/auth/infrastructure/dynamo/user.repository';
import { Account } from '../../src/auth/domain/account';
import { EmailAddress } from '../../src/auth/domain/email-address';
import { PasswordDigest } from '../../src/auth/domain/password-digest';
import { EmailAlreadyRegisteredError } from '../../src/auth/domain/errors';

const TABLE_NAME = 'stockroom-auth-integration-test';
const AWS_REGION = 'us-east-1';
const DYNAMODB_ENDPOINT = 'http://localhost:8000';
const DUMMY_CREDENTIALS = { accessKeyId: 'local', secretAccessKey: 'local' };

function buildLocalDynamoClient(): DynamoDBClient {
  return new DynamoDBClient({
    region: AWS_REGION,
    endpoint: DYNAMODB_ENDPOINT,
    credentials: DUMMY_CREDENTIALS,
  });
}

describe('DynamoUserRepository (integration)', () => {
  let userRepository: DynamoUserRepository;

  beforeAll(async () => {
    const client = buildLocalDynamoClient();
    await ensureTableExists(client, TABLE_NAME);
    const documentClient = DynamoDBDocumentClient.from(client);
    userRepository = new DynamoUserRepository(documentClient, TABLE_NAME);
  });

  it('lets exactly one of two concurrent same-email registrations win (AC-4)', async () => {
    const email = EmailAddress.parse(`concurrent-${randomUUID()}@example.com`);
    const passwordDigest = PasswordDigest.fromHash('argon2id$fake-hash');
    const firstAccount = new Account(randomUUID(), email, passwordDigest, 0);
    const secondAccount = new Account(randomUUID(), email, passwordDigest, 0);

    const results = await Promise.allSettled([
      userRepository.create(firstAccount),
      userRepository.create(secondAccount),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejections = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    expect(rejections).toHaveLength(1);
    expect(rejections[0]?.reason).toBeInstanceOf(EmailAlreadyRegisteredError);

    const winnerIsFirst = results[0]?.status === 'fulfilled';
    const winner = winnerIsFirst ? firstAccount : secondAccount;
    const loser = winnerIsFirst ? secondAccount : firstAccount;

    await expect(userRepository.findById(loser.id)).resolves.toBeUndefined();
    const resolved = await userRepository.findByEmail(email);
    expect(resolved?.id).toBe(winner.id);
  });

  it('issues the same number of storage reads for a registered and an unregistered email, closing the residual timing side-channel (AC-6)', async () => {
    const documentClient = (
      userRepository as unknown as { documentClient: DynamoDBDocumentClient }
    ).documentClient;
    const sendSpy = jest.spyOn(documentClient, 'send');
    const registeredEmail = EmailAddress.parse(
      `read-count-${randomUUID()}@example.com`,
    );
    await userRepository.create(
      new Account(
        randomUUID(),
        registeredEmail,
        PasswordDigest.fromHash('argon2id$fake-hash'),
        0,
      ),
    );

    sendSpy.mockClear();
    await userRepository.findByEmail(registeredEmail);
    const registeredCallCount = sendSpy.mock.calls.length;

    sendSpy.mockClear();
    await userRepository.findByEmail(
      EmailAddress.parse(`unregistered-${randomUUID()}@example.com`),
    );
    const unregisteredCallCount = sendSpy.mock.calls.length;

    sendSpy.mockRestore();
    expect(unregisteredCallCount).toBe(registeredCallCount);
  });
});
