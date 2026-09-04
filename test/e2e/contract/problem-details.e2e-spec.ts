/**
 * AC-27 (FR24): every rejection is a full RFC 9457 problem document, not
 * just a status/code pair. Every other spec in this suite already asserts
 * `response.status` and `response.body.code` for its own route; this file
 * is the one place that asserts every field of `ProblemBody` — `type`,
 * `title`, `status`, `detail`, `instance` — for at least one real rejection
 * per member of the closed `PROBLEM_CODES` set (problem-details.filter.ts).
 *
 * `SERVICE_UNAVAILABLE` is `DEFAULT_MAPPING`, the catch-all row of the
 * filter's closed `instanceof` table. A route the router never matched is
 * NOT this row's way in (Finding 1, error-taxonomy fix): Nest's own
 * `NotFoundException` for an unmatched route is excluded from the filter's
 * business-error mapping entirely and answers a genuine, un-decorated 404
 * (`answers a genuine 404...` below). `DEFAULT_MAPPING` is reached instead
 * by a real untyped exception during a real request — the second `describe`
 * block below overrides `SIGNING_KEY_PROVIDER` with a throwing double in a
 * dedicated `TestingModule` (not the shared `buildTestApp()` every other
 * spec relies on) to trigger one, and asserts `detail` never leaks the raw
 * exception message (Finding 2).
 */
import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  PROBLEM_CODES,
  ProblemCode,
} from '../../../src/auth/presentation/problem-details.filter';
import { buildTestApp } from '../auth/support/build-test-app';
import { httpServerOf, ProblemBody } from '../auth/support/http-test-client';

// The following imports MUST come after the `buildTestApp` import above:
// buildTestApp's own module transitively imports `./set-test-environment`
// before it imports `../../../../src/app.module`, so by the time THIS
// file's own import of `AppModule` below runs, `process.env` is already
// populated — see build-test-app.ts's own comment for why the ordering is
// load-bearing.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Test } from '@nestjs/testing';

import { ensureTableExists } from '../../../scripts/create-table';
import { AppModule } from '../../../src/app.module';
import { SIGNING_KEY_PROVIDER } from '../../../src/auth/auth.module';

const VALID_PASSWORD = 'correct horse battery';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

function assertProblemDetails(
  response: request.Response,
  expectedStatus: number,
  expectedCode: ProblemCode,
  expectedInstance: string,
): void {
  const body = response.body as ProblemBody;
  expect(response.type).toBe('application/problem+json');
  expect(body.type).toBe('about:blank');
  expect(typeof body.title).toBe('string');
  expect(body.title.length).toBeGreaterThan(0);
  expect(body.status).toBe(expectedStatus);
  expect(typeof body.detail).toBe('string');
  expect(body.detail.length).toBeGreaterThan(0);
  expect(body.instance).toBe(expectedInstance);
  expect(body.code).toBe(expectedCode);
  expect(PROBLEM_CODES).toContain(body.code);
}

