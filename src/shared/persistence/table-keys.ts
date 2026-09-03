/**
 * The key grammar for the single shared table. This is the only place a
 * PK/SK pair is assembled — every bounded context composes these builders
 * instead of concatenating a prefix of its own, per the constitution's
 * "one module owns the table" rule (see plan.md's Data Layer Contract).
 */

export interface TableKey {
  readonly PK: string;
  readonly SK: string;
}

/** Account item key. `accountId` is a UUIDv7 string minted by the caller. */
export function buildAccountKey(accountId: string): TableKey {
  return { PK: `USER#${accountId}`, SK: 'PROFILE' };
}

/**
 * Email-lock item key. `normalizedEmail` must already be normalized by the
 * `EmailAddress` value object — this module never normalizes, so the same
 * address always maps to the same key no matter which caller built it.
 */
export function buildEmailLockKey(normalizedEmail: string): TableKey {
  return { PK: `EMAIL#${normalizedEmail}`, SK: 'EMAIL' };
}

/**
 * Refresh-token item key, scoped under its owning account's partition so a
 * credential naming one account with another account's token id addresses
 * nothing.
 */
export function buildRefreshTokenKey(
  accountId: string,
  tokenId: string,
): TableKey {
  return { PK: `USER#${accountId}`, SK: `REFRESH#${tokenId}` };
}
