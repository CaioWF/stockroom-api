/**
 * A DynamoDB document client for throttling ONLY, deliberately separate from
 * `DYNAMO_DOCUMENT_CLIENT` in `src/shared/persistence/dynamo-client.provider.ts`.
 *
 * The shared client is used by both auth repositories and must keep the
 * SDK's default retry strategy — sign-in and refresh rotation depend on it
 * to ride out transient errors. This client turns retries OFF, which is only
 * correct for throttling: `ADD current_count :one` is not idempotent, so an
 * SDK-level retry after a lost response would count one request twice. With
 * retries disabled a timeout means "outcome unknown", which the caller
 * degrades on, rather than "possibly applied twice".
 *
 * Extending or wrapping the shared client instead would take that retry
 * behaviour away from auth as a side effect, which is the specific mistake
 * this file exists to prevent.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Provider } from '@nestjs/common';

import type { AppConfig } from '../../../shared/config/environment.schema';
import { APP_CONFIG } from '../../../shared/config/configuration.module';

/**
 * DI token for the throttling client. Its own symbol, never
 * `DYNAMO_DOCUMENT_CLIENT`: two tokens is what keeps the two retry policies
 * from being one edit away from each other.
 */
export const THROTTLE_DYNAMO_DOCUMENT_CLIENT = Symbol(
  'THROTTLE_DYNAMO_DOCUMENT_CLIENT',
);

// Per-SDK-CALL bounds, not the per-request deadline. The use case enforces
// one deadline across a request that may spend up to three calls, so each
// call has to fail well inside it — these two together are a fraction of any
// sane deadline, leaving room for the calls a rollover needs.
export const THROTTLE_SDK_CONNECTION_TIMEOUT_MS = 150;
export const THROTTLE_SDK_REQUEST_TIMEOUT_MS = 250;

/** The region and endpoint fields this client reads; nothing else. */
export type ThrottleDynamoClientConfig = Pick<
  AppConfig,
  'awsRegion' | 'dynamodbEndpoint'
>;

export function buildThrottleDynamoClient(
  config: ThrottleDynamoClientConfig,
): DynamoDBClient {
  return new DynamoDBClient({
    region: config.awsRegion,
    // One attempt, no retry strategy. See this module's header.
    maxAttempts: 1,
    requestHandler: {
      connectionTimeout: THROTTLE_SDK_CONNECTION_TIMEOUT_MS,
      requestTimeout: THROTTLE_SDK_REQUEST_TIMEOUT_MS,
    },
    ...(config.dynamodbEndpoint ? { endpoint: config.dynamodbEndpoint } : {}),
  });
}

export const throttleDynamoClientProvider: Provider = {
  provide: THROTTLE_DYNAMO_DOCUMENT_CLIENT,
  useFactory: (config: AppConfig): DynamoDBDocumentClient =>
    DynamoDBDocumentClient.from(buildThrottleDynamoClient(config)),
  inject: [APP_CONFIG],
};
