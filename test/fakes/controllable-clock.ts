/**
 * A test-controllable `Clock` (FR20). Access expiry, refresh expiry, and the
 * absolute session ceiling all read time through this port, so a use-case
 * test moves time forward with `advanceBy`/`setNow` instead of waiting on
 * the real clock — plan.md's validation section is explicit that this is the
 * whole point of injecting `Clock` in the first place.
 */

import { Clock } from '../../src/auth/domain/ports/clock';

export class ControllableClock implements Clock {
  private current: Date;

  constructor(initial: Date) {
    this.current = initial;
  }

  now(): Date {
    return this.current;
  }

  setNow(date: Date): void {
    this.current = date;
  }

  advanceBy(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}
