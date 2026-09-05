/**
 * Branch coverage for the conditional-write protocol, against a scripted
 * document client. What is asserted here is the outcome the adapter returns,
 * how many round trips it spends getting there, and the statement it sends
 * for the second write — the statement IS the adapter's behaviour, the same
 * way a request body is an HTTP client's behaviour, and a wrong one is
 * exactly the defect these branches exist to prevent.
 *
 * What this file deliberately does NOT prove: that the protocol is correct
 * under real concurrency. A scripted client replays whatever it is told, so
 * a broken condition expression still "passes" here. That proof lives in
 * test/integration/throttle-counter-repository.int-spec.ts, against real
 * DynamoDB.
 */

import {
  ConditionalCheckFailedException,
  ThrottlingException,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  UpdateCommandOutput,
} from '@aws-sdk/lib-dynamodb';

import { DynamoThrottleCounterRepository } from '../../../../../src/throttling/infrastructure/dynamo/throttle-counter.repository';
import { RateLimitStoreDegradedError } from '../../../../../src/throttling/domain/rate-limit-store-degraded.error';

const TABLE_NAME = 'stockroom-test';
const WINDOW_SECONDS = 60;
const SATURATION_CEILING = 100;
const MAX_ATTEMPTS = 3;
const POLICY = {
  windowSeconds: WINDOW_SECONDS,
  saturationCeiling: SATURATION_CEILING,
  maxAttempts: MAX_ATTEMPTS,
};
const NOW_WINDOW = 600;
const KEY = { scope: 'ip', identity: '203.0.113.7', routeGroup: 'auth' };

type ScriptedReply =
  { readonly ok: Record<string, unknown> } | { readonly fail: Error };

/**
 * Replays `replies` in order, recording every command it was sent. Running
 * past the end of the script is itself a failure — an adapter that keeps
 * writing after its attempt budget should show up as a test error, not as a
 * silently repeated response.
 */
class ScriptedDocumentClient {
  readonly sent: UpdateCommand[] = [];
  readonly signalsSeen: (AbortSignal | undefined)[] = [];

  constructor(private readonly replies: readonly ScriptedReply[]) {}

  send(
    command: UpdateCommand,
    options?: { abortSignal?: AbortSignal },
  ): Promise<UpdateCommandOutput> {
    this.sent.push(command);
    this.signalsSeen.push(options?.abortSignal);
    const reply = this.replies[this.sent.length - 1];
    if (reply === undefined) {
      return Promise.reject(
        new Error(`unscripted command #${this.sent.length}`),
      );
    }
    if ('fail' in reply) {
      return Promise.reject(reply.fail);
    }
    return Promise.resolve({
      Attributes: reply.ok,
      $metadata: {},
    } as UpdateCommandOutput);
  }
}

function repositoryOver(
  replies: readonly ScriptedReply[],
): [DynamoThrottleCounterRepository, ScriptedDocumentClient] {
  const client = new ScriptedDocumentClient(replies);
  const repository = new DynamoThrottleCounterRepository(
    client as unknown as DynamoDBDocumentClient,
    TABLE_NAME,
    POLICY,
  );
  return [repository, client];
}

function storedItem(
  windowStart: number,
  currentCount: number,
  previousCount = 0,
): Record<string, { N: string }> {
  return {
    window_start: { N: String(windowStart) },
    current_count: { N: String(currentCount) },
    previous_count: { N: String(previousCount) },
  };
}

function conditionFailure(item?: Record<string, { N: string }>): Error {
  return new ConditionalCheckFailedException({
    message: 'The conditional request failed',
    $metadata: {},
    Item: item,
  });
}

function updatedAttributes(
  windowStart: number,
  currentCount: number,
  previousCount = 0,
): Record<string, unknown> {
  return {
    window_start: windowStart,
    current_count: currentCount,
    previous_count: previousCount,
    ttl: windowStart + 2 * WINDOW_SECONDS,
  };
}

function valuesOf(command: UpdateCommand): Record<string, unknown> {
  return command.input.ExpressionAttributeValues ?? {};
}

