/**
 * The mapper's two directions plus the one that only exists because of a
 * DynamoDB asymmetry: a SUCCESSFUL update's `Attributes` comes back
 * auto-unmarshalled by the document client (plain numbers), while the item
 * attached to a THROWN `ConditionalCheckFailedException` comes back in raw
 * `AttributeValue` form (`{ N: '5' }`). The raw-form case below is the
 * load-bearing test in this file - reading it wrong makes every rollover
 * branch decide on garbage, and no single-process happy-path test would
 * notice, because the happy path never sees the raw form.
 *
 * The raw fixture is not invented: it is the literal `error.Item` JSON
 * DynamoDB Local returned when this feature's conditional write was probed
 * against it, attribute order included.
 */

import {
  readThrottleCounter,
  readThrottleCounterFromConditionFailure,
  throttleCounterTtlSeconds,
  toThrottleCounterItem,
} from '../../../../../src/throttling/infrastructure/dynamo/throttle-counter.mapper';
import { MalformedThrottleCounterItemError } from '../../../../../src/throttling/infrastructure/dynamo/malformed-throttle-counter-item.error';

const WINDOW_SECONDS = 60;

describe('toThrottleCounterItem', () => {
  it('writes the snake_case storage attributes for the domain counter', () => {
    const item = toThrottleCounterItem(
      { windowStart: 160, currentCount: 5, previousCount: 3 },
      WINDOW_SECONDS,
    );

    expect(item).toEqual({
      window_start: 160,
      current_count: 5,
      previous_count: 3,
      ttl: 160 + 2 * WINDOW_SECONDS,
    });
  });

  it('expires the item TWO windows past its start, not one', () => {
    expect(throttleCounterTtlSeconds(160, WINDOW_SECONDS)).toBe(280);
    expect(throttleCounterTtlSeconds(0, 1)).toBe(2);
  });
});

describe('readThrottleCounter (successful response, auto-unmarshalled)', () => {
  it('reads the plain numeric attributes the document client returns', () => {
    const counter = readThrottleCounter({
      PK: 'THROTTLE#ip#203.0.113.7',
      SK: 'auth',
      window_start: 160,
      current_count: 1,
      previous_count: 0,
      ttl: 280,
    });

    expect(counter).toEqual({
      windowStart: 160,
      currentCount: 1,
      previousCount: 0,
    });
  });

  it('treats a missing previous_count as zero', () => {
    const counter = readThrottleCounter({
      window_start: 160,
      current_count: 2,
    });

    expect(counter.previousCount).toBe(0);
  });

  it('refuses an item whose window_start is absent', () => {
    expect(() => readThrottleCounter({ current_count: 2 })).toThrow(
      MalformedThrottleCounterItemError,
    );
  });

  it('refuses an item whose current_count is not a number', () => {
    expect(() =>
      readThrottleCounter({ window_start: 160, current_count: 'two' }),
    ).toThrow(MalformedThrottleCounterItemError);
  });
});

describe('readThrottleCounterFromConditionFailure (raw AttributeValue form)', () => {
  it('reads the raw item DynamoDB attaches to a failed conditional write', () => {
    const rawItem = {
      previous_count: { N: '0' },
      current_count: { N: '1' },
      SK: { S: 'x' },
      window_start: { N: '160' },
      PK: { S: 'THROTTLE#probe' },
      ttl: { N: '280' },
    };

    expect(readThrottleCounterFromConditionFailure(rawItem)).toEqual({
      windowStart: 160,
      currentCount: 1,
      previousCount: 0,
    });
  });

  it('reads multi-digit counts as numbers rather than strings', () => {
    const counter = readThrottleCounterFromConditionFailure({
      window_start: { N: '1700000040' },
      current_count: { N: '120' },
      previous_count: { N: '97' },
    });

    expect(counter).toEqual({
      windowStart: 1700000040,
      currentCount: 120,
      previousCount: 97,
    });
  });

  it('treats a raw item with no previous_count as zero', () => {
    const counter = readThrottleCounterFromConditionFailure({
      window_start: { N: '160' },
      current_count: { N: '4' },
    });

    expect(counter.previousCount).toBe(0);
  });

  it('refuses a raw item whose window_start is missing', () => {
    expect(() =>
      readThrottleCounterFromConditionFailure({ current_count: { N: '4' } }),
    ).toThrow(MalformedThrottleCounterItemError);
  });

  it('refuses a raw item whose count is a string attribute, not a number', () => {
    expect(() =>
      readThrottleCounterFromConditionFailure({
        window_start: { N: '160' },
        current_count: { S: '4' },
      }),
    ).toThrow(MalformedThrottleCounterItemError);
  });
});
