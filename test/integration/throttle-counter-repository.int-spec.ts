/**
 * What only a real DynamoDB engine can prove about the conditional-increment
 * protocol (plan.md: integration tests are "reserved for what only the real
 * engine can prove"). `throttle-counter.repository.spec.ts` proves the
 * adapter sends the right statement for each branch against a scripted
 * client; a scripted client replays whatever it is told, so a condition
 * expression that is subtly wrong (e.g. accepted by DynamoDB Local in a way
 * the author did not expect) would still "pass" there. This suite runs the
 * exact same statements against DynamoDB Local instead.
 *
 * Same local-DynamoDB environment as `user-repository.int-spec.ts`: dummy
 * credentials, the local compose endpoint, `ensureTableExists` once per
 * suite. Every test below uses its own randomly generated identity so no
 * truncation between tests is needed.
 */

import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

import { ensureTableExists } from '../../scripts/create-table';
import { DynamoThrottleCounterRepository } from '../../src/throttling/infrastructure/dynamo/throttle-counter.repository';
import { buildThrottleCounterKey } from '../../src/shared/persistence/table-keys';
import { ThrottleCounterIdentity } from '../../src/throttling/domain/ports/rate-limit-store';

const TABLE_NAME = 'stockroom-throttling-integration-test';
const AWS_REGION = 'us-east-1';
const DYNAMODB_ENDPOINT = 'http://localhost:8000';
const DUMMY_CREDENTIALS = { accessKeyId: 'local', secretAccessKey: 'local' };
const WINDOW_SECONDS = 60;
const NOW_WINDOW = 1_700_000_000 - (1_700_000_000 % WINDOW_SECONDS);

function buildLocalDynamoClient(): DynamoDBClient {
  return new DynamoDBClient({
    region: AWS_REGION,
    endpoint: DYNAMODB_ENDPOINT,
    credentials: DUMMY_CREDENTIALS,
  });
}

type DocumentClientCommand = Parameters<DynamoDBDocumentClient['send']>[0];

/**
 * Wraps a real document client to count every `send` call this test issues
 * through it, so operation-count assertions read the actual number of round
 * trips rather than an assumption about them. `ReturnConsumedCapacity` is
 * deliberately not used for the same purpose (per the brief): a failed
 * conditional write carries no `ConsumedCapacity`, so it would undercount.
 */
class CountingDocumentClient {
  callCount = 0;

  constructor(private readonly inner: DynamoDBDocumentClient) {}

  // No explicit return type: `DynamoDBDocumentClient['send']` is overloaded,
  // and `ReturnType<>` on an overloaded signature picks one specific
  // overload rather than the union `command`'s own type actually resolves
  // to here — annotating it that way doesn't typecheck. Inferred instead;
  // this class is only ever used cast through `unknown` at its injection
  // site (`repositoryWith` below), so callers never see this type directly.
  send(command: DocumentClientCommand) {
    this.callCount++;
    return this.inner.send(command);
  }
}

function freshIdentity(routeGroup: string): ThrottleCounterIdentity {
  return { scope: 'ip', identity: randomUUID(), routeGroup };
}

async function rawGetItem(
  documentClient: DynamoDBDocumentClient,
  key: ThrottleCounterIdentity,
): Promise<Record<string, unknown> | undefined> {
  const result = await documentClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: buildThrottleCounterKey(key.scope, key.identity, key.routeGroup),
    }),
  );
  return result.Item;
}

async function seedRawItem(
  documentClient: DynamoDBDocumentClient,
  key: ThrottleCounterIdentity,
  attributes: {
    windowStart: number;
    currentCount: number;
    previousCount: number;
  },
): Promise<void> {
  await documentClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...buildThrottleCounterKey(key.scope, key.identity, key.routeGroup),
        window_start: attributes.windowStart,
        current_count: attributes.currentCount,
        previous_count: attributes.previousCount,
        ttl: attributes.windowStart + 2 * WINDOW_SECONDS,
      },
    }),
  );
}

