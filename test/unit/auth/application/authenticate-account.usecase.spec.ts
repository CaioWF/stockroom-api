import { createHash } from 'node:crypto';

import { AuthenticateAccount } from '../../../../src/auth/application/authenticate-account.usecase';
import { Account } from '../../../../src/auth/domain/account';
import { EmailAddress } from '../../../../src/auth/domain/email-address';
import { RawPassword } from '../../../../src/auth/domain/raw-password';
import { InvalidCredentialsError } from '../../../../src/auth/domain/errors';
import { RefreshTokenCredential } from '../../../../src/auth/domain/refresh-token-credential';
import { InMemoryUserRepository } from '../../../fakes/in-memory-user-repository';
import { InMemoryRefreshTokenRepository } from '../../../fakes/in-memory-refresh-token-repository';
import { PassThroughPasswordHasher } from '../../../fakes/pass-through-password-hasher';
import { PassThroughAccessTokenSigner } from '../../../fakes/pass-through-access-token-signer';
import { SequentialIdGenerator } from '../../../fakes/sequential-id-generator';
import { ControllableClock } from '../../../fakes/controllable-clock';

const PASSWORD = 'correct horse battery';
const ACCESS_TOKEN_TTL_SECONDS = 900;
const REFRESH_TOKEN_TTL_SECONDS = 604800;
const NOW = new Date('2026-01-01T00:00:00.000Z');

function buildAuthenticateAccount(): {
  authenticateAccount: AuthenticateAccount;
  userRepository: InMemoryUserRepository;
  refreshTokenRepository: InMemoryRefreshTokenRepository;
  idGenerator: SequentialIdGenerator;
} {
  const userRepository = new InMemoryUserRepository();
  const refreshTokenRepository = new InMemoryRefreshTokenRepository();
  const idGenerator = new SequentialIdGenerator();
  const clock = new ControllableClock(NOW);
  const authenticateAccount = new AuthenticateAccount(
    userRepository,
    new PassThroughPasswordHasher(),
    new PassThroughAccessTokenSigner(),
    refreshTokenRepository,
    idGenerator,
    clock,
    ACCESS_TOKEN_TTL_SECONDS,
    REFRESH_TOKEN_TTL_SECONDS,
  );
  return {
    authenticateAccount,
    userRepository,
    refreshTokenRepository,
    idGenerator,
  };
}

// Registers a fixture account directly through the repository — the id comes
// from the same SequentialIdGenerator the use case under test shares, so the
// minted account id is deterministic and assertable.
async function registerFixtureAccount(
  userRepository: InMemoryUserRepository,
  idGenerator: SequentialIdGenerator,
  email: string,
  password: string,
): Promise<string> {
  const hasher = new PassThroughPasswordHasher();
  const accountId = idGenerator.newId();
  const digest = await hasher.hash(RawPassword.parse(password));
  await userRepository.create(
    new Account(accountId, EmailAddress.parse(email), digest, 0),
  );
  return accountId;
}

describe('AuthenticateAccount', () => {
  it('signs in with correct credentials, returning both tokens and both lifetimes in seconds (AC-5)', async () => {
    const {
      authenticateAccount,
      userRepository,
      refreshTokenRepository,
      idGenerator,
    } = buildAuthenticateAccount();
    const accountId = await registerFixtureAccount(
      userRepository,
      idGenerator,
      'sign-in@example.com',
      PASSWORD,
    );

    const result = await authenticateAccount.execute(
      EmailAddress.parse('sign-in@example.com'),
      RawPassword.parse(PASSWORD),
    );

    expect(result.expiresIn).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(result.refreshExpiresIn).toBe(REFRESH_TOKEN_TTL_SECONDS);
    expect(typeof result.accessToken).toBe('string');

    const credential = RefreshTokenCredential.parse(result.refreshToken);
    expect(credential.getAccountId()).toBe(accountId);

    const stored = await refreshTokenRepository.findByIds(
      accountId,
      credential.getTokenId(),
    );
    expect(stored).toBeDefined();
    const expectedDigest = createHash('sha256')
      .update(credential.getSecret())
      .digest('hex');
    expect(stored!.digest).toBe(expectedDigest);
    expect(stored!.digest).not.toBe(credential.getSecret());
    expect(stored!.tokenGeneration).toBe(0);
    expect(stored!.sessionStartedAt).toEqual(NOW);
    expect(stored!.expiresAt).toEqual(
      new Date(NOW.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    );
    expect(stored!.retiredAt).toBeUndefined();
    expect(stored!.successorTokenId).toBeUndefined();
  });

  it('rejects a wrong password and an unknown address with byte-identical InvalidCredentialsError instances (AC-6)', async () => {
    const { authenticateAccount, userRepository, idGenerator } =
      buildAuthenticateAccount();
    await registerFixtureAccount(
      userRepository,
      idGenerator,
      'known@example.com',
      PASSWORD,
    );

    const wrongPasswordRejection = await authenticateAccount
      .execute(
        EmailAddress.parse('known@example.com'),
        RawPassword.parse('a totally different password'),
      )
      .catch((error: unknown) => error);

    const unknownAddressRejection = await authenticateAccount
      .execute(
        EmailAddress.parse('nobody-registered@example.com'),
        RawPassword.parse(PASSWORD),
      )
      .catch((error: unknown) => error);

    expect(wrongPasswordRejection).toBeInstanceOf(InvalidCredentialsError);
    expect(unknownAddressRejection).toBeInstanceOf(InvalidCredentialsError);
    expect(JSON.stringify(wrongPasswordRejection)).toBe(
      JSON.stringify(unknownAddressRejection),
    );

    const ownProperties = (error: Error): Record<string, unknown> =>
      Object.fromEntries(
        Object.getOwnPropertyNames(error)
          .filter((property) => property !== 'stack')
          .map((property) => [
            property,
            (error as unknown as Record<string, unknown>)[property],
          ]),
      );
    expect(ownProperties(wrongPasswordRejection as Error)).toEqual(
      ownProperties(unknownAddressRejection as Error),
    );
  });

  it('pays the same password-verification cost on an unknown address as on a wrong password, closing the timing side-channel', async () => {
    const { userRepository, idGenerator } = buildAuthenticateAccount();
    await registerFixtureAccount(
      userRepository,
      idGenerator,
      'known@example.com',
      PASSWORD,
    );
    const hasher = new PassThroughPasswordHasher();
    const verifySpy = jest.spyOn(hasher, 'verify');
    const refreshTokenRepository = new InMemoryRefreshTokenRepository();
    const clock = new ControllableClock(NOW);
    const authenticateAccountWithSpy = new AuthenticateAccount(
      userRepository,
      hasher,
      new PassThroughAccessTokenSigner(),
      refreshTokenRepository,
      idGenerator,
      clock,
      ACCESS_TOKEN_TTL_SECONDS,
      REFRESH_TOKEN_TTL_SECONDS,
    );

    await authenticateAccountWithSpy
      .execute(
        EmailAddress.parse('nobody-registered@example.com'),
        RawPassword.parse(PASSWORD),
      )
      .catch(() => undefined);

    expect(verifySpy).toHaveBeenCalledTimes(1);
  });
});
