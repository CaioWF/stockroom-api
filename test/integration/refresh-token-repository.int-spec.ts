/**
 * AC-17: two concurrent rotations presenting the same live refresh token
 * must not both retire it and mint a successor — only a real transactional
 * engine racing the presented token's `attribute_not_exists(rotated_at)`
 * condition can prove this (plan.md: integration tests are "reserved for
 * what only the real engine can prove"); a mocked-response unit test would
 * pass even if the condition expression were silently wrong.
 *
 * Same local-DynamoDB environment as `user-repository.int-spec.ts` (dummy
 * credentials in the client config, local compose endpoint, no shell/
 * jest-config environment needed). The account row `rotate`'s
 * `ConditionCheck` reads is written first via `DynamoUserRepository`, so
 * this suite exercises the real cross-repository transaction shape rather
 * than a hand-crafted item.
 */

import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { ensureTableExists } from '../../scripts/create-table';
import { DynamoUserRepository } from '../../src/auth/infrastructure/dynamo/user.repository';
import { DynamoRefreshTokenRepository } from '../../src/auth/infrastructure/dynamo/refresh-token.repository';
import { Account } from '../../src/auth/domain/account';
import { EmailAddress } from '../../src/auth/domain/email-address';
import { PasswordDigest } from '../../src/auth/domain/password-digest';
import { RefreshToken } from '../../src/auth/domain/refresh-token';
import { RefreshTokenRotationResult } from '../../src/auth/domain/ports/refresh-token-repository';

const TABLE_NAME = 'stockroom-auth-integration-test';
const AWS_REGION = 'us-east-1';
const DYNAMODB_ENDPOINT = 'http://localhost:8000';
const DUMMY_CREDENTIALS = { accessKeyId: 'local', secretAccessKey: 'local' };
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function buildLocalDynamoClient(): DynamoDBClient {
  return new DynamoDBClient({
    region: AWS_REGION,
    endpoint: DYNAMODB_ENDPOINT,
    credentials: DUMMY_CREDENTIALS,
  });
}

async function seedAccount(
  userRepository: DynamoUserRepository,
): Promise<string> {
  const accountId = randomUUID();
  const account = new Account(
    accountId,
    EmailAddress.parse(`rotate-${randomUUID()}@example.com`),
    PasswordDigest.fromHash('argon2id$fake-hash'),
    0,
  );
  await userRepository.create(account);
  return accountId;
}

function buildToken(
  accountId: string,
  tokenId: string,
  digest: string,
): RefreshToken {
  const sessionStartedAt = new Date();
  const expiresAt = new Date(sessionStartedAt.getTime() + SEVEN_DAYS_MS);
  return new RefreshToken(
    accountId,
    tokenId,
    digest,
    0,
    sessionStartedAt,
    expiresAt,
    undefined,
    undefined,
  );
}

describe('DynamoRefreshTokenRepository (integration)', () => {
  let userRepository: DynamoUserRepository;
  let refreshTokenRepository: DynamoRefreshTokenRepository;

  beforeAll(async () => {
    const client = buildLocalDynamoClient();
    await ensureTableExists(client, TABLE_NAME);
    const documentClient = DynamoDBDocumentClient.from(client);
    userRepository = new DynamoUserRepository(documentClient, TABLE_NAME);
    refreshTokenRepository = new DynamoRefreshTokenRepository(
      documentClient,
      TABLE_NAME,
    );
  });

  it('lets exactly one of two concurrent rotations of the same token commit (AC-17)', async () => {
    const accountId = await seedAccount(userRepository);
    const presented = buildToken(accountId, randomUUID(), 'presented-digest');
    await refreshTokenRepository.issue(presented);

    const successorA = buildToken(
      accountId,
      randomUUID(),
      'successor-a-digest',
    );
    const successorB = buildToken(
      accountId,
      randomUUID(),
      'successor-b-digest',
    );

    const results = await Promise.allSettled([
      refreshTokenRepository.rotate(presented, successorA),
      refreshTokenRepository.rotate(presented, successorB),
    ]);

    const outcomes = results.map((result) =>
      result.status === 'fulfilled' ? result.value : undefined,
    );
    expect(outcomes.every((outcome) => outcome !== undefined)).toBe(true);
    const committed = outcomes.filter(
      (outcome): outcome is RefreshTokenRotationResult =>
        outcome?.kind === 'committed',
    );
    const conditionFailed = outcomes.filter(
      (outcome) => outcome?.kind === 'condition-failed',
    );
    expect(committed).toHaveLength(1);
    expect(conditionFailed).toHaveLength(1);

    const winnerIsA = outcomes[0]?.kind === 'committed';
    const winnerSuccessor = winnerIsA ? successorA : successorB;
    const loserSuccessor = winnerIsA ? successorB : successorA;

    await expect(
      refreshTokenRepository.findByIds(accountId, winnerSuccessor.tokenId),
    ).resolves.toBeDefined();
    await expect(
      refreshTokenRepository.findByIds(accountId, loserSuccessor.tokenId),
    ).resolves.toBeUndefined();

    const retiredPresented = await refreshTokenRepository.findByIds(
      accountId,
      presented.tokenId,
    );
    expect(retiredPresented?.retiredAt).toBeInstanceOf(Date);
    expect(retiredPresented?.successorTokenId).toBe(winnerSuccessor.tokenId);
  });

  it("resolves nothing for a credential naming one account with another account's token id (AC-21)", async () => {
    const accountAId = await seedAccount(userRepository);
    const accountBId = await seedAccount(userRepository);

    const tokenForA = buildToken(accountAId, randomUUID(), 'a-token-digest');
    await refreshTokenRepository.issue(tokenForA);

    // This is the exact lookup `RotateRefreshToken.execute` performs against
    // a presented credential (see rotate-refresh-token.usecase.ts), so it is
    // the real request path AC-21 must hold on, not an unrelated call.
    await expect(
      refreshTokenRepository.findByIds(accountBId, tokenForA.tokenId),
    ).resolves.toBeUndefined();

    // The token is still resolvable under its real account, proving the
    // miss above is caused by the account/token pairing, not by the token
    // never having been issued.
    await expect(
      refreshTokenRepository.findByIds(accountAId, tokenForA.tokenId),
    ).resolves.toBeDefined();
  });
});
