import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { buildTestApp } from '../auth/support/build-test-app';
import { httpServerOf, TokenPairBody } from '../auth/support/http-test-client';
import { uniqueAddress } from './support/unique-address';

const VALID_PASSWORD = 'correct horse battery';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

describe('public throttle route groups (e2e)', () => {
  let app: INestApplication;
  let tokenPair: TokenPairBody;

  beforeAll(async () => {
    ({ app } = await buildTestApp({
      configOverrides: {
        throttleCredentialsLimit: 1,
        throttleCredentialsWindowSeconds: 60,
        throttleRefreshLimit: 5,
        throttleRefreshWindowSeconds: 60,
      },
    }));
    const email = uniqueEmail('route-groups-setup');
    await request(httpServerOf(app))
      .post('/auth/register')
      .set('X-Forwarded-For', '198.51.100.250')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);
    const login = await request(httpServerOf(app))
      .post('/auth/login')
      .set('X-Forwarded-For', '198.51.100.251')
      .send({ email, password: VALID_PASSWORD })
      .expect(200);
    tokenPair = login.body as TokenPairBody;
  });

  afterAll(async () => {
    await app.close();
  });

  it('limits credentials separately from refresh for the same address', async () => {
    const address = uniqueAddress();
    await request(httpServerOf(app))
      .post('/auth/login')
      .set('X-Forwarded-For', address)
      .send({ email: uniqueEmail('unknown'), password: VALID_PASSWORD })
      .expect(401);
    await request(httpServerOf(app))
      .post('/auth/login')
      .set('X-Forwarded-For', address)
      .send({ email: uniqueEmail('unknown'), password: VALID_PASSWORD })
      .expect(429);

    await request(httpServerOf(app))
      .post('/auth/refresh')
      .set('X-Forwarded-For', address)
      .send({ refreshToken: tokenPair.refreshToken })
      .expect(200);
  });
});
