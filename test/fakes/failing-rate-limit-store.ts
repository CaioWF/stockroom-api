/**
 * A `RateLimitStore` fake dedicated to exercising the use case's degraded
 * path (FR21/FR22). Two behaviors, chosen via the named static factories:
 *
 * - `immediatelyDegraded()`: rejects with `RateLimitStoreDegradedError`
 *   before the current microtask ends — the straightforward "store is down"
 *   case, no timing involved.
 * - `delayedBy(delayMs, settlement)`: mimics an in-flight call that would
 *   take `delayMs` to `settlement` ('resolve' or 'reject') on its own, but
 *   — mirroring the real adapter's own contract (`rate-limit-store.ts`'s
 *   `signal` doc, and `throttle-counter.repository.ts`'s `toDegraded`) —
 *   settles as degraded almost immediately if the caller's `AbortSignal`
 *   fires first. This is what lets a use case's deadline bound the TOTAL
 *   wait, not just decline to wait longer: the abort has to actually cancel
 *   the in-flight call, not race a second, independent timer against it.
 */

import { RateLimitStoreDegradedError } from '../../src/throttling/domain/rate-limit-store-degraded.error';
import {
  RateLimitStore,
  ThrottleCounterIdentity,
  ThrottleCounterOutcome,
} from '../../src/throttling/domain/ports/rate-limit-store';

export type FailingRateLimitStoreSettlement = 'resolve' | 'reject';

type FailingBehavior =
  | { readonly kind: 'immediate-degraded' }
  | {
      readonly kind: 'delayed';
      readonly delayMs: number;
      readonly settlement: FailingRateLimitStoreSettlement;
    };

function placeholderCountedOutcome(): ThrottleCounterOutcome {
  return {
    kind: 'counted',
    counter: { windowStart: 0, currentCount: 1, previousCount: 0 },
  };
}

export class FailingRateLimitStore implements RateLimitStore {
  private constructor(private readonly behavior: FailingBehavior) {}

  static immediatelyDegraded(): FailingRateLimitStore {
    return new FailingRateLimitStore({ kind: 'immediate-degraded' });
  }

  static delayedBy(
    delayMs: number,
    settlement: FailingRateLimitStoreSettlement,
  ): FailingRateLimitStore {
    return new FailingRateLimitStore({ kind: 'delayed', delayMs, settlement });
  }

  countRequest(
    _key: ThrottleCounterIdentity,
    _currentWindowStart: number,
    signal?: AbortSignal,
  ): Promise<ThrottleCounterOutcome> {
    if (this.behavior.kind === 'immediate-degraded') {
      return Promise.reject(new RateLimitStoreDegradedError());
    }
    return this.settleAfterDelayOrAbort(
      this.behavior.delayMs,
      this.behavior.settlement,
      signal,
    );
  }

  private settleAfterDelayOrAbort(
    delayMs: number,
    settlement: FailingRateLimitStoreSettlement,
    signal: AbortSignal | undefined,
  ): Promise<ThrottleCounterOutcome> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (settlement === 'resolve') {
          resolve(placeholderCountedOutcome());
        } else {
          reject(new RateLimitStoreDegradedError());
        }
      }, delayMs);

      // A second call to resolve/reject after the promise has already
      // settled (e.g. this timer firing after an abort already rejected
      // below) is a silent no-op per the Promise spec — clearing the timer
      // is still done for hygiene, matching the deadline discipline the use
      // case itself must follow.
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(
          new RateLimitStoreDegradedError(
            'AbortError',
            'store call aborted by caller deadline',
          ),
        );
      });
    });
  }
}
