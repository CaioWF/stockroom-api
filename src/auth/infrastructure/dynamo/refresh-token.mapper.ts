/**
 * Refresh-token item shape (plan.md's Data Layer Contract). Storage
 * attribute names are NOT a mechanical snake_case of the domain field names
 * — `retiredAt`/`successorTokenId` map to `rotated_at`/`replaced_by`, not
 * `retired_at`/`successor_token_id`, because the single-use-rotation
 * condition in `refresh-token.repository.ts` names `rotated_at` literally;
 * getting this mapping wrong silently breaks that condition.
 *
 * `ttl` (Unix epoch seconds, derived from `expiresAt`) is written once, at
 * creation, and never touched again — `rotate()`'s retirement `Update`
 * writes `rotated_at`/`replaced_by` directly rather than going through this
 * mapper, so a retired token's `ttl` is never shortened (it must stay
 * readable by `findByIds` for its original expiry, for replay detection).
 */

import { RefreshToken } from '../../domain/refresh-token';

const MILLISECONDS_PER_SECOND = 1000;

/** The refresh-token item, used for both `issue()` and `rotate()`'s successor `Put`. */
export function toRefreshTokenItem(
  token: RefreshToken,
): Record<string, unknown> {
  return {
    token_hash: token.digest,
    token_generation: token.tokenGeneration,
    session_started_at: token.sessionStartedAt.toISOString(),
    expires_at: token.expiresAt.toISOString(),
    ttl: Math.floor(token.expiresAt.getTime() / MILLISECONDS_PER_SECOND),
    ...(token.retiredAt !== undefined
      ? { rotated_at: token.retiredAt.toISOString() }
      : {}),
    ...(token.successorTokenId !== undefined
      ? { replaced_by: token.successorTokenId }
      : {}),
  };
}

// `accountId`/`tokenId` live in the item's PK/SK, never as their own stored
// attributes, so the caller — which already knows both from the key it
// queried by — merges them into `item.accountId`/`item.tokenId` before
// calling this, the same reasoning `user.mapper.ts#toAccount` documents.
/** Reconstructs the `RefreshToken` entity from a stored refresh-token item. */
export function toRefreshToken(item: Record<string, unknown>): RefreshToken {
  return new RefreshToken(
    item.accountId as string,
    item.tokenId as string,
    item.token_hash as string,
    item.token_generation as number,
    new Date(item.session_started_at as string),
    new Date(item.expires_at as string),
    item.rotated_at !== undefined
      ? new Date(item.rotated_at as string)
      : undefined,
    item.replaced_by !== undefined ? (item.replaced_by as string) : undefined,
  );
}
