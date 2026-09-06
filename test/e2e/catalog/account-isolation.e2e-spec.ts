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

describe('GET /products account isolation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('never returns another account products, including under a foreign cursor', async () => {
    const accountA = await authenticateTestAccount(app, 'catalog-account-a');
    const accountB = await authenticateTestAccount(app, 'catalog-account-b');
    await seedCatalogProducts(app, accountA.accountId, [
      catalogProduct(IDS[0], 'a-0'),
      catalogProduct(IDS[1], 'a-1'),
    ]);
    await seedCatalogProducts(app, accountB.accountId, [
      catalogProduct(IDS[1], 'b-1'),
      catalogProduct(IDS[2], 'b-2'),
    ]);
    const accountACursor = await firstCursor(accountA.accessToken);

    const ownPage = await list(accountB.accessToken, null);
    const foreignCursorPage = await list(accountB.accessToken, accountACursor);

    expect(
      ownPage.items.every((item) => item.name.startsWith('Product b')),
    ).toBe(true);
    expect(
      foreignCursorPage.items.every((item) =>
        item.name.startsWith('Product b'),
      ),
    ).toBe(true);
  });

  async function firstCursor(accessToken: string): Promise<string> {
    const response = await request(httpServerOf(app))
      .get('/products')
      .query({ limit: '1' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const page = response.body as CatalogPageBody;
    expect(page.nextCursor).not.toBeNull();
    return page.nextCursor ?? '';
  }

  async function list(
    accessToken: string,
    cursor: string | null,
  ): Promise<CatalogPageBody> {
    const response = await request(httpServerOf(app))
      .get('/products')
      .query(cursor === null ? {} : { cursor })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    return response.body as CatalogPageBody;
  }
});
