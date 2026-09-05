/**
 * Per-instance, in-memory fallback rate limiter.
 *
 * When the DynamoDB-backed counter cannot give an authoritative answer,
 * this module degraded-mode ceiling applies: a coarse, per-instance,
 * in-memory limiter. It is NOT a replacement for the real counter —
 * it only applies while the real store is unavailable.
 *
 * Expiry is lazy (no timers): when a window has elapsed, the stored
 * entry resets on the next lookup.
 *
 * Entries are capped at `maxEntries`. When a NEW identity arrives and
 * the cache is full, the request is ADMITTED, not rejected. This is
 * deliberate: an attacker rotating source identities can evict their
 * own entry before reaching the ceiling, but rejecting at cache capacity
 * would turn a counter-table outage into total rejection for every
 * caller the instance has not already seen.
 */

export interface InstanceLocalLimiterConfig {
  readonly maxEntries: number;
}

/** FR20a: the per-instance ceiling is derived from the route's own limit, never a separate absolute number. */
export function deriveFallbackCeiling(
  routeLimit: number,
  factor: number,
): number {
  return routeLimit * factor;
}

interface WindowEntry {
  windowStart: number;
  count: number;
}

export class InstanceLocalLimiter {
  private readonly entries: Map<string, WindowEntry>;
  private readonly maxEntries: number;

  constructor(config: InstanceLocalLimiterConfig) {
    this.maxEntries = config.maxEntries;
    this.entries = new Map();
  }

  /**
   * Records one hit for `identityKey` inside the window starting at
   * `windowStartEpochSeconds` (length `windowSeconds`), and reports whether
   * the count after this hit is still at or under `ceiling`.
   *
   * @returns true if under ceiling (admit), false if at/over ceiling (refuse)
   */
  recordAndCheck(
    identityKey: string,
    windowStartEpochSeconds: number,
    windowSeconds: number,
    ceiling: number,
  ): boolean {
    const stored = this.entries.get(identityKey);

    // Expiry on read: if the stored window has elapsed, treat the entry
    // as if it never existed.
    if (
      stored !== undefined &&
      stored.windowStart !== windowStartEpochSeconds
    ) {
      this.entries.delete(identityKey);
    }

    const entry = this.entries.get(identityKey);

    // New identity: admit if cache allows tracking, or if cache is full
    // (admit-when-full is deliberate to avoid turning outages into total rejection).
    if (entry === undefined) {
      const cacheIsFull = this.entries.size >= this.maxEntries;

      if (cacheIsFull) {
        // Cache is full: admit the request without tracking it.
        return true;
      }

      // Cache has room: track this new identity and admit.
      this.entries.set(identityKey, {
        windowStart: windowStartEpochSeconds,
        count: 1,
      });
      return true;
    }

    // Existing identity in the current window: increment and check ceiling.
    entry.count++;
    return entry.count <= ceiling;
  }
}
