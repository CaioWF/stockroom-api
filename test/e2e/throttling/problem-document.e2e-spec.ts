import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { buildTestApp } from '../auth/support/build-test-app';
import { httpServerOf, ProblemBody } from '../auth/support/http-test-client';
import { uniqueAddress } from './support/unique-address';

const VALID_PASSWORD = 'correct horse battery';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

describe('throttling problem document (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await buildTestApp({
      configOverrides: {
        throttleCredentialsLimit: 1,
        throttleCredentialsWindowSeconds: 60,
      },
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a 429 problem document with Retry-After on refusal', async () => {
    const address = uniqueAddress();
    await request(httpServerOf(app))
      .post('/auth/register')
      .set('X-Forwarded-For', address)
      .send({ email: uniqueEmail('problem-first'), password: VALID_PASSWORD })
      .expect(201);

    const response = await request(httpServerOf(app))
      .post('/auth/register')
      .set('X-Forwarded-For', address)
      .send({ email: uniqueEmail('problem-second'), password: VALID_PASSWORD });
    const body = response.body as ProblemBody;

    expect(response.status).toBe(429);
    expect(response.type).toBe('application/problem+json');
    expect(response.headers['retry-after']).toBeDefined();
    expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(body.status).toBe(429);
  });

  it('does not emit rate-limit headers on a successful response', async () => {
    const response = await request(httpServerOf(app))
      .post('/auth/register')
      .set('X-Forwarded-For', uniqueAddress())
      .send({
        email: uniqueEmail('problem-success'),
        password: VALID_PASSWORD,
      });

    expect(response.status).toBe(201);
    expect(response.headers['retry-after']).toBeUndefined();
    expect(response.headers['ratelimit-limit']).toBeUndefined();
  });
});
