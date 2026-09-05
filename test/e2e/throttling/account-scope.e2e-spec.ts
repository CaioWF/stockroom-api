import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { buildTestApp } from '../auth/support/build-test-app';
import { httpServerOf, TokenPairBody } from '../auth/support/http-test-client';

const VALID_PASSWORD = 'correct horse battery';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

describe('account-scoped throttling (e2e)', () => {
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

  it('limits a protected route by the verified account id', async () => {
    const email = uniqueEmail('account-scope');
    await request(httpServerOf(app))
      .post('/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);
    const login = await request(httpServerOf(app))
      .post('/auth/login')
      .send({ email, password: VALID_PASSWORD })
      .expect(200);
    const tokenPair = login.body as TokenPairBody;

    await request(httpServerOf(app))
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokenPair.accessToken}`)
      .expect(200);
    await request(httpServerOf(app))
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokenPair.accessToken}`)
      .expect(200);
    await request(httpServerOf(app))
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokenPair.accessToken}`)
      .expect(429);
  });
});