describe('DynamoThrottleCounterRepository (integration)', () => {
  let documentClient: DynamoDBDocumentClient;

  beforeAll(async () => {
    const client = buildLocalDynamoClient();
    await ensureTableExists(client, TABLE_NAME);
    documentClient = DynamoDBDocumentClient.from(client);
  });

  function repositoryWith(
    counter: CountingDocumentClient,
    saturationCeiling: number,
    maxAttempts = 5,
  ): DynamoThrottleCounterRepository {
    return new DynamoThrottleCounterRepository(
      counter as unknown as DynamoDBDocumentClient,
      TABLE_NAME,
      { windowSeconds: WINDOW_SECONDS, saturationCeiling, maxAttempts },
    );
  }

  it('counts a request in exactly one round trip on the common path (AC-25)', async () => {
    const counter = new CountingDocumentClient(documentClient);
    const repository = repositoryWith(counter, 100);
    const key = freshIdentity('common-path');

    const outcome = await repository.countRequest(key, NOW_WINDOW);

    expect(outcome).toEqual({
      kind: 'counted',
      counter: { windowStart: NOW_WINDOW, currentCount: 1, previousCount: 0 },
    });
    expect(counter.callCount).toBe(1);
  });

  it('promotes the previous window across a real rollover in exactly three round trips (AC-25)', async () => {
    const key = freshIdentity('rollover');
    const seedRepository = repositoryWith(
      new CountingDocumentClient(documentClient),
      100,
    );
    await seedRepository.countRequest(key, NOW_WINDOW);
    await seedRepository.countRequest(key, NOW_WINDOW);
    await seedRepository.countRequest(key, NOW_WINDOW);

    const counter = new CountingDocumentClient(documentClient);
    const repository = repositoryWith(counter, 100);
    const outcome = await repository.countRequest(
      key,
      NOW_WINDOW + WINDOW_SECONDS,
    );

    expect(outcome).toEqual({
      kind: 'counted',
      counter: {
        windowStart: NOW_WINDOW + WINDOW_SECONDS,
        currentCount: 1,
        previousCount: 3,
      },
    });
    // Failed increment (wrong window), the promote transition, the retried
    // increment: three round trips, never the naive read-then-write two.
    expect(counter.callCount).toBe(3);
  });

  it('keeps a burst straddling a real rollover boundary near its true total, not double- or under-counted (AC-8)', async () => {
    const key = freshIdentity('boundary-burst');
    const repository = repositoryWith(
      new CountingDocumentClient(documentClient),
      100,
    );
    const burstSize = 4;

    for (let i = 0; i < burstSize; i++) {
      await repository.countRequest(key, NOW_WINDOW);
    }
    let lastOutcome;
    for (let i = 0; i < burstSize; i++) {
      lastOutcome = await repository.countRequest(
        key,
        NOW_WINDOW + WINDOW_SECONDS,
      );
    }

    // The pre-boundary burst survives intact as `previousCount` (nothing
    // lost to the rollover), and the post-boundary burst lands as its own
    // `currentCount` (nothing double-counted into the old window) — the two
    // together are exactly `2 * burstSize`, which is what a real weighted
    // estimate needs to stay near the true rate across the boundary.
    expect(lastOutcome).toEqual({
      kind: 'counted',
      counter: {
        windowStart: NOW_WINDOW + WINDOW_SECONDS,
        currentCount: burstSize,
        previousCount: burstSize,
      },
    });
  });

  it('lets exactly one concurrent promote win while the other request still counts (AC-10)', async () => {
    const key = freshIdentity('promote-race');
    const seedCounter = new CountingDocumentClient(documentClient);
    const seedRepository = repositoryWith(seedCounter, 100);
    const staleCount = 5;
    for (let i = 0; i < staleCount; i++) {
      await seedRepository.countRequest(key, NOW_WINDOW);
    }

    const repositoryA = repositoryWith(
      new CountingDocumentClient(documentClient),
      100,
    );
    const repositoryB = repositoryWith(
      new CountingDocumentClient(documentClient),
      100,
    );
    const newWindow = NOW_WINDOW + WINDOW_SECONDS;

    const [outcomeA, outcomeB] = await Promise.all([
      repositoryA.countRequest(key, newWindow),
      repositoryB.countRequest(key, newWindow),
    ]);

    expect(outcomeA.kind).toBe('counted');
    expect(outcomeB.kind).toBe('counted');
    expect(outcomeA.counter.previousCount).toBe(staleCount);
    expect(outcomeB.counter.previousCount).toBe(staleCount);
    // Both requests are counted (FR8-style: contention never drops a
    // request), so the two independent increments land as 1 and 2 in some
    // order — never both landing on 1, which would mean one was lost.
    const currentCounts = [
      outcomeA.counter.currentCount,
      outcomeB.counter.currentCount,
    ].sort();
    expect(currentCounts).toEqual([1, 2]);
  });

  it('straddles a boundary between two independent clients without a lost increment, a double promote, or a false degraded outcome (AC-10)', async () => {
    const key = freshIdentity('straddling-clocks');
    const repositoryOld = repositoryWith(
      new CountingDocumentClient(documentClient),
      100,
    );
    const repositoryNew = repositoryWith(
      new CountingDocumentClient(documentClient),
      100,
    );

    // Two independently-clocked instances read the boundary on opposite
    // sides of it and race their first-ever request for this identity —
    // nothing seeded, so there is no "correct" winner, only the invariant
    // that both requests land somewhere and neither is lost.
    const results = await Promise.allSettled([
      repositoryOld.countRequest(key, NOW_WINDOW),
      repositoryNew.countRequest(key, NOW_WINDOW + WINDOW_SECONDS),
    ]);

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    const item = await rawGetItem(documentClient, key);
    const currentCount = Number(item?.current_count ?? 0);
    const previousCount = Number(item?.previous_count ?? 0);
    expect(currentCount + previousCount).toBe(2);
  });

  it('resets an item whose stored window is far in the future rather than adopting it (AC-11)', async () => {
    const key = freshIdentity('far-future-reset');
    const farFutureWindow = NOW_WINDOW + 10 * WINDOW_SECONDS;
    await seedRawItem(documentClient, key, {
      windowStart: farFutureWindow,
      currentCount: 7,
      previousCount: 2,
    });

    const counter = new CountingDocumentClient(documentClient);
    const repository = repositoryWith(counter, 100);
    const outcome = await repository.countRequest(key, NOW_WINDOW);

    expect(outcome).toEqual({
      kind: 'counted',
      counter: { windowStart: NOW_WINDOW, currentCount: 1, previousCount: 0 },
    });
    // Failed increment, the reset transition, the retried increment.
    expect(counter.callCount).toBe(3);
  });

  it('refuses over the ceiling with no further write, verified by a fresh read (AC-6)', async () => {
    const key = freshIdentity('over-ceiling');
    const ceiling = 2;
    const repository = repositoryWith(
      new CountingDocumentClient(documentClient),
      ceiling,
    );
    await repository.countRequest(key, NOW_WINDOW);
    await repository.countRequest(key, NOW_WINDOW);

    const counter = new CountingDocumentClient(documentClient);
    const refusingRepository = repositoryWith(counter, ceiling);
    const outcome = await refusingRepository.countRequest(key, NOW_WINDOW);

    expect(outcome).toEqual({
      kind: 'saturated',
      counter: {
        windowStart: NOW_WINDOW,
        currentCount: ceiling,
        previousCount: 0,
      },
    });
    // The failed conditional write is the only round trip — refusing never
    // spends a second write.
    expect(counter.callCount).toBe(1);

    const item = await rawGetItem(documentClient, key);
    expect(item?.current_count).toBe(ceiling);
  });

  it('stores a TTL exactly two windows past the window start (AC-24)', async () => {
    const key = freshIdentity('ttl');
    const repository = repositoryWith(
      new CountingDocumentClient(documentClient),
      100,
    );

    await repository.countRequest(key, NOW_WINDOW);

    const item = await rawGetItem(documentClient, key);
    expect(item?.ttl).toBe(NOW_WINDOW + 2 * WINDOW_SECONDS);
  });
});
