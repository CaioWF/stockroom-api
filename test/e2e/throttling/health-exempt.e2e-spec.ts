import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { buildTestApp } from '../auth/support/build-test-app';
import { httpServerOf } from '../auth/support/http-test-client';

describe('health throttle exemption (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await buildTestApp({
      configOverrides: {
        throttleAuthenticatedLimit: 1,
        throttleCredentialsLimit: 1,
        throttleJwksLimit: 1,
        throttleRefreshLimit: 1,
      },
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps /health admitted under a request flood', async () => {
    for (let index = 0; index < 8; index += 1) {
      await request(httpServerOf(app)).get('/health').expect(200);
    }
  });
});