describe('DynamoThrottleCounterRepository.countRequest', () => {
  it('counts a request in one round trip on the common path', async () => {
    const [repository, client] = repositoryOver([
      { ok: updatedAttributes(NOW_WINDOW, 1) },
    ]);

    const outcome = await repository.countRequest(KEY, NOW_WINDOW);

    expect(outcome).toEqual({
      kind: 'counted',
      counter: { windowStart: NOW_WINDOW, currentCount: 1, previousCount: 0 },
    });
    expect(client.sent).toHaveLength(1);
  });

  it('threads an optional AbortSignal to every store call it makes (FR21)', async () => {
    const [repository, client] = repositoryOver([
      { fail: conditionFailure(storedItem(NOW_WINDOW - 60, 42)) },
      { ok: {} },
      { ok: updatedAttributes(NOW_WINDOW, 1, 42) },
    ]);
    const controller = new AbortController();

    await repository.countRequest(KEY, NOW_WINDOW, controller.signal);

    expect(client.signalsSeen).toHaveLength(3);
    expect(
      client.signalsSeen.every((signal) => signal === controller.signal),
    ).toBe(true);
  });

  it('addresses the counter under its own key partition', async () => {
    const [repository, client] = repositoryOver([
      { ok: updatedAttributes(NOW_WINDOW, 1) },
    ]);

    await repository.countRequest(KEY, NOW_WINDOW);

    expect(client.sent[0]?.input.Key).toEqual({
      PK: 'THROTTLE#ip#203.0.113.7',
      SK: 'auth',
    });
    expect(client.sent[0]?.input.TableName).toBe(TABLE_NAME);
  });

  it('writes a TTL two windows past the window start', async () => {
    const [repository, client] = repositoryOver([
      { ok: updatedAttributes(NOW_WINDOW, 1) },
    ]);

    await repository.countRequest(KEY, NOW_WINDOW);

    expect(valuesOf(client.sent[0] as UpdateCommand)[':ttl']).toBe(
      NOW_WINDOW + 2 * WINDOW_SECONDS,
    );
  });

  it('refuses a saturated live window without spending a second write', async () => {
    const [repository, client] = repositoryOver([
      { fail: conditionFailure(storedItem(NOW_WINDOW, SATURATION_CEILING, 4)) },
    ]);

    const outcome = await repository.countRequest(KEY, NOW_WINDOW);

    expect(outcome).toEqual({
      kind: 'saturated',
      counter: {
        windowStart: NOW_WINDOW,
        currentCount: SATURATION_CEILING,
        previousCount: 4,
      },
    });
    expect(client.sent).toHaveLength(1);
  });

  it('promotes the prior window and re-counts in three round trips', async () => {
    const [repository, client] = repositoryOver([
      { fail: conditionFailure(storedItem(NOW_WINDOW - 60, 42)) },
      { ok: {} },
      { ok: updatedAttributes(NOW_WINDOW, 1, 42) },
    ]);

    const outcome = await repository.countRequest(KEY, NOW_WINDOW);

    expect(outcome).toEqual({
      kind: 'counted',
      counter: { windowStart: NOW_WINDOW, currentCount: 1, previousCount: 42 },
    });
    expect(client.sent).toHaveLength(3);
  });

  it('carries the ended window forward as previous_count, guarded by the window it read', async () => {
    const [repository, client] = repositoryOver([
      { fail: conditionFailure(storedItem(NOW_WINDOW - 60, 42)) },
      { ok: {} },
      { ok: updatedAttributes(NOW_WINDOW, 1, 42) },
    ]);

    await repository.countRequest(KEY, NOW_WINDOW);

    const promote = client.sent[1] as UpdateCommand;
    expect(promote.input.UpdateExpression).toContain(
      'previous_count = current_count',
    );
    expect(promote.input.ConditionExpression).toBe(
      'window_start = :storedWindowStart',
    );
    expect(valuesOf(promote)[':storedWindowStart']).toBe(NOW_WINDOW - 60);
    expect(valuesOf(promote)[':windowStart']).toBe(NOW_WINDOW);
  });

  it('promotes a literal zero when the caller was idle for two or more windows', async () => {
    const [repository, client] = repositoryOver([
      { fail: conditionFailure(storedItem(NOW_WINDOW - 600, 42)) },
      { ok: {} },
      { ok: updatedAttributes(NOW_WINDOW, 1) },
    ]);

    const outcome = await repository.countRequest(KEY, NOW_WINDOW);

    const promote = client.sent[1] as UpdateCommand;
    expect(promote.input.UpdateExpression).toContain('previous_count = :zero');
    expect(promote.input.UpdateExpression).not.toContain(
      'previous_count = current_count',
    );
    expect(outcome.counter.previousCount).toBe(0);
  });

  it('adopts a slightly-ahead stored window instead of promoting it', async () => {
    const [repository, client] = repositoryOver([
      { fail: conditionFailure(storedItem(NOW_WINDOW + 60, 3)) },
      { ok: updatedAttributes(NOW_WINDOW + 60, 4) },
    ]);

    const outcome = await repository.countRequest(KEY, NOW_WINDOW);

    expect(client.sent).toHaveLength(2);
    expect(client.sent[1]?.input.UpdateExpression).toContain(
      'ADD current_count :one',
    );
    expect(valuesOf(client.sent[1] as UpdateCommand)[':windowStart']).toBe(
      NOW_WINDOW + 60,
    );
    expect(outcome.kind).toBe('counted');
  });

  it('resets an item whose window is far in the future rather than adopting it', async () => {
    const [repository, client] = repositoryOver([
      { fail: conditionFailure(storedItem(NOW_WINDOW + 86400, 3)) },
      { ok: {} },
      { ok: updatedAttributes(NOW_WINDOW, 1) },
    ]);

    const outcome = await repository.countRequest(KEY, NOW_WINDOW);

    const reset = client.sent[1] as UpdateCommand;
    expect(reset.input.UpdateExpression).toContain(
      'window_start = :windowStart',
    );
    expect(reset.input.UpdateExpression).toContain('previous_count = :zero');
    expect(valuesOf(reset)[':windowStart']).toBe(NOW_WINDOW);
    expect(valuesOf(reset)[':storedWindowStart']).toBe(NOW_WINDOW + 86400);
    expect(outcome.kind).toBe('counted');
  });

  it('re-reads and re-branches when its own promote loses the race', async () => {
    const [repository] = repositoryOver([
      { fail: conditionFailure(storedItem(NOW_WINDOW - 60, 42)) },
      { fail: conditionFailure(storedItem(NOW_WINDOW, 1, 42)) },
      { ok: updatedAttributes(NOW_WINDOW, 2, 42) },
    ]);

    const outcome = await repository.countRequest(KEY, NOW_WINDOW);

    expect(outcome).toEqual({
      kind: 'counted',
      counter: { windowStart: NOW_WINDOW, currentCount: 2, previousCount: 42 },
    });
  });

  it('degrades, never admits, when the attempt budget runs out under contention', async () => {
    const [repository, client] = repositoryOver([
      { fail: conditionFailure(storedItem(NOW_WINDOW - 60, 42)) },
      { ok: {} },
      { fail: conditionFailure(storedItem(NOW_WINDOW - 60, 42)) },
      { ok: {} },
      { fail: conditionFailure(storedItem(NOW_WINDOW - 60, 42)) },
    ]);

    await expect(repository.countRequest(KEY, NOW_WINDOW)).rejects.toThrow(
      RateLimitStoreDegradedError,
    );
    expect(client.sent.length).toBeLessThanOrEqual(2 * MAX_ATTEMPTS);
  });
});

