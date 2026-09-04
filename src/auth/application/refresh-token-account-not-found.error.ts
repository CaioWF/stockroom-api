/**
 * Application-layer invariant error (Finding 4, error-taxonomy fix):
 * `RotateRefreshToken.buildRotatedOutcome` finds a live, unexpired refresh
 * token whose `accountId` no longer resolves through `UserRepository`. Per
 * `UserRepository`'s own JSDoc a live refresh token can never outlive its
 * account in this feature's design, so this is a referential-integrity
 * violation, not a reachable business condition FR24's closed code set
 * models — `AuthExceptionFilter` maps it to the generic `SERVICE_UNAVAILABLE`
 * row, never exposing `accountId` in the HTTP response (constitution:
 * "Errors are typed and mapped at the edge").
 */
export class RefreshTokenAccountNotFoundError extends Error {
  constructor(public readonly accountId: string) {
    super(
      `refresh token references account ${accountId}, which no longer exists`,
    );
    this.name = 'RefreshTokenAccountNotFoundError';
  }
}
