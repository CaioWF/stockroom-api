/**
 * The weighted sliding-window rate-limit arithmetic. Pure functions only —
 * no clock, no store, no framework. `estimateRequestCount` turns raw counts
 * into a single number; `decideAdmission` turns that number into a decision,
 * computing a `Retry-After` hint on refusal via the inversion below.
 *
 * The inversion always assumes BOTH the previous and the current window's
 * count can reach `saturationCeiling` by the time the hint is used — a
 * refused caller's own retries, or other traffic sharing the identity, keep
 * incrementing the CURRENT count too, not only carrying stale weight from
 * the previous one. (A task-1 code review, verified numerically against
 * AC-4, found an earlier revision assumed the current window's count would
 * stay put at its refusal-time value; it doesn't, since the store admits
 * writes up to the saturation ceiling.) Once the current count can reach
 * `saturationCeiling = limit × THROTTLE_COUNTER_SATURATION_FACTOR`, which is
 * `>= limit` for any factor >= 1, no instant inside the SAME window can ever
 * admit — the retry's own `+1` on top of an already-at-or-over-limit current
 * count always exceeds `limit`. The only value safe against continued
 * traffic up to the ceiling is therefore always "wait for the window to
 * roll over, then however long the promoted (worst-case) previous count
 * takes to decay enough in the fresh window" — there is no separate
 * "still inside this window" fast path. See AC-4's own scenario, which is
 * exactly this: push the counter to the ceiling, then honour the returned
 * value.
 */

import { ThrottleDecision } from './throttle-decision';

const MIN_RETRY_AFTER_SECONDS = 1;
const MAX_RETRY_AFTER_WINDOW_MULTIPLE = 3;

/**
 * Saturates both counts at `saturationCeiling` first (an unbounded counter
 * from a pathological client must not let one window dominate the
 * estimate), then weights the saturated previous count by how much of it is
 * still "covered" from this reading's position inside the current window.
 *
 * Takes `previousCount` at face value: an idle caller's previous-window
 * count from many windows ago is stale, but zeroing it out is the caller's
 * job (`RateLimitWindow.windowsElapsed`), not this function's — it has no
 * notion of "how many windows elapsed" to know the difference.
 */
export function estimateRequestCount(
  previousCount: number,
  currentCount: number,
  elapsedFraction: number,
  saturationCeiling: number,
): number {
  const saturatedPrevious = Math.min(previousCount, saturationCeiling);
  const saturatedCurrent = Math.min(currentCount, saturationCeiling);

  return saturatedPrevious * (1 - elapsedFraction) + saturatedCurrent;
}

/**
 * What `decideAdmission` needs to compute a `Retry-After` hint, only used
 * when it refuses. No `currentCount` here (an earlier revision took one,
 * and used it to decide whether a within-window answer existed) — the
 * current count's own worst case is always `saturationCeiling`, the same
 * assumption already applied to the previous count, so the computation
 * needs the window's shape, not this request's specific count.
 */
export interface RetryAfterInputs {
  readonly elapsedFraction: number;
  readonly windowSeconds: number;
  readonly saturationCeiling: number;
}

/**
 * Refuses only when the estimate *exceeds* the limit, never at equality
 * (FR7). The caller has already incremented its own count before this runs
 * (FR8: a refused request still counts), so `estimate` already reflects
 * this request — refusing at equality would mean the Nth request in a fresh
 * window (count exactly N after its own increment) is wrongly turned away,
 * leaving only N-1 ever served.
 */
export function decideAdmission(
  estimate: number,
  limit: number,
  retryAfterInputs: RetryAfterInputs,
): ThrottleDecision {
  if (estimate <= limit) {
    return { kind: 'admitted' };
  }

  return {
    kind: 'refused',
    retryAfterSeconds: computeRetryAfterSeconds(limit, retryAfterInputs),
  };
}

/**
 * Seconds into a fresh window (current count starting at 0, one increment
 * for the retry itself) until the weighted estimate — worst-case previous
 * count at `saturationCeiling` — lands at or under `limit`. Solving
 * `cap*(1 - t/windowSeconds) + 1 <= limit` for `t` gives the closed form
 * below.
 */
function secondsIntoFreshWindowUntilAdmits(
  windowSeconds: number,
  limit: number,
  saturationCeiling: number,
): number {
  const admittedHeadroom = limit - 1;

  return windowSeconds * (1 - admittedHeadroom / saturationCeiling);
}

/**
 * No within-window fast path (see this module's own doc for why one is
 * never safe): the answer is always the remainder of the current window,
 * plus the time a fresh window needs for its promoted previous count — the
 * current window's count, now `saturationCeiling` in the worst case — to
 * decay enough once weighted by elapsed time there.
 */
function computeRetryAfterSeconds(
  limit: number,
  { elapsedFraction, windowSeconds, saturationCeiling }: RetryAfterInputs,
): number {
  const remainderOfCurrentWindow = windowSeconds * (1 - elapsedFraction);
  const secondsIntoNextWindow = secondsIntoFreshWindowUntilAdmits(
    windowSeconds,
    limit,
    saturationCeiling,
  );
  const raw = remainderOfCurrentWindow + secondsIntoNextWindow;

  // Clamp to a sane range and round up: never under-promise (Math.ceil), and
  // never emit a value a pathological input could stretch past 3 windows —
  // correct inputs never need this ceiling (see the module's callers' tests).
  const clamped = Math.min(
    Math.max(raw, MIN_RETRY_AFTER_SECONDS),
    MAX_RETRY_AFTER_WINDOW_MULTIPLE * windowSeconds,
  );

  return Math.ceil(clamped);
}
