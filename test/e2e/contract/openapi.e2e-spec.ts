/**
 * `GET /openapi.json` (FR26, AC-26): fetched without a credential, the
 * document must describe every route this feature exposes and publish the
 * exception filter's closed error-code set as an enum — see
 * src/auth/presentation/openapi/openapi-document.ts's module doc for how
 * the document is built and which schemas it is generated from.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PROBLEM_CODES } from '../../../src/auth/presentation/problem-details.filter';
import { buildTestApp } from '../auth/support/build-test-app';
import { httpServerOf } from '../auth/support/http-test-client';

interface OpenApiDocumentBody {
  readonly paths: Record<string, Record<string, unknown> | undefined>;
  readonly components?: {
    readonly schemas?: {
      readonly ProblemDetails?: {
        readonly properties?: {
          readonly code?: {
            readonly enum?: readonly string[];
          };
        };
      };
    };
  };
}

const EXPECTED_ROUTES: ReadonlyArray<{
  readonly path: string;
  readonly method: string;
}> = [
  { path: '/auth/register', method: 'post' },
  { path: '/auth/login', method: 'post' },
  { path: '/auth/refresh', method: 'post' },
  { path: '/auth/me', method: 'get' },
  { path: '/health', method: 'get' },
  { path: '/.well-known/jwks.json', method: 'get' },
];

describe('GET /openapi.json (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the document without a credential (AC-26)', async () => {
    const response = await request(httpServerOf(app)).get('/openapi.json');

    expect(response.status).toBe(200);
  });

  it('describes every route in the spec (AC-26)', async () => {
    const response = await request(httpServerOf(app)).get('/openapi.json');
    const document = response.body as OpenApiDocumentBody;

    for (const { path, method } of EXPECTED_ROUTES) {
      expect(document.paths[path]?.[method]).toBeDefined();
    }
  });

  it('enumerates the error codes as the exact closed set (AC-26)', async () => {
    const response = await request(httpServerOf(app)).get('/openapi.json');
    const document = response.body as OpenApiDocumentBody;
    const codeEnum =
      document.components?.schemas?.ProblemDetails?.properties?.code?.enum ??
      [];

    expect([...codeEnum].sort()).toEqual([...PROBLEM_CODES].sort());
  });
});
