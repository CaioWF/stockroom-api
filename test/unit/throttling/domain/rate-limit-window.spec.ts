import { RateLimitWindow } from '../../../../src/throttling/domain/rate-limit-window';
import { Clock } from '../../../../src/auth/domain/ports/clock';

const WINDOW_SECONDS = 60;

function clockAt(epochMilliseconds: number): Clock {
  return { now: () => new Date(epochMilliseconds) };
}

describe('RateLimitWindow.fromClock — boundary alignment', () => {
  it('aligns the start to the largest multiple of the window length at or before the reading', () => {
    // 125s since epoch, 60s window: the window covering it starts at 120s.
    const window = RateLimitWindow.fromClock(clockAt(125_000), WINDOW_SECONDS);

    expect(window.getStartEpochSeconds()).toBe(120);
  });

  it('treats a reading exactly on a boundary as the start of that window', () => {
    const window = RateLimitWindow.fromClock(clockAt(120_000), WINDOW_SECONDS);

    expect(window.getStartEpochSeconds()).toBe(120);
    expect(window.getElapsedFraction()).toBe(0);
  });
});

describe('RateLimitWindow.fromClock — elapsed fraction', () => {
  it('is 0 at the very start of the window', () => {
    const window = RateLimitWindow.fromClock(clockAt(120_000), WINDOW_SECONDS);

    expect(window.getElapsedFraction()).toBe(0);
  });

  it('is 0.5 at the midpoint of the window', () => {
    const window = RateLimitWindow.fromClock(clockAt(150_000), WINDOW_SECONDS);

    expect(window.getElapsedFraction()).toBeCloseTo(0.5, 10);
  });

  it('is just under 1 a millisecond before the window ends', () => {
    const window = RateLimitWindow.fromClock(clockAt(179_999), WINDOW_SECONDS);

    expect(window.getElapsedFraction()).toBeGreaterThan(0.999);
    expect(window.getElapsedFraction()).toBeLessThan(1);
  });
});

describe('RateLimitWindow.windowsElapsed', () => {
  it('returns 0 when the stored window is the current window', () => {
    expect(RateLimitWindow.windowsElapsed(120, 120, WINDOW_SECONDS)).toBe(0);
  });

  it('returns 1 when the stored window is exactly one window older', () => {
    expect(RateLimitWindow.windowsElapsed(120, 180, WINDOW_SECONDS)).toBe(1);
  });

  it('returns a positive count greater than 1 for an idle caller across many windows', () => {
    expect(RateLimitWindow.windowsElapsed(0, 300, WINDOW_SECONDS)).toBe(5);
  });

  it('returns a negative count when the stored window is ahead of the current one (clock skew)', () => {
    expect(RateLimitWindow.windowsElapsed(180, 120, WINDOW_SECONDS)).toBe(-1);
  });
});
