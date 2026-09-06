import '../auth/support/set-test-environment';

import { randomUUID } from 'node:crypto';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { ALBEvent, ALBResult, Context } from 'aws-lambda';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ensureTableExists } from '../../../scripts/create-table';
import { httpServerOf, ProblemBody } from '../auth/support/http-test-client';
import { buildTestKeyMaterial } from '../auth/support/test-key-providers';
import { uniqueAddress } from './support/unique-address';

const VALID_PASSWORD = 'correct horse battery';
const fakeContext = {} as Context;

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

function setThrottleEnv(): void {
  process.env.THROTTLE_CREDENTIALS_LIMIT = '1';
  process.env.THROTTLE_CREDENTIALS_WINDOW_SECONDS = '60';
  process.env.THROTTLE_COUNTER_SATURATION_FACTOR = '2';
}

function requireAppModule(): typeof import('../../../src/app.module') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../../src/app.module') as typeof import('../../../src/app.module');
}

function requireAuthModule(): typeof import('../../../src/auth/auth.module') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../../src/auth/auth.module') as typeof import('../../../src/auth/auth.module');
}

function requireLambdaModule(): typeof import('../../../src/lambda') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../../src/lambda') as typeof import('../../../src/lambda');
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

async function buildIsolatedHttpApp(): Promise<INestApplication> {
  const { AppModule } = requireAppModule();
  const { SIGNING_KEY_PROVIDER, VERIFICATION_KEY_SET_PROVIDER } =
    requireAuthModule();
  const keyMaterial = await buildTestKeyMaterial();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SIGNING_KEY_PROVIDER)
    .useValue(keyMaterial.signingKeyProvider)
    .overrideProvider(VERIFICATION_KEY_SET_PROVIDER)
    .useValue(keyMaterial.verificationKeySetProvider)
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

function registerEvent(email: string, forwardedFor: string): ALBEvent {
  return {
    requestContext: {
      elb: {
        targetGroupArn:
          'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/stockroom-auth/6d0ecf831eec9f09',
      },
    },
    httpMethod: 'POST',
    path: '/auth/register',
    queryStringParameters: {},
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': forwardedFor,
      host: 'stockroom.test',
    },
    isBase64Encoded: false,
    body: JSON.stringify({ email, password: VALID_PASSWORD }),
  };
}

describe('client address derivation across transports (e2e)', () => {
  let app: INestApplication | undefined;
  let handler: (typeof import('../../../src/lambda'))['handler'] | undefined;

  beforeAll(async () => {
    setThrottleEnv();
    await ensureTableExists(
      new DynamoDBClient({
        region: requireEnv('AWS_REGION'),
        endpoint: requireEnv('DYNAMODB_ENDPOINT'),
      }),
      requireEnv('TABLE_NAME'),
    );
    jest.isolateModules(() => {
      ({ handler } = requireLambdaModule());
      app = undefined;
    });
    app = await buildIsolatedHttpApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('keys HTTP and Lambda requests by the same right-most forwarded address', async () => {
    const sharedHop = uniqueAddress();

    await request(httpServerOf(app as INestApplication))
      .post('/auth/register')
      .set('X-Forwarded-For', `198.51.100.10, ${sharedHop}`)
      .send({
        email: uniqueEmail('address-http'),
        password: VALID_PASSWORD,
      })
      .expect(201);

    const result = (await handler?.(
      registerEvent(uniqueEmail('address-lambda'), `192.0.2.22, ${sharedHop}`),
      fakeContext,
      () => undefined,
    )) as ALBResult;
    const body = JSON.parse(result.body ?? '{}') as ProblemBody;

    expect(result.statusCode).toBe(429);
    expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
