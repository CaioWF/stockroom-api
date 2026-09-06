import { InvalidCursorError } from './errors';

export interface CatalogCursor {
  readonly productId: string;
  readonly sortKey: string;
}

export interface CatalogCursorInput {
  readonly productId: string;
}

const UUID_V7 =
  '[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const PRODUCT_SORT_KEY = new RegExp(`^PRODUCT#(${UUID_V7})$`);
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export function encodeCatalogCursor(input: CatalogCursorInput): string {
  return Buffer.from(`PRODUCT#${input.productId}`, 'utf8').toString(
    'base64url',
  );
}

export function decodeCatalogCursor(encoded: string): CatalogCursor {
  if (!BASE64URL.test(encoded)) {
    throw new InvalidCursorError();
  }
  const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
  const match = PRODUCT_SORT_KEY.exec(decoded);
  const productId = match?.[1];
  if (productId === undefined) {
    throw new InvalidCursorError();
  }
  return { productId, sortKey: decoded };
}
