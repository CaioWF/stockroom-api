import { readFileSync } from 'node:fs';

import {
  buildCatalogSeedProducts,
  createSeedIdGenerator,
  SeedCatalogInputError,
} from '../../../scripts/seed-catalog';

describe('seed-catalog script helpers', () => {
  it('builds deterministic seed products with caller-supplied ids', () => {
    const ids = ['018f2f3c-0000-7000-8000-000000000001'];
    const products = buildCatalogSeedProducts(1, { newId: () => ids[0] });

    expect(products).toHaveLength(1);
    expect(products[0]?.id).toBe(ids[0]);
    expect(products[0]?.price.toJSON()).toEqual({
      amount: 1000,
      currency: 'USD',
    });
  });

  it('uses a script-local UUIDv7 generator instead of auth infrastructure', () => {
    const id = createSeedIdGenerator().newId();
    const source = readFileSync('scripts/seed-catalog.ts', 'utf8');

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(source).not.toContain(
      'auth/infrastructure/crypto/uuid-v7-generator',
    );
  });

  it('rejects a non-positive seed count', () => {
    expect(() =>
      buildCatalogSeedProducts(0, {
        newId: () => '018f2f3c-0000-7000-8000-000000000001',
      }),
    ).toThrow(SeedCatalogInputError);
  });
});
