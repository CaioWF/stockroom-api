/**
 * Rotates a refresh token (FR14-FR21): verifies the presented token's
 * secret, classifies retired/expired/replayed states, and — only for a
 * live, unexpired token — atomically retires it and mints a successor plus
 * a fresh access token.
 *
 * `execute` takes an already-parsed `RefreshTokenCredential`, never a raw
 * wire string — parsing (and AC-20's malformed-token rejection) happens at
 * the controller boundary (Task 13), exactly like `AuthenticateAccount`
 * takes already-parsed `EmailAddress`/`RawPassword`.
 *
 * Control-flow order is load-bearing, per plan.md's "Data flow, refresh":
 *   1. Look up the presented token; missing -> `unknown` (AC-21 falls out of
 *      this for free, since a token id under the wrong account never
 *      matches the composite key).
 *   2. Verify the secret's digest in constant time BEFORE branching on any
 *      state (FR15) — proving possession gates whether the caller learns
 *      anything about the token at all, including whether it is retired or
 *      expired.
 *   3. Retired -> classify the replay via the successor's own state
 *      (AC-15/AC-16).
 *   4. Not retired -> check both expiry conditions against the injected
 *      clock (AC-18, FR20/FR21) — this is what makes storage-level TTL
 *      cleanup-only, since the comparison never trusts a stored `ttl`
 *      attribute or wall-clock elapsed time.
 *   5. Build the successor and attempt the atomic `rotate`.
 *   6. `condition-failed` -> re-read and re-classify (AC-16's "including the
 *      live tip", AC-17's concurrent-request race).
 *   7. Committed -> recover the account's email and sign the access token.
 *
 * No logger call anywhere in this file: the anomaly-carrying outcome
 * members (`benign-replay`, `reuse-detected`) are what the presentation
 * layer (Task 13) logs, per `RotationOutcome`'s own JSDoc.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { RefreshTokenAccountNotFoundError } from './refresh-token-account-not-found.error';
import { RefreshToken } from '../domain/refresh-token';
import { RefreshTokenCredential } from '../domain/refresh-token-credential';
import { RotationOutcome } from '../domain/rotation-outcome';
import { AccessTokenSigner } from '../domain/ports/access-token-signer';
import { Clock } from '../domain/ports/clock';
import { IdGenerator } from '../domain/ports/id-generator';
import { RefreshTokenRepository } from '../domain/ports/refresh-token-repository';
import { UserRepository } from '../domain/ports/user-repository';

// Same width AuthenticateAccount.issueRefreshToken mints with — see that
// file's constant for why this lives here rather than behind a port.
const REFRESH_SECRET_BYTE_LENGTH = 32;
const MILLISECONDS_PER_SECOND = 1000;

export class RotateRefreshToken {
  constructor(
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly userRepository: UserRepository,
    private readonly accessTokenSigner: AccessTokenSigner,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly accessTokenTtlSeconds: number,
    private readonly refreshTokenTtlSeconds: number,
    private readonly sessionCeilingSeconds: number,
  ) {}

  async execute(credential: RefreshTokenCredential): Promise<RotationOutcome> {
    const presented = await this.refreshTokenRepository.findByIds(
      credential.getAccountId(),
      credential.getTokenId(),
    );
    if (presented === undefined) {
      return { kind: 'unknown' };
    }
    if (!this.secretMatches(credential, presented)) {
      return { kind: 'unknown' };
    }

    if (presented.retiredAt !== undefined) {
      return this.classifyReplay(presented);
    }

    if (this.isPastExpiry(presented, this.clock.now())) {
      return { kind: 'expired' };
    }

    return this.attemptRotation(presented);
  }

  // FR15: compared in constant time on two equal-length buffers, never `===`
  // on the hex strings — timing on a mismatch must not leak how many bytes
  // of the digest matched.
  private secretMatches(
    credential: RefreshTokenCredential,
    presented: RefreshToken,
  ): boolean {
    const candidateDigest = createHash('sha256')
      .update(credential.getSecret())
      .digest('hex');
    return timingSafeEqual(
      Buffer.from(candidateDigest, 'hex'),
      Buffer.from(presented.digest, 'hex'),
    );
  }

  // AC-18: both conditions read from the injected clock, never a stored ttl
  // attribute — storage-level expiry is cleanup-only (FR21).
  private isPastExpiry(presented: RefreshToken, now: Date): boolean {
    const sessionCeiling = this.sessionCeilingOf(presented);
    return now >= presented.expiresAt || now >= sessionCeiling;
  }

  private sessionCeilingOf(presented: RefreshToken): Date {
    return new Date(
      presented.sessionStartedAt.getTime() +
        this.sessionCeilingSeconds * MILLISECONDS_PER_SECOND,
    );
  }

  // A retired token was replayed (AC-15/AC-16): the successor's own state —
  // still the live, untouched tip, or itself already rotated away — decides
  // whether this is benign or proof of a second chain.
  private async classifyReplay(
    presented: RefreshToken,
  ): Promise<RotationOutcome> {
    // presented.retiredAt is set, so per RefreshToken's own contract
    // successorTokenId is guaranteed to be set alongside it.
    const successor = await this.refreshTokenRepository.findByIds(
      presented.accountId,
      presented.successorTokenId!,
    );

    if (successor !== undefined && successor.retiredAt === undefined) {
      return { kind: 'benign-replay', accountId: presented.accountId };
    }

    await this.refreshTokenRepository.revokeAll(presented.accountId);
    return { kind: 'reuse-detected', accountId: presented.accountId };
  }

  // Builds the successor and commits the atomic rotate; on a lost race
  // (AC-17) or a revokeAll landing mid-flight, re-reads and re-classifies
  // rather than trusting the stale `presented` this call started with.
  private async attemptRotation(
    presented: RefreshToken,
  ): Promise<RotationOutcome> {
    const now = this.clock.now();
    const secret = randomBytes(REFRESH_SECRET_BYTE_LENGTH).toString(
      'base64url',
    );
    const successor = new RefreshToken(
      presented.accountId,
      this.idGenerator.newId(),
      createHash('sha256').update(secret).digest('hex'),
      presented.tokenGeneration,
      presented.sessionStartedAt,
      this.successorExpiryOf(presented, now),
      undefined,
      undefined,
    );

    const result = await this.refreshTokenRepository.rotate(
      presented,
      successor,
    );
    if (result.kind === 'condition-failed') {
      return this.reclassifyAfterConditionFailure(presented);
    }

    return this.buildRotatedOutcome(presented, successor, secret, now);
  }

  // AC-19/FR17: the earlier of a full fresh TTL and the absolute session
  // ceiling anchored to the original sessionStartedAt — never reset to now,
  // or every rotation would push the ceiling out forever.
  private successorExpiryOf(presented: RefreshToken, now: Date): Date {
    const fullTtlExpiry = new Date(
      now.getTime() + this.refreshTokenTtlSeconds * MILLISECONDS_PER_SECOND,
    );
    const sessionCeiling = this.sessionCeilingOf(presented);
    return fullTtlExpiry < sessionCeiling ? fullTtlExpiry : sessionCeiling;
  }

  // AC-16's "revoked but not yet retired, including the live tip" case: a
  // condition-failed rotate means either a concurrent rotation already
  // retired this exact token (re-classify as any other replay), or the
  // account generation moved out from under it via revokeAll — refused the
  // same way `expired` already renders, since the anomaly was logged at the
  // moment revokeAll ran and no new one belongs here.
  private async reclassifyAfterConditionFailure(
    presented: RefreshToken,
  ): Promise<RotationOutcome> {
    const current = await this.refreshTokenRepository.findByIds(
      presented.accountId,
      presented.tokenId,
    );
    if (current !== undefined && current.retiredAt !== undefined) {
      return this.classifyReplay(current);
    }
    return { kind: 'expired' };
  }

  private async buildRotatedOutcome(
    presented: RefreshToken,
    successor: RefreshToken,
    secret: string,
    now: Date,
  ): Promise<RotationOutcome> {
    const account = await this.userRepository.findById(presented.accountId);
    if (account === undefined) {
      // Referential-integrity violation: a live refresh token can never
      // outlive its account in this feature's design (see UserRepository's
      // own JSDoc) — not a reachable business condition FR24's closed code
      // set models, so this is a typed infrastructure invariant error
      // (constitution: "Errors are typed and mapped at the edge"), not a
      // domain error.
      throw new RefreshTokenAccountNotFoundError(presented.accountId);
    }

    const accessToken = await this.accessTokenSigner.sign({
      accountId: presented.accountId,
      email: account.email,
    });

    return {
      kind: 'rotated',
      accessToken,
      refreshToken: `${presented.accountId}.${successor.tokenId}.${secret}`,
      expiresIn: this.accessTokenTtlSeconds,
      refreshExpiresIn: Math.floor(
        (successor.expiresAt.getTime() - now.getTime()) /
          MILLISECONDS_PER_SECOND,
      ),
    };
  }
}
