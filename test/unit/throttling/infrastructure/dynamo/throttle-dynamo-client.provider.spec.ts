/**
 * The throttling client is deliberately NOT the shared one. Two properties
 * are load-bearing and both are asserted here against the resolved SDK
 * config rather than against the arguments we passed in:
 *
 * - retries disabled, because `ADD current_count :one` is not idempotent and
 *   an SDK retry after a lost response would double-count a request;
 * - short per-call timeouts, so a stalled call surfaces as a failure well
 *   inside the per-request deadline the use case enforces across what may
 *   be several calls.
 *
 * Reading them back means a future "harmless" tidy-up that drops either one
 * fails here instead of in production.
 */

// MUST stay first: both imports below reach `configuration.module.ts`, which
// parses the environment the moment it is required.
import './set-throttle-test-environment';

import { DYNAMO_DOCUMENT_CLIENT } from '../../../../../src/shared/persistence/dynamo-client.provider';
import {
  THROTTLE_DYNAMO_DOCUMENT_CLIENT,
  THROTTLE_SDK_CONNECTION_TIMEOUT_MS,
  THROTTLE_SDK_REQUEST_TIMEOUT_MS,
  buildThrottleDynamoClient,
} from '../../../../../src/throttling/infrastructure/dynamo/throttle-dynamo-client.provider';

interface ResolvedHandlerConfig {
  readonly connectionTimeout?: number;
  readonly requestTimeout?: number;
}

interface IntrospectableHandler {
  readonly configProvider?: Promise<ResolvedHandlerConfig>;
}

async function handlerTimeouts(
  client: ReturnType<typeof buildThrottleDynamoClient>,
): Promise<ResolvedHandlerConfig> {
  const handler = client.config
    .requestHandler as unknown as IntrospectableHandler;
  return (await handler.configProvider) ?? {};
}

describe('buildThrottleDynamoClient', () => {
  it('disables the SDK retry strategy, because the increment is not idempotent', async () => {
    const client = buildThrottleDynamoClient({ awsRegion: 'us-east-1' });

    await expect(client.config.maxAttempts()).resolves.toBe(1);
  });

  it('uses the configured region', async () => {
    const client = buildThrottleDynamoClient({ awsRegion: 'sa-east-1' });

    await expect(client.config.region()).resolves.toBe('sa-east-1');
  });

  it('bounds every call with a connection and a request timeout', async () => {
    const client = buildThrottleDynamoClient({ awsRegion: 'us-east-1' });

    const timeouts = await handlerTimeouts(client);

    expect(timeouts.connectionTimeout).toBe(THROTTLE_SDK_CONNECTION_TIMEOUT_MS);
    expect(timeouts.requestTimeout).toBe(THROTTLE_SDK_REQUEST_TIMEOUT_MS);
  });

  it('keeps those timeouts short enough to sit inside a per-request deadline', () => {
    expect(THROTTLE_SDK_CONNECTION_TIMEOUT_MS).toBeGreaterThan(0);
    expect(THROTTLE_SDK_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
    expect(
      THROTTLE_SDK_CONNECTION_TIMEOUT_MS + THROTTLE_SDK_REQUEST_TIMEOUT_MS,
    ).toBeLessThan(1000);
  });
});

describe('THROTTLE_DYNAMO_DOCUMENT_CLIENT', () => {
  it('is its own injection token, so the shared client keeps its retries', () => {
    expect(THROTTLE_DYNAMO_DOCUMENT_CLIENT).not.toBe(DYNAMO_DOCUMENT_CLIENT);
  });
});
