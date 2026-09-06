/**
 * A stored counter item that cannot be read as a counter — a missing
 * `window_start`, a count that is not a number. Raised by the mapper and
 * kept separate from `RateLimitStoreDegradedError` so the mapper carries no
 * transport concerns; the repository catches it and degrades, because an
 * unreadable item is a store failure like any other from the caller's side.
 */
export class MalformedThrottleCounterItemError extends Error {
  constructor(attribute: string, reason: string) {
    super(`throttle counter attribute ${attribute} ${reason}`);
    this.name = 'MalformedThrottleCounterItemError';
  }
}
