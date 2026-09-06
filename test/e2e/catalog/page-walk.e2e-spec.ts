import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { buildTestApp } from '../auth/support/build-test-app';
import { httpServerOf } from '../auth/support/http-test-client';
import { authenticateTestAccount } from './support/authenticate-test-account';
import {
  catalogProduct,
  CatalogPageBody,
  seedCatalogProducts,
} from './support/seed-catalog';

const IDS = [
  '018f2f3c-0000-7000-8000-000000000001',
  '018f2f3c-0001-7000-8000-000000000002',
  '018f2f3c-0002-7000-8000-000000000003',
] as const;

describe('GET /products page walk (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('walks a multi-page catalog to termination without duplicates', async () => {
    const account = await authenticateTestAccount(app, 'catalog-walk');
    await seedCatalogProducts(
      app,
      account.accountId,
      IDS.map((id, index) => catalogProduct(id, String(index))),
    );

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const response = await request(httpServerOf(app))
        .get('/products')
        .query({ limit: '2', ...(cursor === null ? {} : { cursor }) })
        .set('Authorization', `Bearer ${account.accessToken}`)
        .expect(200);
      const page = response.body as CatalogPageBody;
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor !== null);

    expect(seen).toHaveLength(IDS.length);
    expect(new Set(seen)).toEqual(new Set(IDS));
  });

  it('returns a single terminal page for a small catalog', async () => {
    const account = await authenticateTestAccount(app, 'catalog-small');
    await seedCatalogProducts(app, account.accountId, [
      catalogProduct(IDS[0], 'small-a'),
      catalogProduct(IDS[1], 'small-b'),
    ]);

    const response = await request(httpServerOf(app))
      .get('/products')
      .query({ limit: '5' })
      .set('Authorization', `Bearer ${account.accessToken}`)
      .expect(200);
    const page = response.body as CatalogPageBody;

    expect(page.items.map((item) => item.id)).toEqual([IDS[0], IDS[1]]);
    expect(page.nextCursor).toBeNull();
  });

  it('returns an exact page and product response shape', async () => {
    const account = await authenticateTestAccount(app, 'catalog-shape');
    await seedCatalogProducts(app, account.accountId, [
      catalogProduct(IDS[0], 'shape'),
    ]);

    const response = await request(httpServerOf(app))
      .get('/products')
      .set('Authorization', `Bearer ${account.accessToken}`)
      .expect(200);
    const page = response.body as CatalogPageBody;
    const item = page.items[0];

    expect(Object.keys(page).sort()).toEqual(['items', 'nextCursor']);
    expect(Object.keys(item).sort()).toEqual([
      'createdAt',
      'id',
      'name',
      'price',
      'sku',
    ]);
    expect(item.price).toEqual({ amount: 1000, currency: 'USD' });
    expect(new Date(item.createdAt).toISOString()).toBe(item.createdAt);
  });
});
