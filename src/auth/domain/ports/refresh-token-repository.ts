import { RefreshToken } from '../refresh-token';

/**
 * The atomic write's result (FR16). `committed` means the account's
 * generation condition held and the presented token was still live when the
 * write landed. `condition-failed` covers two distinct storage-level causes
 * — the presented token was already retired by a concurrent request
 * (AC-17), or the account's generation moved since the token was minted
 * (FR19) — deliberately left undistinguished here: the caller tells them
 * apart with a follow-up `findByIds` read, the same read the replay branch
 * already needs for its successor lookup.
 */
export type RefreshTokenRotationResult =
  { readonly kind: 'committed' } | { readonly kind: 'condition-failed' };

/**
 * Sign-in's issue and refresh's lookup-plus-rotate (plan.md's
 * "Data flow, refresh"). Rotation is one atomic `TransactWriteItems` in the
 * real adapter: a `ConditionCheck` on the account's generation against the
 * presented token's own stamped generation, a conditional retirement of the
 * presented token, and a `Put` of the successor. This port exposes that as
 * one call rather than three separate writes, so no caller can observe a
 * partial outcome.
 *
 * `findByIds` alone answers every read the refresh flow needs: the initial
 * lookup of the presented token, the replay branch's extra read of a
 * retired token's successor (via `successorTokenId`), and a caller's
 * follow-up read after a `condition-failed` rotation. The port stays a data
 * source; which of the five `rotation-outcome` members applies is decided
 * by the use case (Task 9), never by this interface.
 */
export interface RefreshTokenRepository {
  /** Persists a freshly minted token (FR15) — only the digest is written. */
  issue(token: RefreshToken): Promise<void>;

  /**
   * Strongly-consistent lookup by owning account and token id (FR16, FR18,
   * AC-21). `undefined` means no such item exists in storage at all — the
   * `unknown` rotation outcome.
   */
  findByIds(
    accountId: string,
    tokenId: string,
  ): Promise<RefreshToken | undefined>;

  /** Attempts the atomic retire-`presented`-and-write-`successor` transaction. */
  rotate(
    presented: RefreshToken,
    successor: RefreshToken,
  ): Promise<RefreshTokenRotationResult>;

  /**
   * Atomically increments the account's live token generation by one (FR19),
   * invalidating every refresh token minted under an earlier generation —
   * including a token this repository has never seen retire. Called when
   * RotateRefreshToken classifies a replay as reuse-detected (AC-16).
   */
  revokeAll(accountId: string): Promise<void>;
}
