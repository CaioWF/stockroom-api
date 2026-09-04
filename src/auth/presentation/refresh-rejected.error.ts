/**
 * Presentation-layer-only marker for a refused `/auth/refresh` (see
 * auth.controller.ts). `RotateRefreshToken` already expresses every
 * non-success branch as a `RotationOutcome` value, never an exception (per
 * that file's own JSDoc) — this type exists purely so `AuthExceptionFilter`
 * has one unambiguous class to map to 401/`INVALID_REFRESH_TOKEN` once the
 * controller has already decided the outcome is a refusal. It carries no
 * fields: the closed error-code table (FR24) gives every refusal reason the
 * same code and body, so there is nothing more for this type to express.
 */
export class RefreshRejectedError extends Error {
  constructor() {
    super('refresh token rejected');
    this.name = 'RefreshRejectedError';
  }
}
