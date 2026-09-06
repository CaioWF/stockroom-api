import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

import { Product } from '../../domain/product';
import { toProductItem } from './product.mapper';

export interface CatalogSeedEnvironment {
  readonly AWS_REGION?: string;
  readonly DYNAMODB_ENDPOINT?: string;
}

export async function writeCatalogSeedProducts(
  tableName: string,
  accountId: string,
  products: readonly Product[],
  env: CatalogSeedEnvironment,
): Promise<void> {
  const documentClient = DynamoDBDocumentClient.from(buildClient(env));
  for (const product of products) {
    await documentClient.send(
      new PutCommand({
        TableName: tableName,
        Item: toProductItem(accountId, product),
      }),
    );
  }
}

function buildClient(env: CatalogSeedEnvironment): DynamoDBClient {
  return new DynamoDBClient({
    region: env.AWS_REGION ?? 'us-east-1',
    ...(env.DYNAMODB_ENDPOINT ? { endpoint: env.DYNAMODB_ENDPOINT } : {}),
  });
}
