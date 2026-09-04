import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { buildTestApp } from './support/build-test-app';
import {
  httpServerOf,
  ProblemBody,
  RegisterBody,
} from './support/http-test-client';

const VALID_PASSWORD = 'correct horse battery';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

describe('POST /auth/register (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 201 with the account id and normalized email, no token or password material (AC-1)', async () => {
    const email = uniqueEmail('register');

    const response = await request(httpServerOf(app))
      .post('/auth/register')
      .send({ email, password: VALID_PASSWORD });

    const body = response.body as RegisterBody;
    expect(response.status).toBe(201);
    expect(typeof body.accountId).toBe('string');
    expect(body.email).toBe(email);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toMatch(/token/i);
    expect(serialized).not.toContain(VALID_PASSWORD);
  });

  it('rejects a duplicate address, case/whitespace variant included, leaving one account (AC-2)', async () => {
    const email = uniqueEmail('duplicate');
    await request(httpServerOf(app))
      .post('/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);

    const duplicate = await request(httpServerOf(app))
      .post('/auth/register')
      .send({
        email: `  ${email.toUpperCase()}  `,
        password: 'a totally different password',
      });
    const duplicateBody = duplicate.body as ProblemBody;

    expect(duplicate.status).toBe(409);
    expect(duplicateBody.status).toBe(409);
    expect(duplicateBody.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('rejects passwords outside the 12-128 length policy with 422 PASSWORD_LENGTH_INVALID (AC-3)', async () => {
    const tooShort = await request(httpServerOf(app))
      .post('/auth/register')
      .send({ email: uniqueEmail('too-short'), password: 'short-pw-11' });
    const tooShortBody = tooShort.body as ProblemBody;
    expect(tooShort.status).toBe(422);
    expect(tooShortBody.code).toBe('PASSWORD_LENGTH_INVALID');

    const tooLong = await request(httpServerOf(app))
      .post('/auth/register')
      .send({ email: uniqueEmail('too-long'), password: 'a'.repeat(129) });
    const tooLongBody = tooLong.body as ProblemBody;
    expect(tooLong.status).toBe(422);
    expect(tooLongBody.code).toBe('PASSWORD_LENGTH_INVALID');
  });

  it('rejects a malformed email with 422 EMAIL_INVALID', async () => {
    const response = await request(httpServerOf(app))
      .post('/auth/register')
      .send({ email: 'not-an-email', password: VALID_PASSWORD });
    const body = response.body as ProblemBody;

    expect(response.status).toBe(422);
    expect(body.status).toBe(422);
    expect(body.code).toBe('EMAIL_INVALID');
  });
});
