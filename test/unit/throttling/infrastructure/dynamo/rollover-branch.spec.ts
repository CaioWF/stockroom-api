/**
 * Branch selection for a failed conditional increment. The five outcomes are
 * the whole protocol: getting one wrong is either a lost limit (a burst
 * admitted across a boundary) or a frozen one (a bad clock pinning the
 * window into the future). Each case names the situation it stands for
 * rather than only its arithmetic.
 */

import {
  RolloverBranchKind,
  selectRolloverBranch,
} from '../../../../../src/throttling/infrastructure/dynamo/rollover-branch';

const POLICY = { windowSeconds: 60, saturationCeiling: 100 };
const NOW_WINDOW = 600;

function branchFor(
  storedWindowStart: number,
  storedCurrentCount: number,
): RolloverBranchKind {
  return selectRolloverBranch(
    {
      windowStart: storedWindowStart,
      currentCount: storedCurrentCount,
      previousCount: 0,
    },
    NOW_WINDOW,
    POLICY,
  ).kind;
}

describe('selectRolloverBranch', () => {
  it('refuses when the LIVE window is already at the saturation ceiling', () => {
    expect(branchFor(NOW_WINDOW, 100)).toBe('saturated');
  });

  it('refuses when the live window is past the ceiling', () => {
    expect(branchFor(NOW_WINDOW, 137)).toBe('saturated');
  });

  it('does NOT refuse on a full count that belongs to a stale window', () => {
    expect(branchFor(NOW_WINDOW - 60, 100)).toBe('promote-previous');
  });

  it('promotes the stale count when exactly one window has elapsed', () => {
    expect(branchFor(NOW_WINDOW - 60, 7)).toBe('promote-previous');
  });

  it('promotes zero when two or more windows have elapsed', () => {
    expect(branchFor(NOW_WINDOW - 120, 7)).toBe('promote-zero');
    expect(branchFor(NOW_WINDOW - 600, 7)).toBe('promote-zero');
  });

  it('retries against the stored window when it is already the live one', () => {
    expect(branchFor(NOW_WINDOW, 3)).toBe('adopt-stored-window');
  });

  it('adopts a stored window at most one window ahead as ordinary skew', () => {
    expect(branchFor(NOW_WINDOW + 60, 3)).toBe('adopt-stored-window');
    expect(branchFor(NOW_WINDOW + 5, 3)).toBe('adopt-stored-window');
  });

  it('adopts, rather than refuses, a full count whose window is merely skewed', () => {
    expect(branchFor(NOW_WINDOW + 5, 100)).toBe('adopt-stored-window');
  });

  it('resets an item whose window is more than one window in the future', () => {
    expect(branchFor(NOW_WINDOW + 300, 3)).toBe('reset-item');
    expect(branchFor(NOW_WINDOW + 86400, 3)).toBe('reset-item');
  });
});
