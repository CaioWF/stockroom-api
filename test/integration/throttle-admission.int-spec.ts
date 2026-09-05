/**
 * `DecideRequestAdmissionUseCase` against real DynamoDB Local (AC-9): what
 * only the real store can prove about this use case's composition — that
 * under genuine concurrency the store path stays healthy end to end (no
 * `throttle_degraded` ever fires) and the domain policy's admission count
 * stays correctly bounded. `throttle-counter-repository.int-spec.ts` already
 * proves the storage protocol itself against real DynamoDB; this suite
 * proves the layer above it, which only exists here — a repository-level
 * test alone cannot exercise the fallback/degraded-event wiring, because
 * both only exist at the use-case level.
 *
 * Same local-DynamoDB environment as the sibling suite: dummy credentials,
 * the local compose endpoint, `ensureTableExists` once per suite.
 */

import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

import { ensureTableExists } from '../../scripts/create-table';
import { DynamoThrottleCounterRepository } from '../../src/throttling/infrastructure/dynamo/throttle-counter.repository';
import { InstanceLocalLimiter } from '../../src/throttling/infrastructure/local/instance-local-limiter';
import { buildThrottleCounterKey } from '../../src/shared/persistence/table-keys';
import { ThrottleCounterIdentity } from '../../src/throttling/domain/ports/rate-limit-store';
import { StructuredLogger } from '../../src/shared/observability/structured-logger';
import { RateLimitPolicy } from '../../src/throttling/domain/rate-limit-policy';
import {
  AdmissionRequest,
  DecideRequestAdmissionUseCase,
} from '../../src/throttling/application/decide-request-admission.usecase';
import { ControllableClock } from '../fakes/controllable-clock';

const TABLE_NAME = 'stockroom-throttling-integration-test';
const AWS_REGION = 'us-east-1';
const DYNAMODB_ENDPOINT = 'http://localhost:8000';
const DUMMY_CREDENTIALS = { accessKeyId: 'local', secretAccessKey: 'local' };
const WINDOW_SECONDS = 60;
const SAME_INSTANT = new Date('2024-06-01T00:00:00.000Z');
const STORE_DEADLINE_MS = 2_000;

function buildLocalDynamoClient(): DynamoDBClient {
  return new DynamoDBClient({
    region: AWS_REGION,
    endpoint: DYNAMODB_ENDPOINT,
    credentials: DUMMY_CREDENTIALS,
  });
}

async function rawCurrentCount(
  documentClient: DynamoDBDocumentClient,
  key: ThrottleCounterIdentity,
): Promise<number> {
  const result = await documentClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: buildThrottleCounterKey(key.scope, key.identity, key.routeGroup),
    }),
  );
  return Number(result.Item?.current_count ?? 0);
}

describe('DecideRequestAdmissionUseCase (integration, real DynamoDB)', () => {
  let documentClient: DynamoDBDocumentClient;

  beforeAll(async () => {
    const client = buildLocalDynamoClient();
    await ensureTableExists(client, TABLE_NAME);
    documentClient = DynamoDBDocumentClient.from(client);
  });

  // One shared store instance, mirroring what several concurrent Lambda
  // invocations against the same table would look like — the concurrency
  // guarantee under test is the store's, not this constructor's.
  function buildSharedStore(
    saturationCeiling: number,
  ): DynamoThrottleCounterRepository {
    return new DynamoThrottleCounterRepository(documentClient, TABLE_NAME, {
      windowSeconds: WINDOW_SECONDS,
      saturationCeiling,
      maxAttempts: 5,
    });
  }

  // Every instance below gets its OWN Clock and OWN fallback limiter (as if
  // running on separate hosts), fixed to the SAME instant so they all
  // compute the same window and genuinely race on one shared identity.
  function buildIndependentUseCase(
    store: DynamoThrottleCounterRepository,
    lines: Record<string, unknown>[],
  ): DecideRequestAdmissionUseCase {
    const logger = new StructuredLogger((line) =>
      lines.push(JSON.parse(line) as Record<string, unknown>),
    );
    return new DecideRequestAdmissionUseCase(
      store,
      new ControllableClock(SAME_INSTANT),
      new InstanceLocalLimiter({ maxEntries: 100 }),
      logger,
      STORE_DEADLINE_MS,
      1,
    );
  }

  it('bounds concurrent admissions to the limit, loses no increment, and never degrades (AC-9)', async () => {
    const requestCount = 12;
    const limit = 3;
    const saturationCeiling = 20; // well above requestCount: no store-side saturation branch here
    const policy: RateLimitPolicy = {
      limit,
      windowSeconds: WINDOW_SECONDS,
      saturationCeiling,
    };
    const identity: ThrottleCounterIdentity = {
      scope: 'ip',
      identity: randomUUID(),
      routeGroup: 'default',
    };
    const store = buildSharedStore(saturationCeiling);
    const allLoggedLines: Record<string, unknown>[] = [];

    const request: AdmissionRequest = {
      scope: identity.scope as AdmissionRequest['scope'],
      identity: identity.identity,
      routeGroup: identity.routeGroup as AdmissionRequest['routeGroup'],
      policy,
    };

    const decisions = await Promise.all(
      Array.from({ length: requestCount }, () =>
        buildIndependentUseCase(store, allLoggedLines).decide(request),
      ),
    );

    const admittedCount = decisions.filter(
      (decision) => decision.kind === 'admitted',
    ).length;
    const refusedCount = decisions.filter(
      (decision) => decision.kind === 'refused',
    ).length;
    expect(admittedCount).toBeLessThanOrEqual(limit);
    expect(admittedCount + refusedCount).toBe(requestCount);

    const storedCount = await rawCurrentCount(documentClient, identity);
    expect(storedCount).toBe(requestCount);

    expect(
      allLoggedLines.some((line) => line.event === 'throttle_degraded'),
    ).toBe(false);
  });
});
