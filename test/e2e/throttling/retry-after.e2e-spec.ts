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

function retryAfterSeconds(response: request.Response): number {
  const value = response.headers['retry-after'];
  if (typeof value !== 'string') {
    throw new Error('Retry-After header missing');
  }
  return Number(value);
}

function wait(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000 + 50));
}

describe('Retry-After throttling contract (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await buildTestApp({
      configOverrides: {
        throttleCredentialsLimit: 1,
        throttleCredentialsWindowSeconds: 1,
        throttleCounterSaturationFactor: 2,
      },
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('admits a retry at Retry-After even after the counter reaches the saturation ceiling', async () => {
    const address = uniqueAddress();
    await request(httpServerOf(app))
      .post('/auth/register')
      .set('X-Forwarded-For', address)
      .send({ email: uniqueEmail('retry-first'), password: VALID_PASSWORD })
      .expect(201);

    const refused = await request(httpServerOf(app))
      .post('/auth/register')
      .set('X-Forwarded-For', address)
      .send({ email: uniqueEmail('retry-refused'), password: VALID_PASSWORD })
      .expect(429);
    await request(httpServerOf(app))
      .post('/auth/register')
      .set('X-Forwarded-For', address)
      .send({ email: uniqueEmail('retry-saturate'), password: VALID_PASSWORD })
      .expect(429);

    await wait(retryAfterSeconds(refused));

    await request(httpServerOf(app))
      .post('/auth/register')
      .set('X-Forwarded-For', address)
      .send({ email: uniqueEmail('retry-after'), password: VALID_PASSWORD })
      .expect(201);
  });
});
