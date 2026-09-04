/**
 * Presentation-layer defensive error (Finding 4, error-taxonomy fix):
 * `AuthController.requireAuthClaims` (auth.controller.ts) throws this when a
 * non-public route handler runs with no `authClaims` attached to the
 * request. `JwtAuthGuard` always attaches claims before letting a
 * non-public request reach the controller, so reaching this constructor
 * means an invariant broke elsewhere, not a caller-triggerable path —
 * `AuthExceptionFilter` maps it to the generic `SERVICE_UNAVAILABLE` row.
 */
export class MissingAuthClaimsError extends Error {
  constructor() {
    super('guarded route reached with no verified claims attached');
    this.name = 'MissingAuthClaimsError';
  }
}
