import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { buildTestApp } from '../auth/support/build-test-app';
import { httpServerOf } from '../auth/support/http-test-client';
import { uniqueAddress } from './support/unique-address';

const VALID_PASSWORD = 'correct horse battery';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

describe('credentials route throttling (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await buildTestApp({
      configOverrides: {
        throttleCredentialsLimit: 2,
        throttleCredentialsWindowSeconds: 60,
      },
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the first N requests and refuses request N+1 from one address', async () => {
    const address = uniqueAddress();

    await request(httpServerOf(app))
      .post('/auth/register')
      .set('X-Forwarded-For', address)
      .send({ email: uniqueEmail('limit-first'), password: VALID_PASSWORD })
      .expect(201);
    await request(httpServerOf(app))
      .post('/auth/register')
      .set('X-Forwarded-For', address)
      .send({ email: uniqueEmail('limit-second'), password: VALID_PASSWORD })
      .expect(201);

    await request(httpServerOf(app))
      .post('/auth/register')
      .set('X-Forwarded-For', address)
      .send({ email: uniqueEmail('limit-third'), password: VALID_PASSWORD })
      .expect(429);
  });

  it('does not refuse callers below the configured route limit', async () => {
    const address = uniqueAddress();

    await request(httpServerOf(app))
      .post('/auth/register')
      .set('X-Forwarded-For', address)
      .send({ email: uniqueEmail('under-limit'), password: VALID_PASSWORD })
      .expect(201);
  });
});
