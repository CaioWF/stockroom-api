import { createHash, randomBytes } from 'node:crypto';

import { RefreshTokenAccountNotFoundError } from '../../../../src/auth/application/refresh-token-account-not-found.error';
import { RotateRefreshToken } from '../../../../src/auth/application/rotate-refresh-token.usecase';
import { Account } from '../../../../src/auth/domain/account';
import { EmailAddress } from '../../../../src/auth/domain/email-address';
import { PasswordDigest } from '../../../../src/auth/domain/password-digest';
import { RefreshToken } from '../../../../src/auth/domain/refresh-token';
import { RefreshTokenCredential } from '../../../../src/auth/domain/refresh-token-credential';
import { InMemoryUserRepository } from '../../../fakes/in-memory-user-repository';
import { InMemoryRefreshTokenRepository } from '../../../fakes/in-memory-refresh-token-repository';
import { PassThroughAccessTokenSigner } from '../../../fakes/pass-through-access-token-signer';
import { SequentialIdGenerator } from '../../../fakes/sequential-id-generator';
import { ControllableClock } from '../../../fakes/controllable-clock';

const ACCESS_TOKEN_TTL_SECONDS = 900;
const REFRESH_TOKEN_TTL_SECONDS = 604800; // 7 days
const SESSION_CEILING_SECONDS = 2592000; // 30 days
const NOW = new Date('2026-01-01T00:00:00.000Z');
const REFRESH_SECRET_BYTE_LENGTH = 32;
const MILLISECONDS_PER_SECOND = 1000;

function buildRotateRefreshToken(clock: ControllableClock): {
  rotateRefreshToken: RotateRefreshToken;
  userRepository: InMemoryUserRepository;
  refreshTokenRepository: InMemoryRefreshTokenRepository;
  idGenerator: SequentialIdGenerator;
} {
  const userRepository = new InMemoryUserRepository();
  const refreshTokenRepository = new InMemoryRefreshTokenRepository();
  const idGenerator = new SequentialIdGenerator();
  const rotateRefreshToken = new RotateRefreshToken(
    refreshTokenRepository,
    userRepository,
    new PassThroughAccessTokenSigner(),
    idGenerator,
    clock,
    ACCESS_TOKEN_TTL_SECONDS,
    REFRESH_TOKEN_TTL_SECONDS,
    SESSION_CEILING_SECONDS,
  );
  return {
    rotateRefreshToken,
    userRepository,
    refreshTokenRepository,
    idGenerator,
  };
}

// Registers a fixture account directly through the repository, sharing the
// use case's own SequentialIdGenerator so the minted account id is
// deterministic and UUIDv7-shaped, matching what RefreshTokenCredential.parse
// requires of the wire tokens built below.
async function registerFixtureAccount(
  userRepository: InMemoryUserRepository,
  idGenerator: SequentialIdGenerator,
  email: string,
): Promise<string> {
  const accountId = idGenerator.newId();
  await userRepository.create(
    new Account(
      accountId,
      EmailAddress.parse(email),
      PasswordDigest.fromHash('fixture-digest'),
      0,
    ),
  );
  return accountId;
}

// Mints and persists a token exactly the way AuthenticateAccount.issueRefreshToken
// does (same mechanics the use case under test uses for a successor), so
// tests exercise the real repository/digest path rather than an outcome
// hand-built to look right.
async function issueToken(
  refreshTokenRepository: InMemoryRefreshTokenRepository,
  idGenerator: SequentialIdGenerator,
  accountId: string,
  sessionStartedAt: Date,
  expiresAt: Date,
  tokenGeneration = 0,
): Promise<{ wireToken: string; tokenId: string }> {
  const tokenId = idGenerator.newId();
  const secret = randomBytes(REFRESH_SECRET_BYTE_LENGTH).toString('base64url');
  const digest = createHash('sha256').update(secret).digest('hex');
  await refreshTokenRepository.issue(
    new RefreshToken(
      accountId,
      tokenId,
      digest,
      tokenGeneration,
      sessionStartedAt,
      expiresAt,
      undefined,
      undefined,
    ),
  );
  return { wireToken: `${accountId}.${tokenId}.${secret}`, tokenId };
}

