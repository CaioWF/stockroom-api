import {
  decodeCatalogCursor,
  encodeCatalogCursor,
} from '../../../../src/catalog/domain/catalog-cursor';
import { InvalidCursorError } from '../../../../src/catalog/domain/errors';

const PRODUCT_ID = '018f2f3c-1111-7000-8000-000000000123';

function encodeRawCursor(raw: string): string {
  return Buffer.from(raw, 'utf8').toString('base64url');
}

describe('catalog cursor', () => {
  it('roundtrips a product position as an opaque cursor', () => {
    const encoded = encodeCatalogCursor({ productId: PRODUCT_ID });

    expect(decodeCatalogCursor(encoded)).toEqual({
      productId: PRODUCT_ID,
      sortKey: `PRODUCT#${PRODUCT_ID}`,
    });
  });

  it.each([
    ['forged characters', '%%%'],
    ['truncated product id', encodeRawCursor('PRODUCT#018f2f3c')],
    ['non-product position', encodeRawCursor(`USER#${PRODUCT_ID}`)],
  ])('rejects a %s cursor', (_name, encoded) => {
    expect(() => decodeCatalogCursor(encoded)).toThrow(InvalidCursorError);
  });
});
