import { InMemoryRefreshTokenRepository } from '../../fakes/in-memory-refresh-token-repository';
import { RefreshToken } from '../../../src/auth/domain/refresh-token';

const ACCOUNT_ID = '018f1c9a-1234-7abc-89ab-0123456789ab';
const PRESENTED_TOKEN_ID = '018f1c9a-5678-7def-9abc-fedcba987654';
const SUCCESSOR_TOKEN_ID = '018f1c9a-9999-7aaa-8bbb-fedcba987654';
const OTHER_SUCCESSOR_TOKEN_ID = '018f1c9a-8888-7ccc-8ddd-fedcba987654';
const DIGEST = 'a'.repeat(64);
const SESSION_STARTED_AT = new Date('2026-09-01T00:00:00.000Z');
const EXPIRES_AT = new Date('2026-09-08T00:00:00.000Z');

function buildToken(
  tokenId: string,
  generation: number,
  retiredAt: Date | undefined = undefined,
  successorTokenId: string | undefined = undefined,
): RefreshToken {
  return new RefreshToken(
    ACCOUNT_ID,
    tokenId,
    DIGEST,
    generation,
    SESSION_STARTED_AT,
    EXPIRES_AT,
    retiredAt,
    successorTokenId,
  );
}

describe('InMemoryRefreshTokenRepository', () => {
  it('finds an issued token by account and token id', async () => {
    const repository = new InMemoryRefreshTokenRepository();
    const token = buildToken(PRESENTED_TOKEN_ID, 0);

    await repository.issue(token);

    await expect(
      repository.findByIds(ACCOUNT_ID, PRESENTED_TOKEN_ID),
    ).resolves.toBe(token);
  });

  it('returns undefined for ids with no issued token', async () => {
    const repository = new InMemoryRefreshTokenRepository();

    await expect(
      repository.findByIds(ACCOUNT_ID, 'missing-token-id'),
    ).resolves.toBeUndefined();
  });

  it('commits rotation, retiring the presented token and storing the successor live', async () => {
    const repository = new InMemoryRefreshTokenRepository();
    const presented = buildToken(PRESENTED_TOKEN_ID, 0);
    const successor = buildToken(SUCCESSOR_TOKEN_ID, 0);
    await repository.issue(presented);

    const result = await repository.rotate(presented, successor);

    expect(result).toEqual({ kind: 'committed' });
    const retired = await repository.findByIds(ACCOUNT_ID, PRESENTED_TOKEN_ID);
    expect(retired?.retiredAt).toBeInstanceOf(Date);
    expect(retired?.successorTokenId).toBe(SUCCESSOR_TOKEN_ID);
    const stored = await repository.findByIds(ACCOUNT_ID, SUCCESSOR_TOKEN_ID);
    expect(stored?.retiredAt).toBeUndefined();
  });

  it('fails rotation when the presented token is already retired', async () => {
    const repository = new InMemoryRefreshTokenRepository();
    const presented = buildToken(PRESENTED_TOKEN_ID, 0);
    const successor = buildToken(SUCCESSOR_TOKEN_ID, 0);
    await repository.issue(presented);
    await repository.rotate(presented, successor);

    const replaySuccessor = buildToken(OTHER_SUCCESSOR_TOKEN_ID, 0);
    const result = await repository.rotate(presented, replaySuccessor);

    expect(result).toEqual({ kind: 'condition-failed' });
  });

  it('fails rotation when the account generation has moved since the token was minted', async () => {
    const repository = new InMemoryRefreshTokenRepository();
    const presented = buildToken(PRESENTED_TOKEN_ID, 0);
    const successor = buildToken(SUCCESSOR_TOKEN_ID, 0);
    await repository.issue(presented);
    repository.setAccountGeneration(ACCOUNT_ID, 1);

    const result = await repository.rotate(presented, successor);

    expect(result).toEqual({ kind: 'condition-failed' });
  });

  it('advances the account generation by exactly one, failing rotation for a token minted at the prior generation', async () => {
    const repository = new InMemoryRefreshTokenRepository();
    const priorGenerationToken = buildToken(PRESENTED_TOKEN_ID, 0);
    await repository.issue(priorGenerationToken);

    await repository.revokeAll(ACCOUNT_ID);

    const priorGenerationResult = await repository.rotate(
      priorGenerationToken,
      buildToken(SUCCESSOR_TOKEN_ID, 0),
    );
    expect(priorGenerationResult).toEqual({ kind: 'condition-failed' });

    // A separately issued token stamped with exactly the post-revoke
    // generation (1, not 2 or more) rotates cleanly — proving the single
    // call advanced the counter by exactly one, not further.
    const currentGenerationToken = buildToken(OTHER_SUCCESSOR_TOKEN_ID, 1);
    await repository.issue(currentGenerationToken);
    const currentGenerationResult = await repository.rotate(
      currentGenerationToken,
      buildToken(SUCCESSOR_TOKEN_ID, 1),
    );
    expect(currentGenerationResult).toEqual({ kind: 'committed' });
  });

  it('lets exactly one of two concurrent rotations against the same presented token commit', async () => {
    const repository = new InMemoryRefreshTokenRepository();
    const presented = buildToken(PRESENTED_TOKEN_ID, 0);
    await repository.issue(presented);
    const raceSuccessorA = buildToken(SUCCESSOR_TOKEN_ID, 0);
    const raceSuccessorB = buildToken(OTHER_SUCCESSOR_TOKEN_ID, 0);

    const [resultA, resultB] = await Promise.all([
      repository.rotate(presented, raceSuccessorA),
      repository.rotate(presented, raceSuccessorB),
    ]);

    const outcomes = [resultA.kind, resultB.kind];
    expect(outcomes.filter((kind) => kind === 'committed')).toHaveLength(1);
    expect(outcomes.filter((kind) => kind === 'condition-failed')).toHaveLength(
      1,
    );
  });
});
