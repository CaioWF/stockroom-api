import { Product } from '../../domain/product';
import { Money } from '../../domain/money';
import { buildProductKey } from '../../../shared/persistence/table-keys';
import { MalformedProductItemError } from './malformed-product-item.error';

export interface ProductItem {
  readonly PK: string;
  readonly SK: string;
  readonly name: string;
  readonly sku: string;
  readonly price_amount: number;
  readonly price_currency: string;
  readonly created_at: string;
}

export function toProductItem(product: Product): ProductItem {
  return {
    ...buildProductKey(product.id),
    name: product.name,
    sku: product.sku,
    price_amount: product.price.amount,
    price_currency: product.price.currency,
    created_at: product.createdAt.toISOString(),
  };
}

export function readProductItem(item: Record<string, unknown>): Product {
  return {
    id: readProductId(item.SK),
    name: readString(item.name),
    sku: readString(item.sku),
    price: Money.fromMinorUnits(
      readNumber(item.price_amount),
      readString(item.price_currency),
    ),
    createdAt: new Date(readString(item.created_at)),
  };
}

export function readProductSortKey(item: Record<string, unknown>): string {
  return readString(item.SK);
}

function readProductId(sortKey: unknown): string {
  const value = readString(sortKey);
  return value.startsWith('PRODUCT#') ? value.slice('PRODUCT#'.length) : value;
}

function readString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new MalformedProductItemError();
  }
  return value;
}

function readNumber(value: unknown): number {
  if (typeof value !== 'number') {
    throw new MalformedProductItemError();
  }
  return value;
}
