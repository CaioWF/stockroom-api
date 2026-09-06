import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import {
  CatalogQueryFailedError,
  DynamoProductRepository,
} from '../../../../../src/catalog/infrastructure/dynamo/product.repository';
import {
  LogSink,
  StructuredLogger,
} from '../../../../../src/shared/observability/structured-logger';

type DocumentClientCommand = Parameters<DynamoDBDocumentClient['send']>[0];

class FailingDocumentClient {
  send(command: DocumentClientCommand): Promise<unknown> {
    void command;
    return Promise.reject(new Error('raw dynamo failure'));
  }
}

describe('DynamoProductRepository', () => {
  it('logs and wraps store failures before they leave the adapter', async () => {
    const lines: string[] = [];
    const sink: LogSink = (line) => lines.push(line);
    const repository = new DynamoProductRepository(
      new FailingDocumentClient() as unknown as DynamoDBDocumentClient,
      'products',
      new StructuredLogger(sink),
    );

    await expect(
      repository.list({ accountId: 'account-1', limit: 25 }),
    ).rejects.toBeInstanceOf(CatalogQueryFailedError);
    const fields = parseCatalogFailureLog(lines[0] ?? '{}');

    expect(fields).toEqual({
      event: 'catalog_query_failed',
      accountId: 'account-1',
      durationMs: fields.durationMs,
      context: 'catalog',
    });
    expect(fields.durationMs).toBeGreaterThanOrEqual(0);
  });
});

interface CatalogFailureLog {
  readonly event: string;
  readonly accountId: string;
  readonly durationMs: number;
  readonly context: string;
}

function parseCatalogFailureLog(line: string): CatalogFailureLog {
  const value = JSON.parse(line) as unknown;
  if (!isCatalogFailureLog(value)) {
    throw new Error('log line did not match catalog failure shape');
  }
  return value;
}

function isCatalogFailureLog(value: unknown): value is CatalogFailureLog {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const fields = value as Record<string, unknown>;
  return (
    typeof fields.event === 'string' &&
    typeof fields.accountId === 'string' &&
    typeof fields.durationMs === 'number' &&
    typeof fields.context === 'string'
  );
}
