/**
 * The `RateLimitStore` port over the shared DynamoDB table.
 *
 * The common path is ONE conditional `UpdateItem`: increment atomically, on
 * the condition that the stored window is the caller's (or the item does not
 * exist yet) AND the count is still under the saturation ceiling. Both
 * clauses live in one condition so a single round trip reports both "wrong
 * window" and "over ceiling"; which of the two failed is read back from the
 * `ALL_OLD` item DynamoDB attaches to the resulting exception, and
 * `rollover-branch.ts` turns that item into the branch to take.
 *
 * A `ConditionalCheckFailedException` is never an error here — it is the
 * protocol. Everything else is degraded (see
 * `rate-limit-store-degraded.error.ts`), including exhausting the attempt
 * budget: contention is what a flood produces, so admitting on exhaustion
 * would sell the flood its own bypass.
 *
 * Round trips: one on the common path, one when the live window is already
 * saturated (the failed write, and nothing after it), three across a
 * rollover (the failed increment, the window transition, the re-counted
 * increment). A failed conditional write still consumes write capacity —
 * a refusal here is bounded, not free.
 *
 * SPEC_DEVIATION: the window transition writes `current_count = :zero`, not
 * `:one` as the original task brief's pseudocode had it. Counting stays the
 * exclusive job of the `ADD` in the increment statement that follows the
 * transition, so the request that triggered a rollover is counted once by
 * that retry rather than twice (once by the transition and again by the
 * retry). This is also the only reading consistent with the approved
 * spec's AC-25, which requires three separate operations across a
 * rollover — the failed increment, the transition, and the increment that
 * follows — not two; a literal `:one` here plus the unconditional retry
 * would double-count instead.
 */

import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { buildThrottleCounterKey } from '../../../shared/persistence/table-keys';
import { RateLimitStoreDegradedError } from '../../domain/rate-limit-store-degraded.error';
import {
  ThrottleCounterSnapshot,
  RateLimitStore,
  ThrottleCounterIdentity,
  ThrottleCounterOutcome,
} from '../../domain/ports/rate-limit-store';
import {
  RawThrottleCounterItem,
  readThrottleCounter,
  readThrottleCounterFromConditionFailure,
  throttleCounterTtlSeconds,
} from './throttle-counter.mapper';
import { RolloverBranch, selectRolloverBranch } from './rollover-branch';

/**
 * Convenience default mirroring `AppConfig.throttleStoreMaxAttempts`'s own
 * default (`environment.schema.ts`'s `DEFAULT_THROTTLE_STORE_MAX_ATTEMPTS`,
 * confirmed in the main checkout — see the task report). Not read from
 * config here: the constructor takes `maxAttempts` explicitly via
 * `ThrottleCounterPolicy`, and the wiring task reads the real config field.
 * This constant exists for tests and any other caller that wants a sane
 * default without reaching into config. Three is enough for a rollover plus
 * one lost race; past that the contention is the signal.
 */
export const DEFAULT_THROTTLE_STORE_MAX_ATTEMPTS = 3;

export interface ThrottleCounterPolicy {
  readonly windowSeconds: number;
  /** Count at which the store stops writing and refuses outright. */
  readonly saturationCeiling: number;
  /** Increment attempts before the request is declared degraded. */
  readonly maxAttempts: number;
}

const INCREMENT_EXPRESSION =
  'ADD current_count :one ' +
  'SET window_start = if_not_exists(window_start, :windowStart), ' +
  'previous_count = if_not_exists(previous_count, :zero), ' +
  '#ttl = if_not_exists(#ttl, :ttl)';

const INCREMENT_CONDITION =
  '(attribute_not_exists(PK) OR window_start = :windowStart) AND ' +
  '(attribute_not_exists(current_count) OR current_count < :ceiling)';

// Self-referencing on purpose: `current_count` is read on the right-hand
// side of the same statement that overwrites it, which DynamoDB evaluates
// against the pre-update item (verified against DynamoDB Local). That is
// what makes the promote a single atomic statement instead of a read
// followed by a write that a concurrent caller could interleave with.
const CARRY_PREVIOUS_EXPRESSION =
  'SET previous_count = current_count, current_count = :zero, ' +
  'window_start = :windowStart, #ttl = :ttl';

