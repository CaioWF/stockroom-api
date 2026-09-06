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
  '018f2f3c-0003-7000-8000-000000000004',
] as const;

describe('GET /products cursor resume (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('resumes after a stored cursor and sees later products after it', async () => {
    const account = await authenticateTestAccount(app, 'catalog-resume');
    await seedCatalogProducts(
      app,
      account.accountId,
      IDS.slice(0, 3).map((id, index) => catalogProduct(id, String(index))),
    );
    const first = await request(httpServerOf(app))
      .get('/products')
      .query({ limit: '2' })
      .set('Authorization', `Bearer ${account.accessToken}`)
      .expect(200);
    const firstPage = first.body as CatalogPageBody;
    await seedCatalogProducts(app, account.accountId, [
      catalogProduct(IDS[3], 'later'),
    ]);

    const resumed = await request(httpServerOf(app))
      .get('/products')
      .query({ limit: '10', cursor: firstPage.nextCursor })
      .set('Authorization', `Bearer ${account.accessToken}`)
      .expect(200);
    const resumedPage = resumed.body as CatalogPageBody;

    expect(firstPage.items.map((item) => item.id)).toEqual([IDS[0], IDS[1]]);
    expect(resumedPage.items.map((item) => item.id)).toEqual([IDS[2], IDS[3]]);
  });
});
