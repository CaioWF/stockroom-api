import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Provider } from '@nestjs/common';
// Task 2 (src/shared/config/) runs concurrently and its module may not exist
// on disk yet — this import is the documented integration contract from the
// task brief (tableName, awsRegion, dynamodbEndpoint?, all camelCase), not a
// verified path. See the task report for the concurrency note.
import type { AppConfig } from '../config/environment.schema';
import { APP_CONFIG } from '../config/configuration.module';

export type DynamoDocumentClient = DynamoDBDocumentClient;

/**
 * DI token for the shared document client. Nest providers are singletons by
 * default, so this resolves once per running container — DynamoDB
 * connections are reused across invocations, never rebuilt per request.
 */
export const DYNAMO_DOCUMENT_CLIENT = Symbol('DYNAMO_DOCUMENT_CLIENT');

/**
 * Targets the local compose endpoint when configured, default AWS region
 * resolution otherwise — the only branch this module makes on environment.
 */
function buildDynamoClient(config: AppConfig): DynamoDBClient {
  return new DynamoDBClient({
    region: config.awsRegion,
    ...(config.dynamodbEndpoint ? { endpoint: config.dynamodbEndpoint } : {}),
  });
}

export const dynamoClientProvider: Provider = {
  provide: DYNAMO_DOCUMENT_CLIENT,
  useFactory: (config: AppConfig): DynamoDBDocumentClient =>
    DynamoDBDocumentClient.from(buildDynamoClient(config)),
  inject: [APP_CONFIG],
};