const DROP_PREVIOUS_EXPRESSION =
  'SET previous_count = :zero, current_count = :zero, ' +
  'window_start = :windowStart, #ttl = :ttl';

// Guarding on the window that was just read is what keeps every transition
// single-shot: under concurrency exactly one caller's transition lands, and
// the losers fall back into the attempt loop and re-branch on a fresh read.
const TRANSITION_CONDITION = 'window_start = :storedWindowStart';

const TTL_ATTRIBUTE_NAMES = { '#ttl': 'ttl' };

type IncrementAttempt =
  | { readonly kind: 'counted'; readonly counter: ThrottleCounterSnapshot }
  | { readonly kind: 'conflict'; readonly stored: ThrottleCounterSnapshot };

function errorNameOf(error: unknown): string {
  if (error instanceof Error) {
    return error.name === '' ? error.constructor.name : error.name;
  }
  return typeof error;
}

/**
 * Collapses any non-protocol failure into the degraded error, naming the
 * underlying exception class so an operator can tell a timeout from a
 * throughput rejection without anything caller-identifying being recorded.
 */
function toDegraded(
  error: unknown,
  detail: string,
): RateLimitStoreDegradedError {
  return new RateLimitStoreDegradedError(errorNameOf(error), detail);
}

/**
 * `promote-previous` carries the window that just ended forward, so it keeps
 * weighting the new window against a boundary burst. `promote-zero` (an idle
 * gap) and `reset-item` (an unusable future-dated item) both write the same
 * statement — a counter with no meaningful history — for different reasons
 * that `rollover-branch.ts` documents; they stay separate branches because
 * conflating them would hide which situation the store is actually in.
 */
function transitionExpressionFor(branch: RolloverBranch): string {
  return branch.kind === 'promote-previous'
    ? CARRY_PREVIOUS_EXPRESSION
    : DROP_PREVIOUS_EXPRESSION;
}

export class DynamoThrottleCounterRepository implements RateLimitStore {
  constructor(
    private readonly documentClient: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly policy: ThrottleCounterPolicy,
  ) {}

  // `for (;;)` rather than a counted loop for the same reason
  // `DynamoRefreshTokenRepository.rotate` uses one: every path inside either
  // returns or throws, so the code after the loop is unreachable and
  // TypeScript's control-flow analysis agrees.
  //
  // `signal` (FR21) is optional and threaded to every `documentClient.send`
  // call this method makes, across every attempt — the use case (a separate,
  // later task) drives it from one deadline covering the whole request, not
  // one per call, and aborting it here cancels whichever SDK call is
  // actually in flight rather than leaving it to reject unobserved later.
  async countRequest(
    key: ThrottleCounterIdentity,
    currentWindowStart: number,
    signal?: AbortSignal,
  ): Promise<ThrottleCounterOutcome> {
    let windowStart = currentWindowStart;
    for (let attempt = 1; ; attempt++) {
      const result = await this.attemptIncrement(key, windowStart, signal);
      if (result.kind === 'counted') {
        return { kind: 'counted', counter: result.counter };
      }
      const branch = selectRolloverBranch(
        result.stored,
        windowStart,
        this.policy,
      );
      if (branch.kind === 'saturated') {
        return { kind: 'saturated', counter: result.stored };
      }
      this.refuseWhenBudgetSpent(attempt);
      if (branch.kind === 'adopt-stored-window') {
        windowStart = result.stored.windowStart;
        continue;
      }
      await this.applyWindowTransition(
        key,
        branch,
        result.stored,
        windowStart,
        signal,
      );
    }
  }

  private refuseWhenBudgetSpent(attempt: number): void {
    if (attempt < this.policy.maxAttempts) {
      return;
    }
    throw new RateLimitStoreDegradedError(
      'AttemptBudgetExhausted',
      `counter still contended after ${attempt} increment attempts`,
    );
  }

