import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

import { CatalogPage } from '../../domain/catalog-page';
import {
  ListProductsInput,
  ProductRepository,
} from '../../domain/ports/product-repository';
import { Product } from '../../domain/product';
import { buildProductKey } from '../../../shared/persistence/table-keys';
import { StructuredLogger } from '../../../shared/observability/structured-logger';
import { readProductItem, readProductSortKey } from './product.mapper';
import { CatalogQueryFailedError } from './catalog-query-failed.error';

export { CatalogQueryFailedError } from './catalog-query-failed.error';

const PRODUCT_PREFIX = 'PRODUCT#';

export class DynamoProductRepository implements ProductRepository {
  constructor(
    private readonly documentClient: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly structuredLogger = new StructuredLogger(),
  ) {}

  async list(input: ListProductsInput): Promise<CatalogPage> {
    const startedAt = Date.now();
    try {
      const result = await this.documentClient.send(this.buildQuery(input));
      return {
        items: this.readItems(result.Items ?? []),
        nextCursor: this.readNextCursor(result.LastEvaluatedKey),
      };
    } catch (error: unknown) {
      this.logFailure(input.accountId, startedAt);
      throw new CatalogQueryFailedError(errorNameOf(error));
    }
  }

  private buildQuery(input: ListProductsInput): QueryCommand {
    return new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': buildProductKey(input.accountId, '').PK,
        ':skPrefix': PRODUCT_PREFIX,
      },
      ConsistentRead: true,
      Limit: input.limit,
      ExclusiveStartKey: this.exclusiveStartKey(input),
    });
  }

  private exclusiveStartKey(
    input: ListProductsInput,
  ): Record<string, string> | undefined {
    if (input.cursor === undefined) {
      return undefined;
    }
    return {
      PK: buildProductKey(input.accountId, '').PK,
      SK: input.cursor.sortKey,
    };
  }

  private readItems(
    items: readonly Record<string, unknown>[],
  ): readonly Product[] {
    return items.map((item) => readProductItem(item));
  }

  private readNextCursor(
    key: Record<string, unknown> | undefined,
  ): CatalogPage['nextCursor'] {
    if (key === undefined) {
      return null;
    }
    const sortKey = readProductSortKey(key);
    const productId = sortKey.slice(PRODUCT_PREFIX.length);
    return { productId, sortKey };
  }

  private logFailure(accountId: string, startedAt: number): void {
    this.structuredLogger.log({
      event: 'catalog_query_failed',
      accountId,
      durationMs: Date.now() - startedAt,
      context: 'catalog',
    });
  }
}

function errorNameOf(error: unknown): string {
  if (error instanceof Error) {
    return error.name === '' ? error.constructor.name : error.name;
  }
  return typeof error;
}
