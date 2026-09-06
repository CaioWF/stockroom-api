import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { buildTestApp } from '../auth/support/build-test-app';
import {
  httpServerOf,
  ProblemBody,
  TokenPairBody,
} from '../auth/support/http-test-client';
import { authenticateTestAccount } from './support/authenticate-test-account';

describe('GET /products input handling (e2e)', () => {
  let app: INestApplication;
  let tokenPair: TokenPairBody;

  beforeAll(async () => {
    ({ app } = await buildTestApp());
    tokenPair = await authenticateTestAccount(app, 'catalog-invalid');
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires a valid access token', async () => {
    await request(httpServerOf(app)).get('/products').expect(401);
  });

  it('returns an empty catalog as a 200 page', async () => {
    const response = await request(httpServerOf(app))
      .get('/products')
      .set('Authorization', `Bearer ${tokenPair.accessToken}`)
      .expect(200);

    expect(response.body).toEqual({ items: [], nextCursor: null });
  });

  it.each(['abc', '', '0', '-1', '1.5', '101'])(
    'rejects malformed limit %p as 422',
    async (limit) => {
      const response = await request(httpServerOf(app))
        .get('/products')
        .query({ limit })
        .set('Authorization', `Bearer ${tokenPair.accessToken}`)
        .expect(422);
      const body = response.body as ProblemBody;

      expect(body.code).toBe('INVALID_PAGE_LIMIT');
      expect(body.status).toBe(422);
    },
  );

  it('rejects a repeated limit parameter', async () => {
    const response = await request(httpServerOf(app))
      .get('/products?limit=5&limit=9')
      .set('Authorization', `Bearer ${tokenPair.accessToken}`)
      .expect(422);
    const body = response.body as ProblemBody;

    expect(body.code).toBe('INVALID_PAGE_LIMIT');
  });

  it('rejects a malformed cursor as 422, not 503', async () => {
    const response = await request(httpServerOf(app))
      .get('/products')
      .query({ cursor: 'not-a-cursor' })
      .set('Authorization', `Bearer ${tokenPair.accessToken}`)
      .expect(422);
    const body = response.body as ProblemBody;

    expect(body.code).toBe('INVALID_CURSOR');
    expect(body.status).not.toBe(503);
  });
});
