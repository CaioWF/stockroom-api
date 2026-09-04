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

async function loginNewAccount(
  app: INestApplication,
  prefix: string,
): Promise<{ refreshToken: string }> {
  const email = uniqueEmail(prefix);
  await request(httpServerOf(app))
    .post('/auth/register')
    .send({ email, password: VALID_PASSWORD })
    .expect(201);
  const login = await request(httpServerOf(app))
    .post('/auth/login')
    .send({ email, password: VALID_PASSWORD })
    .expect(200);
  const body = login.body as TokenPairBody;
  return { refreshToken: body.refreshToken };
}

describe('POST /auth/refresh (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('rotates a valid refresh token once; presenting the original again is refused (AC-14)', async () => {
    const { refreshToken: originalRefreshToken } = await loginNewAccount(
      app,
      'rotate',
    );

    const rotated = await request(httpServerOf(app))
      .post('/auth/refresh')
      .send({ refreshToken: originalRefreshToken });
    const rotatedBody = rotated.body as TokenPairBody;

    expect(rotated.status).toBe(200);
    expect(typeof rotatedBody.accessToken).toBe('string');
    expect(rotatedBody.refreshToken).not.toBe(originalRefreshToken);

    const replay = await request(httpServerOf(app))
      .post('/auth/refresh')
      .send({ refreshToken: originalRefreshToken });
    const replayBody = replay.body as ProblemBody;

    expect(replay.status).toBe(401);
    expect(replayBody.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects a malformed refresh credential with 401 INVALID_REFRESH_TOKEN, no storage-engine text leaking (AC-20)', async () => {
    const malformedCases = [
      'not-a-real-token',
      `${randomUUID()}.not-a-uuid.${'a'.repeat(43)}`,
      `${randomUUID()}.${randomUUID()}.too-short-secret`,
    ];

    for (const refreshToken of malformedCases) {
      const response = await request(httpServerOf(app))
        .post('/auth/refresh')
        .send({ refreshToken });
      const body = response.body as ProblemBody;

      expect(response.status).toBe(401);
      expect(body.code).toBe('INVALID_REFRESH_TOKEN');
      expect(JSON.stringify(response.body)).not.toMatch(/dynamo/i);
    }
  });
});