describe('Problem details shape (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers EMAIL_ALREADY_REGISTERED as a full problem document (AC-27)', async () => {
    const email = uniqueEmail('problem-duplicate');
    await request(httpServerOf(app))
      .post('/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);

    const response = await request(httpServerOf(app))
      .post('/auth/register')
      .send({ email, password: VALID_PASSWORD });

    expect(response.status).toBe(409);
    assertProblemDetails(
      response,
      409,
      'EMAIL_ALREADY_REGISTERED',
      '/auth/register',
    );
  });

  it('answers PASSWORD_LENGTH_INVALID as a full problem document (AC-27)', async () => {
    const response = await request(httpServerOf(app))
      .post('/auth/register')
      .send({ email: uniqueEmail('problem-short'), password: 'too-short-1' });

    expect(response.status).toBe(422);
    assertProblemDetails(
      response,
      422,
      'PASSWORD_LENGTH_INVALID',
      '/auth/register',
    );
  });

  it('answers EMAIL_INVALID as a full problem document (AC-27)', async () => {
    const response = await request(httpServerOf(app))
      .post('/auth/register')
      .send({ email: 'not-an-email', password: VALID_PASSWORD });

    expect(response.status).toBe(422);
    assertProblemDetails(response, 422, 'EMAIL_INVALID', '/auth/register');
  });

  it('answers INVALID_CREDENTIALS as a full problem document (AC-27)', async () => {
    const email = uniqueEmail('problem-wrong-password');
    await request(httpServerOf(app))
      .post('/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);

    const response = await request(httpServerOf(app))
      .post('/auth/login')
      .send({ email, password: 'a totally wrong password' });

    expect(response.status).toBe(401);
    assertProblemDetails(response, 401, 'INVALID_CREDENTIALS', '/auth/login');
  });

  it('answers INVALID_REFRESH_TOKEN as a full problem document (AC-27)', async () => {
    const response = await request(httpServerOf(app))
      .post('/auth/refresh')
      .send({ refreshToken: 'not-a-real-token' });

    expect(response.status).toBe(401);
    assertProblemDetails(
      response,
      401,
      'INVALID_REFRESH_TOKEN',
      '/auth/refresh',
    );
  });

  it('answers INVALID_ACCESS_TOKEN as a full problem document for a guarded route with no credential (AC-27, Finding 3)', async () => {
    const response = await request(httpServerOf(app)).get('/auth/me');

    expect(response.status).toBe(401);
    assertProblemDetails(response, 401, 'INVALID_ACCESS_TOKEN', '/auth/me');
  });

  it('answers a genuine 404, not SERVICE_UNAVAILABLE, for a route this API never declared (Finding 1)', async () => {
    const response = await request(httpServerOf(app)).get(
      '/this-route-does-not-exist',
    );

    expect(response.status).toBe(404);
    const body = response.body as { code?: unknown };
    expect(PROBLEM_CODES).not.toContain(body.code);
  });
});

// Finding 2's leak fix must hold for ANY untyped exception reaching the
// filter, not just the specific SSM-parameter-store cases Finding 4 now
// types — a plain, unrecognized `Error` is the durable proof. A dedicated
// `TestingModule` (not the shared buildTestApp() every other spec relies
// on) overrides SIGNING_KEY_PROVIDER with a double that always rejects, so
// a real POST /auth/login triggers a genuine untyped failure mid-request
// (AuthenticateAccount signs an access token only after credentials check
// out) rather than abusing routing the way the old SERVICE_UNAVAILABLE test
// above used to.
function requireTestEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(
      `${name} is not set — this file's own buildTestApp() import must run first`,
    );
  }
  return value;
}

async function ensureLocalTable(): Promise<void> {
  const client = new DynamoDBClient({
    region: requireTestEnv('AWS_REGION'),
    endpoint: requireTestEnv('DYNAMODB_ENDPOINT'),
  });
  await ensureTableExists(client, requireTestEnv('TABLE_NAME'));
}

async function buildUntypedFailureApp(): Promise<INestApplication> {
  await ensureLocalTable();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(SIGNING_KEY_PROVIDER)
    .useValue({
      getSigningKey: (): Promise<never> =>
        Promise.reject(
          new Error('SSM parameter /stockroom/e2e/signing-key has no value'),
        ),
    })
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('Problem details shape — unrecognized exception (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildUntypedFailureApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers SERVICE_UNAVAILABLE without leaking the untyped exception message (AC-27, Finding 2)', async () => {
    const email = uniqueEmail('problem-untyped-failure');
    await request(httpServerOf(app))
      .post('/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);

    const response = await request(httpServerOf(app))
      .post('/auth/login')
      .send({ email, password: VALID_PASSWORD });

    expect(response.status).toBe(503);
    assertProblemDetails(response, 503, 'SERVICE_UNAVAILABLE', '/auth/login');
    const body = response.body as ProblemBody;
    expect(body.detail).not.toContain('SSM parameter');
    expect(body.detail).not.toContain('signing-key');
  });
});
