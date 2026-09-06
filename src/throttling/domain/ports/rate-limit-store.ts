/**
 * The port this domain depends on to record and read a rate-limit counter.
 * No DynamoDB, no framework — `RateLimitStore` is the literal name the
 * constitution requires for this port; `src/throttling/infrastructure/dynamo/`
 * (a separate task) implements it against local storage.
 *
 * Revised after that adapter was built against the spec's actual
 * requirements: FR9/FR14/AC-6 require the STORE itself to enforce the
 * saturation ceiling in its own conditional write — bounding what a flood
 * can grow the stored value to, and costing an over-ceiling caller no write
 * at all — not only the domain policy after the fact on an unbounded raw
 * count. An identity is three fields, not one opaque string, because the
 * persistence key (`buildThrottleCounterKey` in
 * `src/shared/persistence/table-keys.ts`) needs `scope`, `identity` and
 * `routeGroup` separately; folding them into one string here would only
 * make the adapter parse it back apart.
 */

/**
 * Identifies one counter. `scope` says WHAT the identity is (a client
 * address, an account), `identity` is the value, `routeGroup` is the family
 * of routes the counter covers.
 */
export interface ThrottleCounterIdentity {
  readonly scope: string;
  readonly identity: string;
  readonly routeGroup: string;
}

/**
 * One counter as the caller sees it — raw, pre-saturation counts.
 * `throttle-policy.ts#estimateRequestCount` saturates them against the
 * policy's ceiling; this port only reports what storage actually holds.
 */
export interface ThrottleCounterSnapshot {
  readonly windowStart: number;
  readonly currentCount: number;
  readonly previousCount: number;
}

/**
 * `counted` carries the counts after this request was recorded. `saturated`
 * means the store refused to record the request because the live window's
 * count had already reached the saturation ceiling — no weighting can
 * rescue an estimate that high, so no write is spent recording it. Anything
 * else is a failure and arrives as a thrown `RateLimitStoreDegradedError`,
 * never as an outcome value.
 */
export type ThrottleCounterOutcome =
  | { readonly kind: 'counted'; readonly counter: ThrottleCounterSnapshot }
  | { readonly kind: 'saturated'; readonly counter: ThrottleCounterSnapshot };

export interface RateLimitStore {
  /**
   * Records one request against `key` in the window starting at
   * `currentWindowStart` (Unix epoch seconds, aligned by the caller).
   *
   * `signal` (FR21) is optional: when the caller (the use case) provides
   * one driven by its own request-wide deadline, the adapter aborts
   * whichever underlying call is in flight rather than leaving it to
   * settle unobserved after the deadline has already produced a degraded
   * outcome — an abandoned promise's later rejection is an unhandled
   * rejection, which can terminate the whole process on a warm Lambda
   * instance serving other concurrent invocations.
   *
   * @throws {import('../rate-limit-store-degraded.error').RateLimitStoreDegradedError} when no authoritative count is available.
   */
  countRequest(
    key: ThrottleCounterIdentity,
    currentWindowStart: number,
    signal?: AbortSignal,
  ): Promise<ThrottleCounterOutcome>;
}
