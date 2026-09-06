import type { INestApplication } from '@nestjs/common';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

import { Product } from '../../../../src/catalog/domain/product';
import { Money } from '../../../../src/catalog/domain/money';
import { toProductItem } from '../../../../src/catalog/infrastructure/dynamo/product.mapper';
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
  accountId: string,
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
        Item: toProductItem(accountId, product),
      }),
    );
  }
}
