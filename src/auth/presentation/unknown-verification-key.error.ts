/**
 * Presentation-layer guard error (Finding 4, error-taxonomy fix):
 * `JwtAuthGuard.buildKeyResolver` (jwt-auth.guard.ts) throws this when a
 * presented token's `kid` matches none of the currently trusted
 * verification keys. Always thrown inside `verify()`'s own try block, so
 * it is caught locally and converted to `UnauthorizedException` before ever
 * reaching `AuthExceptionFilter` — typed anyway per the constitution's rule
 * against `throw new Error('string')`, not because it needs its own filter
 * row.
 */
export class UnknownVerificationKeyError extends Error {
  constructor(public readonly kid: string) {
    super(`no trusted verification key for kid ${kid}`);
    this.name = 'UnknownVerificationKeyError';
  }
}
