/**
 * The resolved policy for one `(scope, route group)` pair. Plain data, no
 * behavior — `saturationCeiling` is precomputed by whoever builds this
 * (`limit * THROTTLE_COUNTER_SATURATION_FACTOR`) so `throttle-policy.ts`'s
 * arithmetic never has to know the factor or recompute it per call.
 */
export interface RateLimitPolicy {
  readonly limit: number;
  readonly windowSeconds: number;
  readonly saturationCeiling: number;
}
