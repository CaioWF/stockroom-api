import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

import { ensureTableExists } from '../../scripts/create-table';
import { Product } from '../../src/catalog/domain/product';
import { Money } from '../../src/catalog/domain/money';
import { DynamoProductRepository } from '../../src/catalog/infrastructure/dynamo/product.repository';
import { toProductItem } from '../../src/catalog/infrastructure/dynamo/product.mapper';
import { buildProductKey } from '../../src/shared/persistence/table-keys';

const TABLE_NAME = 'stockroom-catalog-integration-test';
const AWS_REGION = 'us-east-1';
const DYNAMODB_ENDPOINT = 'http://localhost:8000';
const DUMMY_CREDENTIALS = { accessKeyId: 'local', secretAccessKey: 'local' };
const IDS = [
  '018f2f3c-0000-7000-8000-000000000001',
  '018f2f3c-0001-7000-8000-000000000002',
  '018f2f3c-0002-7000-8000-000000000003',
] as const;

type DocumentClientCommand = Parameters<DynamoDBDocumentClient['send']>[0];

class CountingDocumentClient {
  callCount = 0;

  constructor(private readonly inner: DynamoDBDocumentClient) {}

  send(command: DocumentClientCommand) {
    this.callCount++;
    return this.inner.send(command);
  }
}

function buildLocalDynamoClient(): DynamoDBClient {
  return new DynamoDBClient({
    region: AWS_REGION,
    endpoint: DYNAMODB_ENDPOINT,
    credentials: DUMMY_CREDENTIALS,
  });
}

function product(id: string, name: string): Product {
  return {
    id,
    name,
    sku: `SKU-${id.slice(-4)}`,
    price: Money.fromMinorUnits(1299, 'USD'),
    createdAt: new Date('2026-09-05T12:00:00.000Z'),
  };
}

async function seedProduct(
  documentClient: DynamoDBDocumentClient,
  accountId: string,
  item: Product,
): Promise<void> {
  await documentClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: toProductItem(accountId, item),
    }),
  );
}

async function readRawProduct(
  documentClient: DynamoDBDocumentClient,
  accountId: string,
  productId: string,
): Promise<Record<string, unknown> | undefined> {
  const result = await documentClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: buildProductKey(accountId, productId),
    }),
  );
  return result.Item;
}

describe('DynamoProductRepository (integration)', () => {
  let documentClient: DynamoDBDocumentClient;

  beforeAll(async () => {
    const client = buildLocalDynamoClient();
    await ensureTableExists(client, TABLE_NAME);
    documentClient = DynamoDBDocumentClient.from(client);
  });

  it('reads a product immediately after write and stores no ttl attribute', async () => {
    const accountId = randomUUID();
    const item = product(IDS[0], 'Visible product');
    await seedProduct(documentClient, accountId, item);

    const repository = new DynamoProductRepository(documentClient, TABLE_NAME);
    const page = await repository.list({ accountId, limit: 25 });
    const rawItem = await readRawProduct(documentClient, accountId, item.id);

    expect(page.items).toEqual([item]);
    expect(page.nextCursor).toBeNull();
    expect(rawItem).not.toHaveProperty('ttl');
  });

  it('walks pages in sort-key order with one query per page', async () => {
    const accountId = randomUUID();
    for (const [index, id] of IDS.entries()) {
      await seedProduct(
        documentClient,
        accountId,
        product(id, `Item ${index}`),
      );
    }
    const counter = new CountingDocumentClient(documentClient);
    const repository = new DynamoProductRepository(
      counter as unknown as DynamoDBDocumentClient,
      TABLE_NAME,
    );

    const first = await repository.list({ accountId, limit: 2 });
    const second = await repository.list({
      accountId,
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });

    expect(first.items.map((item) => item.id)).toEqual([IDS[0], IDS[1]]);
    expect(first.nextCursor).not.toBeNull();
    expect(second.items.map((item) => item.id)).toEqual([IDS[2]]);
    expect(second.nextCursor).toBeNull();
    expect(counter.callCount).toBe(2);
  });

  it('returns same-millisecond products exactly once', async () => {
    const accountId = randomUUID();
    await seedProduct(documentClient, accountId, product(IDS[0], 'First'));
    await seedProduct(documentClient, accountId, product(IDS[1], 'Second'));

    const repository = new DynamoProductRepository(documentClient, TABLE_NAME);
    const page = await repository.list({ accountId, limit: 25 });

    expect(new Set(page.items.map((item) => item.id))).toEqual(
      new Set([IDS[0], IDS[1]]),
    );
    expect(page.nextCursor).toBeNull();
  });
});