describe('RotateRefreshToken', () => {
  it('rotates a live token to a new pair and refuses the original afterward (AC-14)', async () => {
    const clock = new ControllableClock(NOW);
    const {
      rotateRefreshToken,
      userRepository,
      refreshTokenRepository,
      idGenerator,
    } = buildRotateRefreshToken(clock);
    const accountId = await registerFixtureAccount(
      userRepository,
      idGenerator,
      'rotate-happy@example.com',
    );
    const { wireToken, tokenId } = await issueToken(
      refreshTokenRepository,
      idGenerator,
      accountId,
      NOW,
      new Date(
        NOW.getTime() + REFRESH_TOKEN_TTL_SECONDS * MILLISECONDS_PER_SECOND,
      ),
    );

    const outcome = await rotateRefreshToken.execute(
      RefreshTokenCredential.parse(wireToken),
    );

    expect(outcome.kind).toBe('rotated');
    if (outcome.kind !== 'rotated') {
      throw new Error('unreachable: asserted above');
    }
    expect(outcome.expiresIn).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(outcome.refreshExpiresIn).toBe(REFRESH_TOKEN_TTL_SECONDS);

    const successorCredential = RefreshTokenCredential.parse(
      outcome.refreshToken,
    );
    const storedSuccessor = await refreshTokenRepository.findByIds(
      accountId,
      successorCredential.getTokenId(),
    );
    expect(storedSuccessor?.retiredAt).toBeUndefined();

    const storedPresented = await refreshTokenRepository.findByIds(
      accountId,
      tokenId,
    );
    expect(storedPresented?.retiredAt).toBeInstanceOf(Date);

    const replayOutcome = await rotateRefreshToken.execute(
      RefreshTokenCredential.parse(wireToken),
    );
    expect(replayOutcome.kind).not.toBe('rotated');
  });

  it('classifies a replay of a retired token as benign when its successor is still the live tip, leaving the successor untouched (AC-15)', async () => {
    const clock = new ControllableClock(NOW);
    const {
      rotateRefreshToken,
      userRepository,
      refreshTokenRepository,
      idGenerator,
    } = buildRotateRefreshToken(clock);
    const accountId = await registerFixtureAccount(
      userRepository,
      idGenerator,
      'benign-replay@example.com',
    );
    const { wireToken: tokenA } = await issueToken(
      refreshTokenRepository,
      idGenerator,
      accountId,
      NOW,
      new Date(
        NOW.getTime() + REFRESH_TOKEN_TTL_SECONDS * MILLISECONDS_PER_SECOND,
      ),
    );

    const rotationOutcome = await rotateRefreshToken.execute(
      RefreshTokenCredential.parse(tokenA),
    );
    if (rotationOutcome.kind !== 'rotated') {
      throw new Error(
        'fixture setup failed: expected the first rotation to commit',
      );
    }
    const tokenB = rotationOutcome.refreshToken;

    const replayOutcome = await rotateRefreshToken.execute(
      RefreshTokenCredential.parse(tokenA),
    );
    expect(replayOutcome).toEqual({ kind: 'benign-replay', accountId });

    const secondRotationOutcome = await rotateRefreshToken.execute(
      RefreshTokenCredential.parse(tokenB),
    );
    expect(secondRotationOutcome.kind).toBe('rotated');
  });

  it('classifies a replay of a doubly-retired token as reuse, revoking the generation so even the live tip is subsequently refused (AC-16)', async () => {
    const clock = new ControllableClock(NOW);
    const {
      rotateRefreshToken,
      userRepository,
      refreshTokenRepository,
      idGenerator,
    } = buildRotateRefreshToken(clock);
    const accountId = await registerFixtureAccount(
      userRepository,
      idGenerator,
      'reuse-detected@example.com',
    );
    const { wireToken: tokenA } = await issueToken(
      refreshTokenRepository,
      idGenerator,
      accountId,
      NOW,
      new Date(
        NOW.getTime() + REFRESH_TOKEN_TTL_SECONDS * MILLISECONDS_PER_SECOND,
      ),
    );

    const firstRotation = await rotateRefreshToken.execute(
      RefreshTokenCredential.parse(tokenA),
    );
    if (firstRotation.kind !== 'rotated') {
      throw new Error('fixture setup failed: expected A -> B to commit');
    }
    const tokenB = firstRotation.refreshToken;

    const secondRotation = await rotateRefreshToken.execute(
      RefreshTokenCredential.parse(tokenB),
    );
    if (secondRotation.kind !== 'rotated') {
      throw new Error('fixture setup failed: expected B -> C to commit');
    }
    const tokenC = secondRotation.refreshToken;

    const reuseOutcome = await rotateRefreshToken.execute(
      RefreshTokenCredential.parse(tokenA),
    );
    expect(reuseOutcome).toEqual({ kind: 'reuse-detected', accountId });

    // AC-16's "including the live tip": C was never touched by the replay of
    // A, yet revokeAll bumped the account generation C was minted under, so
    // presenting the still-untouched live tip is refused too.
    const liveTipOutcome = await rotateRefreshToken.execute(
      RefreshTokenCredential.parse(tokenC),
    );
    expect(liveTipOutcome).toEqual({ kind: 'expired' });
  });

  it('refuses a token whose own lifetime has passed the injected clock (AC-18)', async () => {
    const clock = new ControllableClock(NOW);
    const {
      rotateRefreshToken,
      userRepository,
      refreshTokenRepository,
      idGenerator,
    } = buildRotateRefreshToken(clock);
    const accountId = await registerFixtureAccount(
      userRepository,
      idGenerator,
      'expired-token@example.com',
    );
    const sessionStartedAt = new Date(NOW.getTime() - 1000);
    const expiresAt = NOW;
    const { wireToken } = await issueToken(
      refreshTokenRepository,
      idGenerator,
      accountId,
      sessionStartedAt,
      expiresAt,
    );

    const outcome = await rotateRefreshToken.execute(
      RefreshTokenCredential.parse(wireToken),
    );

    expect(outcome).toEqual({ kind: 'expired' });
  });

  it('refuses a token whose own lifetime has not passed but whose absolute session ceiling has (AC-18)', async () => {
    const clock = new ControllableClock(NOW);
    const {
      rotateRefreshToken,
      userRepository,
      refreshTokenRepository,
      idGenerator,
    } = buildRotateRefreshToken(clock);
    const accountId = await registerFixtureAccount(
      userRepository,
      idGenerator,
      'ceiling-reached@example.com',
    );
    // Session began further back than the ceiling allows; the token's own
    // expiresAt is set implausibly far in the future so only the ceiling
    // check — not the token's own expiry — can be what refuses it.
    const sessionStartedAt = new Date(
      NOW.getTime() - (SESSION_CEILING_SECONDS + 1) * MILLISECONDS_PER_SECOND,
    );
    const expiresAt = new Date(
      NOW.getTime() + 1_000_000 * MILLISECONDS_PER_SECOND,
    );
    const { wireToken } = await issueToken(
      refreshTokenRepository,
      idGenerator,
      accountId,
      sessionStartedAt,
      expiresAt,
    );

    const outcome = await rotateRefreshToken.execute(
      RefreshTokenCredential.parse(wireToken),
    );

    expect(outcome).toEqual({ kind: 'expired' });
  });

  it('clamps the successor lifetime to the remaining session ceiling, not the full refresh TTL (AC-19)', async () => {
    const clock = new ControllableClock(NOW);
    const {
      rotateRefreshToken,
      userRepository,
      refreshTokenRepository,
      idGenerator,
    } = buildRotateRefreshToken(clock);
    const accountId = await registerFixtureAccount(
      userRepository,
      idGenerator,
      'ceiling-clamp@example.com',
    );
    const remainingCeilingSeconds = 100;
    // sessionStartedAt is placed so the ceiling (sessionStartedAt + 30 days)
    // lands only 100s from now — far less than the 7-day refresh TTL a normal
    // rotation would otherwise grant.
    const sessionStartedAt = new Date(
      NOW.getTime() -
        (SESSION_CEILING_SECONDS - remainingCeilingSeconds) *
          MILLISECONDS_PER_SECOND,
    );
    const expiresAt = new Date(
      NOW.getTime() + REFRESH_TOKEN_TTL_SECONDS * MILLISECONDS_PER_SECOND,
    );
    const { wireToken } = await issueToken(
      refreshTokenRepository,
      idGenerator,
      accountId,
      sessionStartedAt,
      expiresAt,
    );

    const outcome = await rotateRefreshToken.execute(
      RefreshTokenCredential.parse(wireToken),
    );

    if (outcome.kind !== 'rotated') {
      throw new Error('expected the rotation to commit under the ceiling');
    }
    expect(outcome.refreshExpiresIn).toBe(remainingCeilingSeconds);
    expect(outcome.refreshExpiresIn).toBeLessThan(REFRESH_TOKEN_TTL_SECONDS);
  });

  it('returns unknown for the right ids but a wrong secret, never revealing the token exists (FR15)', async () => {
    const clock = new ControllableClock(NOW);
    const {
      rotateRefreshToken,
      userRepository,
      refreshTokenRepository,
      idGenerator,
    } = buildRotateRefreshToken(clock);
    const accountId = await registerFixtureAccount(
      userRepository,
      idGenerator,
      'wrong-secret@example.com',
    );
    const { tokenId } = await issueToken(
      refreshTokenRepository,
      idGenerator,
      accountId,
      NOW,
      new Date(
        NOW.getTime() + REFRESH_TOKEN_TTL_SECONDS * MILLISECONDS_PER_SECOND,
      ),
    );
    const wrongSecret = randomBytes(REFRESH_SECRET_BYTE_LENGTH).toString(
      'base64url',
    );
    const wireTokenWithWrongSecret = `${accountId}.${tokenId}.${wrongSecret}`;

    const outcome = await rotateRefreshToken.execute(
      RefreshTokenCredential.parse(wireTokenWithWrongSecret),
    );

    expect(outcome).toEqual({ kind: 'unknown' });
  });

  it('returns unknown for a token id that was never issued', async () => {
    const clock = new ControllableClock(NOW);
    const { rotateRefreshToken, userRepository, idGenerator } =
      buildRotateRefreshToken(clock);
    const accountId = await registerFixtureAccount(
      userRepository,
      idGenerator,
      'never-issued@example.com',
    );
    const neverIssuedTokenId = idGenerator.newId();
    const secret = randomBytes(REFRESH_SECRET_BYTE_LENGTH).toString(
      'base64url',
    );
    const wireToken = `${accountId}.${neverIssuedTokenId}.${secret}`;

    const outcome = await rotateRefreshToken.execute(
      RefreshTokenCredential.parse(wireToken),
    );

    expect(outcome).toEqual({ kind: 'unknown' });
  });

  it('throws a typed RefreshTokenAccountNotFoundError when a live token references an account that no longer exists (Finding 4)', async () => {
    const clock = new ControllableClock(NOW);
    const { rotateRefreshToken, refreshTokenRepository, idGenerator } =
      buildRotateRefreshToken(clock);
    // Deliberately never registered through userRepository — issued
    // directly against an account id that findById will never resolve, the
    // same referential-integrity violation buildRotatedOutcome guards
    // against.
    const orphanedAccountId = idGenerator.newId();
    const { wireToken } = await issueToken(
      refreshTokenRepository,
      idGenerator,
      orphanedAccountId,
      NOW,
      new Date(
        NOW.getTime() + REFRESH_TOKEN_TTL_SECONDS * MILLISECONDS_PER_SECOND,
      ),
    );

    await expect(
      rotateRefreshToken.execute(RefreshTokenCredential.parse(wireToken)),
    ).rejects.toThrow(RefreshTokenAccountNotFoundError);
  });
});
