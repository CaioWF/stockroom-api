import '../../../shared/presentation/openapi/extend-zod';

import { z } from 'zod';

import { ListCatalogResult } from '../../application/list-catalog.usecase';

export interface ProductResponseBody {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly price: {
    readonly amount: number;
    readonly currency: string;
  };
  readonly createdAt: string;
}

export interface CatalogPageResponseBody {
  readonly items: readonly ProductResponseBody[];
  readonly nextCursor: string | null;
}

export const CatalogPageResponseSchema = z
  .object({
    items: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        sku: z.string(),
        price: z.object({
          amount: z.number().int().nonnegative(),
          currency: z.string().regex(/^[A-Z]{3}$/),
        }),
        createdAt: z.string().datetime(),
      }),
    ),
    nextCursor: z.string().nullable(),
  })
  .openapi('CatalogPageResponse');

export function toCatalogPageResponse(
  result: ListCatalogResult,
): CatalogPageResponseBody {
  return {
    items: result.items.map((item) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      price: item.price.toJSON(),
      createdAt: item.createdAt.toISOString(),
    })),
    nextCursor: result.nextCursor,
  };
}
