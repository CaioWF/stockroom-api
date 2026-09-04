import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { buildTestApp } from './support/build-test-app';
import {
  httpServerOf,
  ProblemBody,
  TokenPairBody,
} from './support/http-test-client';

const VALID_PASSWORD = 'correct horse battery';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

describe('POST /auth/login (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers then signs in, returning both tokens and both lifetimes as integer seconds (AC-5)', async () => {
    const email = uniqueEmail('login');
    await request(httpServerOf(app))
      .post('/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);

    const response = await request(httpServerOf(app))
      .post('/auth/login')
      .send({ email, password: VALID_PASSWORD });
    const body = response.body as TokenPairBody;

    expect(response.status).toBe(200);
    expect(typeof body.accessToken).toBe('string');
    expect(typeof body.refreshToken).toBe('string');
    expect(Number.isInteger(body.expiresIn)).toBe(true);
    expect(Number.isInteger(body.refreshExpiresIn)).toBe(true);
  });

  it('produces byte-identical 401 INVALID_CREDENTIALS bodies for a wrong password and an unknown address (AC-6)', async () => {
    const email = uniqueEmail('wrong-password');
    await request(httpServerOf(app))
      .post('/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);

    const wrongPassword = await request(httpServerOf(app))
      .post('/auth/login')
      .send({ email, password: 'a totally wrong password' });
    const unknownAddress = await request(httpServerOf(app))
      .post('/auth/login')
      .send({ email: uniqueEmail('unknown'), password: VALID_PASSWORD });
    const wrongPasswordBody = wrongPassword.body as ProblemBody;

    expect(wrongPassword.status).toBe(401);
    expect(unknownAddress.status).toBe(401);
    expect(wrongPasswordBody.code).toBe('INVALID_CREDENTIALS');
    expect(wrongPassword.body).toEqual(unknownAddress.body);
  });
});
