/**
 * Thrown by the `RateLimitStore` adapter when it cannot give an
 * authoritative increment-and-read answer for a counter — e.g. the
 * underlying call failed or timed out. Caught by the (future) use case,
 * which owns the fail-open/fail-closed decision.
 *
 * `underlyingErrorName` names the AWS exception class (or the adapter's own
 * reason where none was involved) so an operator can tell a timeout from a
 * throughput rejection — never anything caller-identifying. Both
 * constructor arguments are optional and default to a fixed, non-specific
 * value, so `new RateLimitStoreDegradedError()` still produces the same
 * message every time, mirroring `src/auth/domain/errors.ts`'s pattern for a
 * type that otherwise carries no detail.
 */
export class RateLimitStoreDegradedError extends Error {
  readonly underlyingErrorName: string;

  constructor(
    underlyingErrorName = 'unknown',
    detail = 'rate limit store could not provide an authoritative answer',
  ) {
    super(`rate limit store degraded (${underlyingErrorName}): ${detail}`);
    this.name = 'RateLimitStoreDegradedError';
    this.underlyingErrorName = underlyingErrorName;
  }
}
