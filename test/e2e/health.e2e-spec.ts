/**
 * `GET /health` (FR25, AC-22): liveness must not touch storage or acquire a
 * signing/verification key. Deliberately does NOT use `./auth/support/build-
 * test-app`, which overrides both key providers with in-memory doubles —
 * that override would make "the parameter-store fetch was never called"
 * trivially true regardless of what health.controller.ts actually does.
 * Instead this boots AppModule with its real production wiring (real
 * `ParameterStoreSigningKeyProvider`/`ParameterStoreVerificationKeySetProvider`,
 * real `DynamoDBDocumentClient`) and spies on the underlying SDK clients'
 * `send` — the assertion is on the wire-level call, not the port method, so
 * a memoized provider cache from an earlier call in the same process cannot
 * hide a real regression.
 */
import './auth/support/set-test-environment';

import { SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { httpServerOf } from './auth/support/http-test-client';

describe('GET /health (e2e)', () => {
  let app: INestApplication;
  let dynamoSendSpy: jest.SpyInstance;
  let ssmSendSpy: jest.SpyInstance;

  beforeAll(async () => {
    dynamoSendSpy = jest.spyOn(DynamoDBDocumentClient.prototype, 'send');
    ssmSendSpy = jest.spyOn(SSMClient.prototype, 'send');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    dynamoSendSpy.mockRestore();
    ssmSendSpy.mockRestore();
  });

  it('returns 200 with no storage read and no key acquisition (AC-22)', async () => {
    dynamoSendSpy.mockClear();
    ssmSendSpy.mockClear();

    const response = await request(httpServerOf(app)).get('/health');

    expect(response.status).toBe(200);
    expect(dynamoSendSpy).not.toHaveBeenCalled();
    expect(ssmSendSpy).not.toHaveBeenCalled();
  });
});