  private async attemptIncrement(
    key: ThrottleCounterIdentity,
    windowStart: number,
    signal: AbortSignal | undefined,
  ): Promise<IncrementAttempt> {
    let attributes: Record<string, unknown> | undefined;
    try {
      const result = await this.documentClient.send(
        this.buildIncrement(key, windowStart),
        signal === undefined ? undefined : { abortSignal: signal },
      );
      attributes = result.Attributes;
    } catch (error: unknown) {
      return { kind: 'conflict', stored: this.readConflictedItem(error) };
    }
    return { kind: 'counted', counter: this.readUpdatedCounter(attributes) };
  }

  private readUpdatedCounter(
    attributes: Record<string, unknown> | undefined,
  ): ThrottleCounterSnapshot {
    try {
      return readThrottleCounter(attributes ?? {});
    } catch (error: unknown) {
      throw toDegraded(error, 'updated counter attributes are unreadable');
    }
  }

  /**
   * The item DynamoDB returned with the failed condition, or a degraded
   * error. An absent `.Item` is degraded rather than a guessed branch:
   * without it there is no way to tell a rollover from a saturated counter,
   * and guessing either way is a limit that silently stops limiting.
   */
  private readConflictedItem(error: unknown): ThrottleCounterSnapshot {
    if (!(error instanceof ConditionalCheckFailedException)) {
      throw toDegraded(error, 'counter increment failed');
    }
    const item: RawThrottleCounterItem | undefined = error.Item;
    if (item === undefined) {
      throw toDegraded(error, 'condition failed without a returned item');
    }
    try {
      return readThrottleCounterFromConditionFailure(item);
    } catch (mappingError: unknown) {
      throw toDegraded(mappingError, 'stored counter item is unreadable');
    }
  }

  /**
   * Loses quietly on purpose: another caller reaching the same conclusion
   * first is a success for this one too, and the attempt loop re-reads and
   * re-branches rather than assuming which branch now applies.
   */
  private async applyWindowTransition(
    key: ThrottleCounterIdentity,
    branch: RolloverBranch,
    stored: ThrottleCounterSnapshot,
    windowStart: number,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    try {
      await this.documentClient.send(
        this.buildTransition(key, branch, stored, windowStart),
        signal === undefined ? undefined : { abortSignal: signal },
      );
    } catch (error: unknown) {
      if (error instanceof ConditionalCheckFailedException) {
        return;
      }
      throw toDegraded(error, 'counter window transition failed');
    }
  }

  private buildIncrement(
    key: ThrottleCounterIdentity,
    windowStart: number,
  ): UpdateCommand {
    return new UpdateCommand({
      TableName: this.tableName,
      Key: buildThrottleCounterKey(key.scope, key.identity, key.routeGroup),
      UpdateExpression: INCREMENT_EXPRESSION,
      ConditionExpression: INCREMENT_CONDITION,
      ExpressionAttributeNames: TTL_ATTRIBUTE_NAMES,
      ExpressionAttributeValues: {
        ':one': 1,
        ':zero': 0,
        ':windowStart': windowStart,
        ':ttl': this.ttlFor(windowStart),
        ':ceiling': this.policy.saturationCeiling,
      },
      ReturnValues: 'ALL_NEW',
      ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
    });
  }

  private buildTransition(
    key: ThrottleCounterIdentity,
    branch: RolloverBranch,
    stored: ThrottleCounterSnapshot,
    windowStart: number,
  ): UpdateCommand {
    return new UpdateCommand({
      TableName: this.tableName,
      Key: buildThrottleCounterKey(key.scope, key.identity, key.routeGroup),
      UpdateExpression: transitionExpressionFor(branch),
      ConditionExpression: TRANSITION_CONDITION,
      ExpressionAttributeNames: TTL_ATTRIBUTE_NAMES,
      ExpressionAttributeValues: {
        ':zero': 0,
        ':windowStart': windowStart,
        ':ttl': this.ttlFor(windowStart),
        ':storedWindowStart': stored.windowStart,
      },
      ReturnValues: 'NONE',
    });
  }

  private ttlFor(windowStart: number): number {
    return throttleCounterTtlSeconds(windowStart, this.policy.windowSeconds);
  }
}
