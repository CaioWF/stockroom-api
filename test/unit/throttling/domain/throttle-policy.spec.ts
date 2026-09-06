import {
  estimateRequestCount,
  decideAdmission,
  RetryAfterInputs,
} from '../../../../src/throttling/domain/throttle-policy';

describe('estimateRequestCount', () => {
  it('weights the saturated previous count by the uncovered fraction and adds the saturated current count', () => {
    // saturatedPrevious = min(50, 10) = 10; saturatedCurrent = min(50, 10) = 10
    // estimate = 10 * (1 - 0.25) + 10 = 17.5
    const estimate = estimateRequestCount(50, 50, 0.25, 10);

    expect(estimate).toBeCloseTo(17.5, 10);
  });

  it('never lets a count above the saturation ceiling contribute more than the ceiling itself', () => {
    const atCeiling = estimateRequestCount(10, 0, 0.5, 10);
    const wayOverCeiling = estimateRequestCount(10_000, 0, 0.5, 10);

    expect(wayOverCeiling).toBe(atCeiling);
  });

  it("takes previousCount at face value regardless of staleness — zeroing a stale previous count for an idle caller is the caller's job (RateLimitWindow.windowsElapsed), not this function's", () => {
    const staleFromManyWindowsAgo = 20;

    const estimateWithStaleData = estimateRequestCount(
      staleFromManyWindowsAgo,
      1,
      0.1,
      100,
    );
    const estimateIfCallerHadZeroedIt = estimateRequestCount(0, 1, 0.1, 100);

    expect(estimateWithStaleData).not.toBe(estimateIfCallerHadZeroedIt);
    expect(estimateWithStaleData).toBeCloseTo(20 * 0.9 + 1, 10);
  });
});

const SOME_RETRY_AFTER_INPUTS: RetryAfterInputs = {
  elapsedFraction: 0.5,
  windowSeconds: 60,
  saturationCeiling: 10,
};

describe('decideAdmission — admission boundary (FR7)', () => {
  it('admits when the estimate is under the limit', () => {
    const decision = decideAdmission(3, 5, SOME_RETRY_AFTER_INPUTS);

    expect(decision).toEqual({ kind: 'admitted' });
  });

  it("admits when the estimate exactly equals the limit — refusing here was an earlier draft's bug (FR7): only the (N-1)th request would ever be served", () => {
    const decision = decideAdmission(5, 5, SOME_RETRY_AFTER_INPUTS);

    expect(decision).toEqual({ kind: 'admitted' });
  });

  it('refuses when the estimate exceeds the limit by any amount', () => {
    const decision = decideAdmission(5.0001, 5, SOME_RETRY_AFTER_INPUTS);

    expect(decision.kind).toBe('refused');
  });
});

