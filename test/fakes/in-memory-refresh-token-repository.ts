/**
 * An in-memory `RefreshTokenRepository` (FR14-FR19). `rotate` mirrors the
 * real adapter's single atomic `TransactWriteItems` (per the port's own
 * JSDoc): it commits only if the presented token is still the live,
 * unretired tip AND its stamped generation still matches the account's
 * current live generation, then retires `presented` and stores `successor`
 * as one indivisible step.
 *
 * This repository has no reference to `UserRepository`/`Account`, so it
 * tracks "the account's live generation" itself: seeded from the first
 * token `issue()`d for an account, and advanced explicitly via
 * `setAccountGeneration` — the test-only hook a revoke-all scenario (FR19)
 * uses to simulate a generation bump landing between a use case's read of
 * `presented` and its call to `rotate`.
 *
 * The atomicity itself needs no lock: `rotate`'s check-then-write body runs
 * with no `await` in the middle (see below), so on Node's single thread it
 * cannot be interleaved by a second `rotate` call — the invariant this
 * method enforces is the same one Task 12's DynamoDB integration test later
 * exercises for real, not just simulated single-threadedly.
 */

import { RefreshToken } from '../../src/auth/domain/refresh-token';
import {
  RefreshTokenRepository,
  RefreshTokenRotationResult,
} from '../../src/auth/domain/ports/refresh-token-repository';

export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  private readonly tokensByKey = new Map<string, RefreshToken>();
  private readonly generationByAccountId = new Map<string, number>();

  issue(token: RefreshToken): Promise<void> {
    this.tokensByKey.set(this.keyOf(token.accountId, token.tokenId), token);
    if (!this.generationByAccountId.has(token.accountId)) {
      this.generationByAccountId.set(token.accountId, token.tokenGeneration);
    }
    return Promise.resolve();
  }

  findByIds(
    accountId: string,
    tokenId: string,
  ): Promise<RefreshToken | undefined> {
    return Promise.resolve(
      this.tokensByKey.get(this.keyOf(accountId, tokenId)),
    );
  }

  // No `await` anywhere between the read at the top and the writes at the
  // bottom: that is what makes this check-then-write indivisible on a
  // single-threaded event loop, per the port's atomicity contract.
  rotate(
    presented: RefreshToken,
    successor: RefreshToken,
  ): Promise<RefreshTokenRotationResult> {
    const key = this.keyOf(presented.accountId, presented.tokenId);
    const stored = this.tokensByKey.get(key);
    const liveGeneration = this.generationByAccountId.get(presented.accountId);

    if (!this.canRotate(stored, presented, liveGeneration)) {
      return Promise.resolve({ kind: 'condition-failed' });
    }

    this.commitRotation(key, stored, successor);
    return Promise.resolve({ kind: 'committed' });
  }

  /** Explicit test hook: simulates a revoke-all bumping the account's generation (FR19). */
  setAccountGeneration(accountId: string, generation: number): void {
    this.generationByAccountId.set(accountId, generation);
  }

  // The production revoke-all call (FR19, AC-16): advances the account's
  // live generation by one, which `canRotate` above then refuses for every
  // token stamped with an earlier generation — including a token this
  // repository has never seen retire.
  revokeAll(accountId: string): Promise<void> {
    const current = this.generationByAccountId.get(accountId) ?? 0;
    this.generationByAccountId.set(accountId, current + 1);
    return Promise.resolve();
  }

  // A type predicate, not a plain boolean: narrows `stored` for the caller so
  // `commitRotation` never needs an `as RefreshToken` cast to undo what this
  // check already established at runtime.
  private canRotate(
    stored: RefreshToken | undefined,
    presented: RefreshToken,
    liveGeneration: number | undefined,
  ): stored is RefreshToken {
    return (
      stored !== undefined &&
      stored.retiredAt === undefined &&
      stored.tokenGeneration === liveGeneration &&
      presented.tokenGeneration === liveGeneration
    );
  }

  private commitRotation(
    presentedKey: string,
    stored: RefreshToken,
    successor: RefreshToken,
  ): void {
    const retired = new RefreshToken(
      stored.accountId,
      stored.tokenId,
      stored.digest,
      stored.tokenGeneration,
      stored.sessionStartedAt,
      stored.expiresAt,
      new Date(),
      successor.tokenId,
    );
    this.tokensByKey.set(presentedKey, retired);
    this.tokensByKey.set(
      this.keyOf(successor.accountId, successor.tokenId),
      successor,
    );
  }

  private keyOf(accountId: string, tokenId: string): string {
    return `${accountId}:${tokenId}`;
  }
}
