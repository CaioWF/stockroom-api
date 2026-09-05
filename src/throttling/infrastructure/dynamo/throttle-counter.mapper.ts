/**
 * Code to schema, and back, for the throttle-counter item. Attribute names
 * are a mechanical snake_case of the domain fields (`windowStart` becomes
 * `window_start`), with one exception worth naming: `ttl` is not a domain
 * field at all — it is derived here, and DynamoDB's TTL feature reads it by
 * that exact attribute name (see scripts/create-table.ts).
 *
 * Reading back has TWO functions, not one, because DynamoDB is asymmetric
 * about it. A successful `UpdateCommand` returns `Attributes` already
 * unmarshalled by the document client (plain JS numbers), but the item
 * DynamoDB attaches to a THROWN `ConditionalCheckFailedException` arrives in
 * raw `AttributeValue` form (`{ N: '5' }`) — verified against DynamoDB Local
 * while this feature was designed. The rollover protocol decides which
 * branch to take from exactly that raw item, so reading it as if it were
 * unmarshalled would silently branch on `NaN`.
 *
 * The raw reader is hand-written rather than delegated to
 * `@aws-sdk/util-dynamodb`'s `unmarshall`: that package is only a transitive
 * dependency here, not declared in package.json, and importing an
 * undeclared dependency is a worse trade than four `.N` reads.
 */

import { ThrottleCounterSnapshot } from '../../domain/ports/rate-limit-store';
import { MalformedThrottleCounterItemError } from './malformed-throttle-counter-item.error';

export const WINDOW_START_ATTRIBUTE = 'window_start';
export const CURRENT_COUNT_ATTRIBUTE = 'current_count';
export const PREVIOUS_COUNT_ATTRIBUTE = 'previous_count';
export const TTL_ATTRIBUTE = 'ttl';

// TWO windows past the window start, never one. At one window the item
// would become eligible for deletion at exactly the moment `previous_count`
// starts carrying weight against a boundary burst. TTL deletion is
// best-effort (DynamoDB documents up to ~48h), so this is a storage-cost
// control and never a correctness mechanism — nothing reads an item's
// absence as "the window ended".
const WINDOWS_BEFORE_EXPIRY = 2;

/** The stored item's own attributes, without the PK/SK the key builder owns. */
export interface ThrottleCounterItem {
  readonly window_start: number;
  readonly current_count: number;
  readonly previous_count: number;
  readonly ttl: number;
}

/**
 * The only two `AttributeValue` members this adapter ever reads. Typed
 * explicitly (rather than cast through `any` or pulled from the SDK's full
 * union) so a string-typed count is a compile-time visible possibility and
 * gets rejected at runtime instead of becoming `NaN`.
 */
export interface RawThrottleCounterAttributeValue {
  readonly N?: string;
  readonly S?: string;
}

export type RawThrottleCounterItem = Record<
  string,
  RawThrottleCounterAttributeValue
>;

/** Unix epoch seconds at which the counter item may be reaped. */
export function throttleCounterTtlSeconds(
  windowStart: number,
  windowSeconds: number,
): number {
  return windowStart + WINDOWS_BEFORE_EXPIRY * windowSeconds;
}

/** Domain counter to stored item. */
export function toThrottleCounterItem(
  counter: ThrottleCounterSnapshot,
  windowSeconds: number,
): ThrottleCounterItem {
  return {
    window_start: counter.windowStart,
    current_count: counter.currentCount,
    previous_count: counter.previousCount,
    ttl: throttleCounterTtlSeconds(counter.windowStart, windowSeconds),
  };
}

/** Stored item to domain counter, for an auto-unmarshalled response. */
export function readThrottleCounter(
  attributes: Record<string, unknown>,
): ThrottleCounterSnapshot {
  return {
    windowStart: requireNumber(
      attributes[WINDOW_START_ATTRIBUTE],
      WINDOW_START_ATTRIBUTE,
    ),
    currentCount: requireNumber(
      attributes[CURRENT_COUNT_ATTRIBUTE],
      CURRENT_COUNT_ATTRIBUTE,
    ),
    previousCount: optionalNumber(
      attributes[PREVIOUS_COUNT_ATTRIBUTE],
      PREVIOUS_COUNT_ATTRIBUTE,
    ),
  };
}

/**
 * Stored item to domain counter, for the raw item on a failed conditional
 * write. `ttl` is deliberately not read back: nothing branches on it.
 */
export function readThrottleCounterFromConditionFailure(
  item: RawThrottleCounterItem,
): ThrottleCounterSnapshot {
  return {
    windowStart: requireRawNumber(
      item[WINDOW_START_ATTRIBUTE],
      WINDOW_START_ATTRIBUTE,
    ),
    currentCount: requireRawNumber(
      item[CURRENT_COUNT_ATTRIBUTE],
      CURRENT_COUNT_ATTRIBUTE,
    ),
    previousCount: optionalRawNumber(
      item[PREVIOUS_COUNT_ATTRIBUTE],
      PREVIOUS_COUNT_ATTRIBUTE,
    ),
  };
}

function requireNumber(value: unknown, attribute: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MalformedThrottleCounterItemError(
      attribute,
      'is missing or is not a number',
    );
  }
  return value;
}

// A counter item written before `previous_count` existed (or seeded by hand)
// reads as zero rather than failing: an absent prior window contributes
// nothing to the weighted estimate, which is exactly what zero means.
function optionalNumber(value: unknown, attribute: string): number {
  return value === undefined ? 0 : requireNumber(value, attribute);
}

function requireRawNumber(
  value: RawThrottleCounterAttributeValue | undefined,
  attribute: string,
): number {
  const digits = value?.N;
  if (digits === undefined) {
    throw new MalformedThrottleCounterItemError(
      attribute,
      'is missing or is not a numeric attribute',
    );
  }
  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) {
    throw new MalformedThrottleCounterItemError(
      attribute,
      `does not parse as a number: ${digits}`,
    );
  }
  return parsed;
}

function optionalRawNumber(
  value: RawThrottleCounterAttributeValue | undefined,
  attribute: string,
): number {
  return value === undefined ? 0 : requireRawNumber(value, attribute);
}
