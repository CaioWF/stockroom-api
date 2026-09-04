// `buildTestApp` (via its own first import, set-test-environment) MUST be
// imported before `DYNAMO_DOCUMENT_CLIENT` below — the latter transitively
// reaches `ConfigurationModule`, which parses `process.env` the moment its
// module is first evaluated, before the environment would otherwise be set.
import { buildTestApp } from './support/build-test-app';

import { randomUUID } from 'node:crypto';

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { DYNAMO_DOCUMENT_CLIENT } from '../../../src/shared/persistence/dynamo-client.provider';
import {
  httpServerOf,
  MeBody,
  ProblemBody,
  TokenPairBody,
} from './support/http-test-client';

const VALID_PASSWORD = 'correct horse battery';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

describe('GET /auth/me (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the caller identity from the token alone, with zero storage reads (AC-8)', async () => {
    const email = uniqueEmail('me');
    await request(httpServerOf(app))
      .post('/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);
    const login = await request(httpServerOf(app))
      .post('/auth/login')
      .send({ email, password: VALID_PASSWORD })
      .expect(200);
    const loginBody = login.body as TokenPairBody;

    const documentClient = app.get<DynamoDBDocumentClient>(
      DYNAMO_DOCUMENT_CLIENT,
    );
    const sendSpy = jest.spyOn(documentClient, 'send');
    sendSpy.mockClear();

    const response = await request(httpServerOf(app))
      .get('/auth/me')
      .set('Authorization', `Bearer ${loginBody.accessToken}`);

    const body = response.body as MeBody;
    expect(response.status).toBe(200);
    expect(typeof body.accountId).toBe('string');
    expect(body.email).toBe(email);
    expect(sendSpy).not.toHaveBeenCalled();

    sendSpy.mockRestore();
  });

  it('refuses a request with no credential at all (AC-9, Finding 3)', async () => {
    const response = await request(httpServerOf(app)).get('/auth/me');
    const body = response.body as ProblemBody;

    expect(response.status).toBe(401);
    expect(body.code).toBe('INVALID_ACCESS_TOKEN');
  });
});
