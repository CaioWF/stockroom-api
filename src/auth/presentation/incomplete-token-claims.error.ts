/**
 * Presentation-layer guard error (Finding 4, error-taxonomy fix):
 * `JwtAuthGuard.toAuthClaims` (jwt-auth.guard.ts) throws this when a
 * verified token's payload is missing or wrong-shaped `sub`/`email` claims.
 * Always thrown inside `verify()`'s own try block, so it is caught locally
 * and converted to `UnauthorizedException` before ever reaching
 * `AuthExceptionFilter` — typed anyway per the constitution's rule against
 * `throw new Error('string')`, not because it needs its own filter row.
 */
export class IncompleteTokenClaimsError extends Error {
  constructor() {
    super('token is missing required claims');
    this.name = 'IncompleteTokenClaimsError';
  }
}
