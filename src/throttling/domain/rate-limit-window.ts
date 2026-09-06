/**
 * A rate-limit window aligned to a boundary of `windowSeconds` length,
 * built from a `Clock` reading rather than the system clock directly —
 * mirrors the auth feature's FR20 rule (`src/auth/domain/ports/clock.ts`):
 * every time comparison reads from an injected `Clock`, never `Date.now()`
 * or `new Date()` called ad hoc.
 *
 * The window boundary is expressed in Unix epoch **seconds** — the
 * codebase's existing convention for time-based storage fields (see
 * `refresh-token.mapper.ts`'s `ttl`) — so a `RateLimitWindow`'s start can be
 * written into a counter item's key without a unit conversion at the
 * storage boundary.
 *
 * @example
 * const window = RateLimitWindow.fromClock(clock, 60);
 * window.getStartEpochSeconds(); // e.g. 1_700_000_040
 * window.getElapsedFraction();   // e.g. 0.42
 */

import { Clock } from '../../auth/domain/ports/clock';

const MILLISECONDS_PER_SECOND = 1000;

export class RateLimitWindow {
  private constructor(
    private readonly startEpochSeconds: number,
    private readonly elapsedFraction: number,
  ) {}

  static fromClock(clock: Clock, windowSeconds: number): RateLimitWindow {
    const epochMilliseconds = clock.now().getTime();
    const windowMilliseconds = windowSeconds * MILLISECONDS_PER_SECOND;

    // Divide by the whole window directly (not by 1000 then by
    // windowSeconds) so there is only one floor operation — a two-step
    // version risks a boundary reading floating to the wrong side when it
    // lands exactly on a second.
    const startEpochSeconds =
      Math.floor(epochMilliseconds / windowMilliseconds) * windowSeconds;

    const elapsedFraction =
      (epochMilliseconds - startEpochSeconds * MILLISECONDS_PER_SECOND) /
      windowMilliseconds;

    return new RateLimitWindow(startEpochSeconds, elapsedFraction);
  }

  /** The window's start, in Unix epoch seconds — see the storage convention noted above. */
  getStartEpochSeconds(): number {
    return this.startEpochSeconds;
  }

  /** Fraction of the current window elapsed at the reading used to build it, in `[0, 1)`. */
  getElapsedFraction(): number {
    return this.elapsedFraction;
  }

  /**
   * How many whole windows separate a stored window start from the current
   * one: `0` for the same window, positive when the stored one is older,
   * negative when the stored one is ahead (clock skew). The caller (a
   * future use case) decides what each sign means — this only reports the
   * signed count.
   */
  static windowsElapsed(
    storedStartEpochSeconds: number,
    currentStartEpochSeconds: number,
    windowSeconds: number,
  ): number {
    return (currentStartEpochSeconds - storedStartEpochSeconds) / windowSeconds;
  }
}