describe('DynamoThrottleCounterRepository error taxonomy', () => {
  it('degrades on a throttling exception and names it for the operator', async () => {
    const [repository] = repositoryOver([
      {
        fail: new ThrottlingException({
          message: 'slow down',
          $metadata: {},
        }),
      },
    ]);

    await expect(
      repository.countRequest(KEY, NOW_WINDOW),
    ).rejects.toMatchObject({
      name: 'RateLimitStoreDegradedError',
      underlyingErrorName: 'ThrottlingException',
    });
  });

  it('degrades on a transport timeout', async () => {
    const timeout = new Error('socket hang up');
    timeout.name = 'TimeoutError';
    const [repository] = repositoryOver([{ fail: timeout }]);

    await expect(
      repository.countRequest(KEY, NOW_WINDOW),
    ).rejects.toMatchObject({
      name: 'RateLimitStoreDegradedError',
      underlyingErrorName: 'TimeoutError',
    });
  });

  it('degrades when a conditional failure carries no item to branch on', async () => {
    const [repository] = repositoryOver([
      { fail: conditionFailure(undefined) },
    ]);

    await expect(repository.countRequest(KEY, NOW_WINDOW)).rejects.toThrow(
      RateLimitStoreDegradedError,
    );
  });

  it('degrades when the stored item cannot be read as a counter', async () => {
    const [repository] = repositoryOver([
      { fail: conditionFailure({ current_count: { N: '4' } }) },
    ]);

    await expect(repository.countRequest(KEY, NOW_WINDOW)).rejects.toThrow(
      RateLimitStoreDegradedError,
    );
  });

  it('never turns a conditional failure itself into a degraded outcome', async () => {
    const [repository] = repositoryOver([
      { fail: conditionFailure(storedItem(NOW_WINDOW, SATURATION_CEILING)) },
    ]);

    await expect(
      repository.countRequest(KEY, NOW_WINDOW),
    ).resolves.toMatchObject({ kind: 'saturated' });
  });
});
