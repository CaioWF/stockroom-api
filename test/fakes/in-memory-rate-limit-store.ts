/**
 * An in-memory `RateLimitStore` (FR9/FR14). Replicates the REAL adapter's
 * observable semantics closely enough to exercise the use case's composition
 * logic: one counter per `scope:identity:routeGroup` key, a saturation
 * ceiling enforced before writing (returns `saturated` rather than
 * incrementing past it), and the promote-on-rollover transition for the
 * simple cases — exactly one window elapsed (carry the just-ended window's
 * count forward as `previousCount`) and two or more elapsed (too stale to
 * carry anything, reset).
 *
 * What this fake deliberately does NOT replicate: the real adapter's
 * clock-skew branches (a stored window ahead of the caller's), its
 * conditional-write retry/attempt-budget loop, or its round-trip counting.
 * Those are the storage protocol's own concerns, already proven against
 * real DynamoDB by `throttle-counter-repository.int-spec.ts` — this fake
 * exists only to drive `DecideRequestAdmissionUseCase`'s branching in a unit
 * test, not to re-verify the protocol.
 */

import {
  RateLimitStore,
  ThrottleCounterIdentity,
  ThrottleCounterOutcome,
  ThrottleCounterSnapshot,
} from '../../src/throttling/domain/ports/rate-limit-store';

export interface InMemoryRateLimitStorePolicy {
  readonly windowSeconds: number;
  readonly saturationCeiling: number;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly countersByKey = new Map<string, ThrottleCounterSnapshot>();

  constructor(private readonly policy: InMemoryRateLimitStorePolicy) {}

  countRequest(
    key: ThrottleCounterIdentity,
    currentWindowStart: number,
  ): Promise<ThrottleCounterOutcome> {
    const mapKey = this.keyOf(key);
    const stored = this.countersByKey.get(mapKey);

    if (stored === undefined || stored.windowStart !== currentWindowStart) {
      return Promise.resolve(
        this.startFreshWindow(mapKey, stored, currentWindowStart),
      );
    }

    return Promise.resolve(this.incrementSameWindow(mapKey, stored));
  }

  /** Test-only hook: read back what the fake actually stored, without going through the port. */
  peek(key: ThrottleCounterIdentity): ThrottleCounterSnapshot | undefined {
    return this.countersByKey.get(this.keyOf(key));
  }

  private startFreshWindow(
    mapKey: string,
    stored: ThrottleCounterSnapshot | undefined,
    windowStart: number,
  ): ThrottleCounterOutcome {
    const previousCount = this.carriedPreviousCount(stored, windowStart);
    const counter: ThrottleCounterSnapshot = {
      windowStart,
      currentCount: 1,
      previousCount,
    };
    this.countersByKey.set(mapKey, counter);
    return { kind: 'counted', counter };
  }

  // Only exactly one elapsed window carries a `previousCount` forward — two
  // or more elapsed is stale enough that carrying it would misweight a
  // caller who simply went quiet for a while (`throttle-policy.ts`'s own
  // contract: an idle gap is the caller's job to zero out before this runs).
  private carriedPreviousCount(
    stored: ThrottleCounterSnapshot | undefined,
    windowStart: number,
  ): number {
    if (stored === undefined) {
      return 0;
    }
    const windowsElapsed =
      (windowStart - stored.windowStart) / this.policy.windowSeconds;
    return windowsElapsed === 1 ? stored.currentCount : 0;
  }

  private incrementSameWindow(
    mapKey: string,
    stored: ThrottleCounterSnapshot,
  ): ThrottleCounterOutcome {
    if (stored.currentCount >= this.policy.saturationCeiling) {
      return { kind: 'saturated', counter: stored };
    }
    const counter: ThrottleCounterSnapshot = {
      ...stored,
      currentCount: stored.currentCount + 1,
    };
    this.countersByKey.set(mapKey, counter);
    return { kind: 'counted', counter };
  }

  private keyOf(key: ThrottleCounterIdentity): string {
    return `${key.scope}:${key.identity}:${key.routeGroup}`;
  }
}
