/**
 * What to do when the counter's conditional increment fails its condition.
 * A failure is never an error here — it is how the store reports that the
 * stored window is not the one the caller assumed, or that the counter is
 * already saturated. This module is the pure decision; the repository owns
 * the writes each decision implies.
 *
 * The five outcomes, and the specific defect each one prevents:
 *
 * - `saturated`: the stored window IS the caller's and the count already
 *   reached the ceiling. Refuse without a second write — no weighting of a
 *   count this high can produce an admission, so a further write would buy
 *   nothing. Requires the windows to be EQUAL: a full count belonging to a
 *   stale window is not a refusal, it is a rollover waiting to happen.
 * - `promote-previous` (one window elapsed): the count that just ended is
 *   the immediately-prior window, so it becomes `previous_count` and keeps
 *   carrying weight across the boundary. Without this, a caller times a
 *   burst to land either side of a boundary and gets twice the limit.
 * - `promote-zero` (two or more windows elapsed): the caller was idle. The
 *   stale count is NOT the prior window's, and promoting it would penalise
 *   an idle caller for traffic that is minutes or hours old.
 * - `adopt-stored-window` (the stored window equals the caller's, or is at
 *   most one window ahead): ordinary clock skew between instances at a
 *   boundary, or a concurrent writer that moved the item between this
 *   caller's read and write. Do not promote — retry the increment against
 *   the STORED window, so skewed instances converge on one window instead
 *   of fighting over which one is current.
 * - `reset-item` (the stored window is more than one window ahead): not
 *   skew. A badly-wrong clock or a corrupted item. Adopting it would let a
 *   single fast-clocked instance pin the window into the future and freeze
 *   rollover for every other instance sharing the counter, so the item is
 *   treated as unusable and rewritten from scratch.
 */

import { ThrottleCounterSnapshot } from '../../domain/ports/rate-limit-store';

export interface ThrottleWindowPolicy {
  readonly windowSeconds: number;
  readonly saturationCeiling: number;
}

export type RolloverBranchKind =
  | 'saturated'
  | 'promote-previous'
  | 'promote-zero'
  | 'adopt-stored-window'
  | 'reset-item';

export interface RolloverBranch {
  readonly kind: RolloverBranchKind;
}

// A gap of two windows or more means the prior window is genuinely empty.
const IDLE_GAP_WINDOWS = 2;
// One window ahead of the caller is as far as honest clock skew reaches.
const SKEW_TOLERANCE_WINDOWS = 1;

/**
 * Whole windows between the stored window and the caller's, positive when
 * the stored one is older. Rounded, not floored: skewed clocks produce
 * unaligned starts, and rounding maps "a few seconds either side of the
 * same boundary" to zero rather than to a spurious rollover.
 */
export function windowsElapsedSince(
  storedWindowStart: number,
  currentWindowStart: number,
  windowSeconds: number,
): number {
  return Math.round((currentWindowStart - storedWindowStart) / windowSeconds);
}

function isLiveWindowSaturated(
  stored: ThrottleCounterSnapshot,
  currentWindowStart: number,
  policy: ThrottleWindowPolicy,
): boolean {
  return (
    stored.windowStart === currentWindowStart &&
    stored.currentCount >= policy.saturationCeiling
  );
}

/** Picks the branch for a stored item that just failed the increment's condition. */
export function selectRolloverBranch(
  stored: ThrottleCounterSnapshot,
  currentWindowStart: number,
  policy: ThrottleWindowPolicy,
): RolloverBranch {
  if (isLiveWindowSaturated(stored, currentWindowStart, policy)) {
    return { kind: 'saturated' };
  }
  const elapsed = windowsElapsedSince(
    stored.windowStart,
    currentWindowStart,
    policy.windowSeconds,
  );
  if (elapsed >= IDLE_GAP_WINDOWS) {
    return { kind: 'promote-zero' };
  }
  if (elapsed === 1) {
    return { kind: 'promote-previous' };
  }
  if (elapsed >= -SKEW_TOLERANCE_WINDOWS) {
    return { kind: 'adopt-stored-window' };
  }
  return { kind: 'reset-item' };
}
