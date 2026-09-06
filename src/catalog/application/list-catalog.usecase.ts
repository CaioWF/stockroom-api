import {
  decodeCatalogCursor,
  encodeCatalogCursor,
} from '../domain/catalog-cursor';
import { InvalidCursorError, InvalidPageLimitError } from '../domain/errors';
import { Product } from '../domain/product';
import { ProductRepository } from '../domain/ports/product-repository';

export interface ListCatalogInput {
  readonly accountId: string;
  readonly limit?: unknown;
  readonly cursor?: unknown;
}

export interface ListCatalogResult {
  readonly items: readonly Product[];
  readonly nextCursor: string | null;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const LIMIT_PATTERN = /^[0-9]+$/;

export class ListCatalog {
  constructor(private readonly productRepository: ProductRepository) {}

  async execute(input: ListCatalogInput): Promise<ListCatalogResult> {
    const page = await this.productRepository.list({
      accountId: input.accountId,
      limit: parseLimit(input.limit),
      cursor: parseCursor(input.cursor),
    });
    return {
      items: page.items,
      nextCursor:
        page.nextCursor === null ? null : encodeCatalogCursor(page.nextCursor),
    };
  }
}

function parseLimit(limit: unknown): number {
  if (limit === undefined) {
    return DEFAULT_LIMIT;
  }
  if (typeof limit !== 'string' || !LIMIT_PATTERN.test(limit)) {
    throw new InvalidPageLimitError();
  }
  return parseLimitNumber(limit);
}

function parseLimitNumber(limit: string): number {
  const parsed = Number(limit);
  if (parsed < 1 || parsed > MAX_LIMIT) {
    throw new InvalidPageLimitError();
  }
  return parsed;
}

function parseCursor(
  cursor: unknown,
): ReturnType<typeof decodeCatalogCursor> | undefined {
  if (cursor === undefined) {
    return undefined;
  }
  if (typeof cursor !== 'string') {
    throw new InvalidCursorError();
  }
  return decodeCatalogCursor(cursor);
}
