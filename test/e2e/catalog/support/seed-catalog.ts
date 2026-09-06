import type { INestApplication } from '@nestjs/common';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

import { Product } from '../../../../src/catalog/domain/product';
import { Money } from '../../../../src/catalog/domain/money';
import { toProductItem } from '../../../../src/catalog/infrastructure/dynamo/product.mapper';
import { buildProductKey } from '../../../../src/shared/persistence/table-keys';
import { APP_CONFIG } from '../../../../src/shared/config/configuration.module';
import type { AppConfig } from '../../../../src/shared/config/environment.schema';
import { DYNAMO_DOCUMENT_CLIENT } from '../../../../src/shared/persistence/dynamo-client.provider';

export interface CatalogPageBody {
  readonly items: readonly ProductBody[];
  readonly nextCursor: string | null;
}

export interface ProductBody {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly price: {
    readonly amount: number;
    readonly currency: string;
  };
  readonly createdAt: string;
}

export function catalogProduct(id: string, label: string): Product {
  return {
    id,
    name: `Product ${label}`,
    sku: `SKU-${label}`,
    price: Money.fromMinorUnits(1000, 'USD'),
    createdAt: new Date('2026-09-05T12:00:00.000Z'),
  };
}

export async function seedCatalogProducts(
  app: INestApplication,
  products: readonly Product[],
): Promise<void> {
  const config = app.get<AppConfig>(APP_CONFIG);
  const documentClient = app.get<DynamoDBDocumentClient>(
    DYNAMO_DOCUMENT_CLIENT,
  );
  for (const product of products) {
    await documentClient.send(
      new PutCommand({
        TableName: config.tableName,
        Item: toProductItem(product),
      }),
    );
  }
}

/**
 * Empties the shared catalog partition. One catalog (ADR-0007) means tests in
 * one file write to the same place; a per-test account id used to keep them
 * apart, and this replaces it.
 */
export async function emptyCatalog(app: INestApplication): Promise<void> {
  const config = app.get<AppConfig>(APP_CONFIG);
  const documentClient = app.get<DynamoDBDocumentClient>(
    DYNAMO_DOCUMENT_CLIENT,
  );
  const existing = await documentClient.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': buildProductKey('').PK,
        ':skPrefix': 'PRODUCT#',
      },
    }),
  );
  const items: Record<string, unknown>[] = existing.Items ?? [];
  for (const item of items) {
    await documentClient.send(
      new DeleteCommand({
        TableName: config.tableName,
        Key: catalogItemKey(item),
      }),
    );
  }
}

// The document client types item fields as `any`; narrow at the boundary
// rather than letting an unchecked value into the delete request.
function catalogItemKey(item: Record<string, unknown>): {
  PK: string;
  SK: string;
} {
  const { PK, SK } = item;
  if (typeof PK !== 'string' || typeof SK !== 'string') {
    throw new Error('catalog item is missing its key');
  }
  return { PK, SK };
}
