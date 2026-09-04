/**
 * Signs an account in (FR6-FR8, FR15): resolves the account by email,
 * verifies the password digest, and — only on success — mints both an
 * access token and a refresh token.
 *
 * `execute`'s result shape mirrors the wire response `POST /auth/login`
 * returns (FR6), field-for-field the same names `RotationOutcome`'s
 * `RotatedOutcome` already uses for the equivalent refresh success, per the
 * naming lens's "one name per concept across layers":
 *   - `accessToken` — the signed JWT string.
 *   - `refreshToken` — the wire string `<accountId>.<tokenId>.<secret>`,
 *     built here to match exactly what `RefreshTokenCredential.parse` (the
 *     boundary parser Task 9 uses on the way back in) expects.
 *   - `expiresIn` / `refreshExpiresIn` — both lifetimes in seconds, relative
 *     to now, never a `Date` or milliseconds (FR6: a skewed client clock
 *     must still renew on time).
 *
 * Unknown address and wrong password reject identically with
 * `InvalidCredentialsError` (AC-6) — no reason field on that type, by
 * design, so the two branches below cannot accidentally produce two
 * different bodies.
 *
 * Two judgment calls, both argued in the task report:
 *   - The SHA-256 digest of the refresh secret is computed directly with
 *     `node:crypto` here, not through a port — the same reasoning
 *     `IdGenerator`'s own JSDoc already applies to secret generation: no
 *     test needs to control or assert on the digest's exact bytes, only
 *     that it is present and derived correctly, and swapping the hash
 *     algorithm is not a deployment-time concern the way argon2id's cost
 *     parameters are.
 *   - The access/refresh lifetimes arrive as plain numbers through the
 *     constructor rather than being read from the environment here — this
 *     layer takes no framework or `@aws-sdk` dependency, per the
 *     constitution — supplied by whatever composition root wires this use
 *     case up (Task 13), from the same `AppConfig.accessTokenTtlSeconds` /
 *     `refreshTokenTtlSeconds` fields `src/shared/config` already parses.
 */

import { createHash, randomBytes } from 'node:crypto';

import { Account } from '../domain/account';
import { EmailAddress } from '../domain/email-address';
import { PasswordDigest } from '../domain/password-digest';
import { RawPassword } from '../domain/raw-password';
import { RefreshToken } from '../domain/refresh-token';
import { InvalidCredentialsError } from '../domain/errors';
import { AccessTokenSigner } from '../domain/ports/access-token-signer';
import { Clock } from '../domain/ports/clock';
import { IdGenerator } from '../domain/ports/id-generator';
import { PasswordHasher } from '../domain/ports/password-hasher';
import { RefreshTokenRepository } from '../domain/ports/refresh-token-repository';
import { UserRepository } from '../domain/ports/user-repository';

// 256 bits of randomness (FR15) — the same width RefreshTokenCredential's
// SECRET_PATTERN expects once base64url-encoded (43 unpadded characters).
const REFRESH_SECRET_BYTE_LENGTH = 32;
const MILLISECONDS_PER_SECOND = 1000;

// A precomputed argon2id digest (same cost params as Argon2PasswordHasher:
// m=19456, t=2, p=1 — verify() reads them from this PHC string itself, not
// from any live config, so its cost matches a real digest's regardless of
// which password produced it) — verified against on the unknown-email path
// so both rejection branches pay the same argon2 cost and a timing
// side-channel can't re-enable email enumeration (AC-6).
const DUMMY_PASSWORD_DIGEST = PasswordDigest.fromHash(
  '$argon2id$v=19$m=19456,t=2,p=1$ojgTJHQWW6DDI2jUT04LtQ$oo6QAFWQlb/edlGNlBTa2QATaHaaJthV48wZhEhTKis',
);

export interface AuthenticateAccountResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly refreshExpiresIn: number;
}

export class AuthenticateAccount {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly accessTokenSigner: AccessTokenSigner,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly accessTokenTtlSeconds: number,
    private readonly refreshTokenTtlSeconds: number,
  ) {}

  async execute(
    email: EmailAddress,
    password: RawPassword,
  ): Promise<AuthenticateAccountResult> {
    const account = await this.verifyCredentials(email, password);
    const accessToken = await this.accessTokenSigner.sign({
      accountId: account.id,
      email: account.email,
    });
    const refreshToken = await this.issueRefreshToken(account);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenTtlSeconds,
      refreshExpiresIn: this.refreshTokenTtlSeconds,
    };
  }

  // Both rejection branches below throw the identical InvalidCredentialsError
  // (AC-6) and, since the unknown-email one also pays a dummy argon2 verify
  // (see file-top comment), cost comparable wall-clock time.
  private async verifyCredentials(
    email: EmailAddress,
    password: RawPassword,
  ): Promise<Account> {
    const account = await this.userRepository.findByEmail(email);
    if (account === undefined) {
      await this.passwordHasher.verify(password, DUMMY_PASSWORD_DIGEST);
      throw new InvalidCredentialsError();
    }

    const isPasswordValid = await this.passwordHasher.verify(
      password,
      account.passwordDigest,
    );
    if (!isPasswordValid) {
      throw new InvalidCredentialsError();
    }
    return account;
  }

  // Mints the token id and secret, persists only the secret's digest (FR15),
  // and returns the wire string built from the three raw parts this method
  // already has in hand — see the file-top comment for why that string is
  // built here rather than through a builder method on
  // RefreshTokenCredential.
  private async issueRefreshToken(account: Account): Promise<string> {
    const tokenId = this.idGenerator.newId();
    const secret = randomBytes(REFRESH_SECRET_BYTE_LENGTH).toString(
      'base64url',
    );
    const digest = createHash('sha256').update(secret).digest('hex');
    const sessionStartedAt = this.clock.now();
    const expiresAt = new Date(
      sessionStartedAt.getTime() +
        this.refreshTokenTtlSeconds * MILLISECONDS_PER_SECOND,
    );

    await this.refreshTokenRepository.issue(
      new RefreshToken(
        account.id,
        tokenId,
        digest,
        account.tokenGeneration,
        sessionStartedAt,
        expiresAt,
        undefined,
        undefined,
      ),
    );

    return `${account.id}.${tokenId}.${secret}`;
  }
}
