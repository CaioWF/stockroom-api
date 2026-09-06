import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { buildTestApp } from '../auth/support/build-test-app';
import { httpServerOf } from '../auth/support/http-test-client';
import { authenticateTestAccount } from './support/authenticate-test-account';

describe('GET /products throttling (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await buildTestApp({
      configOverrides: {
        throttleAuthenticatedLimit: 2,
        throttleAuthenticatedWindowSeconds: 60,
        throttleCredentialsLimit: 50,
      },
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('uses the existing authenticated account quota', async () => {
    const tokenPair = await authenticateTestAccount(app, 'catalog-throttled');

    await request(httpServerOf(app))
      .get('/products')
      .set('Authorization', `Bearer ${tokenPair.accessToken}`)
      .expect(200);
    await request(httpServerOf(app))
      .get('/products')
      .set('Authorization', `Bearer ${tokenPair.accessToken}`)
      .expect(200);
    await request(httpServerOf(app))
      .get('/products')
      .set('Authorization', `Bearer ${tokenPair.accessToken}`)
      .expect(429)
      .expect('Retry-After', /[0-9]+/);
  });
});
