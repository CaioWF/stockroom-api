/**
 * The real wall clock (FR20). Deliberately trivial: everything this feature
 * times reads through the injected `Clock` port instead of calling `Date`
 * directly, so this is the one place in the codebase allowed to do so — the
 * production wiring at the composition root (Task 13).
 */

import { Clock } from '../../domain/ports/clock';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