// A task-1 code review numerically disproved an earlier revision here: it
// had a "current count still under the limit" fast path that returned a
// time still inside the current window, computed as if the current count
// would stay put at its refusal-time value. It doesn't — the store admits
// writes up to the saturation ceiling, so continued traffic from the
// refused caller (or anyone sharing its identity) can and does push the
// current count there too, per AC-4. Once the current count can reach
// `saturationCeiling` (>= limit for any factor >= 1), the retry's own `+1`
// on top of it always exceeds `limit`, so NO instant inside the same window
// can ever be safe — the only value that survives continued traffic to the
// ceiling is "wait for the window to roll over." Every test below drives
// the current count to the ceiling before checking the retry, per AC-4's
// own wording, so a reintroduced fast path fails these immediately.
describe('decideAdmission — Retry-After inversion, asserted behaviorally against AC-4', () => {
  it('emits a retryAfterSeconds that still admits after the caller keeps sending until its counter reaches the saturation ceiling (AC-4), starting from a count under the limit', () => {
    const windowSeconds = 60;
    const limit = 5;
    const saturationCeiling = 10; // default factor of 2
    const elapsedFraction = 0.3;
    const currentCount = 4; // under the limit at the moment of refusal
    const previousPushedToCeiling = saturationCeiling;

    const estimate = estimateRequestCount(
      previousPushedToCeiling,
      currentCount,
      elapsedFraction,
      saturationCeiling,
    );
    const decision = decideAdmission(estimate, limit, {
      elapsedFraction,
      windowSeconds,
      saturationCeiling,
    });

    expect(decision.kind).toBe('refused');
    if (decision.kind !== 'refused') {
      return;
    }

    // AC-4: "the caller continues sending until its counter reaches the
    // saturation ceiling" — before any waiting starts, not spread across
    // the wait. The store's own over-ceiling condition (current_count <
    // cap) is what stops it exactly at the ceiling, never above.
    const currentPushedToCeiling = saturationCeiling;

    const retryAtRefusalInstant = decideAdmission(
      estimateRequestCount(
        previousPushedToCeiling,
        currentPushedToCeiling,
        elapsedFraction,
        saturationCeiling,
      ),
      limit,
      { elapsedFraction, windowSeconds, saturationCeiling },
    );
    // Sanity check on the scenario itself: pinned at the ceiling is still a
    // refusal right up until the wait elapses — otherwise this test would
    // prove nothing about surviving the wait.
    expect(retryAtRefusalInstant.kind).toBe('refused');

    // Wait exactly the originally-emitted value, with the current count
    // held at the ceiling (the store blocks further writes there) for the
    // rest of that window, then crossing into a fresh window where it is
    // promoted into "previous" at that same worst-case value.
    const remainderOfCurrentWindow = windowSeconds * (1 - elapsedFraction);
    const secondsIntoNextWindow =
      decision.retryAfterSeconds - remainderOfCurrentWindow;
    const elapsedFractionAtRetry = secondsIntoNextWindow / windowSeconds;
    const currentCountAtRetry = 1; // the fresh window's own retry, its only traffic

    const estimateAtRetry = estimateRequestCount(
      currentPushedToCeiling,
      currentCountAtRetry,
      elapsedFractionAtRetry,
      saturationCeiling,
    );
    const retryDecision = decideAdmission(estimateAtRetry, limit, {
      elapsedFraction: elapsedFractionAtRetry,
      windowSeconds,
      saturationCeiling,
    });

    expect(retryDecision.kind).toBe('admitted');
  });

  it('emits a retryAfterSeconds that still admits when the current count is already at the saturation ceiling at the moment of refusal', () => {
    const windowSeconds = 60;
    const limit = 5;
    const saturationCeiling = 10;
    const elapsedFraction = 0.4;
    const currentCount = saturationCeiling; // already at the ceiling when refused
    const previousPushedToCeiling = saturationCeiling;

    const estimate = estimateRequestCount(
      previousPushedToCeiling,
      currentCount,
      elapsedFraction,
      saturationCeiling,
    );
    const decision = decideAdmission(estimate, limit, {
      elapsedFraction,
      windowSeconds,
      saturationCeiling,
    });

    expect(decision.kind).toBe('refused');
    if (decision.kind !== 'refused') {
      return;
    }

    const remainderOfCurrentWindow = windowSeconds * (1 - elapsedFraction);
    const secondsIntoNextWindow =
      decision.retryAfterSeconds - remainderOfCurrentWindow;
    const elapsedFractionAtRetry = secondsIntoNextWindow / windowSeconds;
    const currentCountAtRetry = 1;

    const estimateAtRetry = estimateRequestCount(
      saturationCeiling,
      currentCountAtRetry,
      elapsedFractionAtRetry,
      saturationCeiling,
    );
    const retryDecision = decideAdmission(estimateAtRetry, limit, {
      elapsedFraction: elapsedFractionAtRetry,
      windowSeconds,
      saturationCeiling,
    });

    expect(retryDecision.kind).toBe('admitted');
  });
});

describe('decideAdmission — Retry-After clamp', () => {
  it('keeps retryAfterSeconds within [1, 3*windowSeconds] for an extreme saturation ceiling and a tiny limit', () => {
    const windowSeconds = 30;
    const limit = 1;
    const saturationCeiling = 1_000_000;
    const currentCount = 2; // already over the tiny limit on its own
    const elapsedFraction = 0.9;

    const estimate = estimateRequestCount(
      saturationCeiling,
      currentCount,
      elapsedFraction,
      saturationCeiling,
    );
    const decision = decideAdmission(estimate, limit, {
      elapsedFraction,
      windowSeconds,
      saturationCeiling,
    });

    expect(decision.kind).toBe('refused');
    if (decision.kind !== 'refused') {
      return;
    }

    expect(decision.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(decision.retryAfterSeconds).toBeLessThanOrEqual(3 * windowSeconds);
  });
});
