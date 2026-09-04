/**
 * Task 17 subtask: "the full register → sign in → guarded call → refresh →
 * guarded call cycle." No other spec in this suite chains all five steps in
 * one test — register.e2e-spec.ts, login.e2e-spec.ts, refresh.e2e-spec.ts,
 * and me.e2e-spec.ts each drive a prefix of this chain to prove their own
 * route's AC, but none carries the SAME account through every step and
 * checks that the identity returned by `/auth/me` is unchanged before and
 * after a rotation. Lives under `test/e2e/contract/` because it is a
 * whole-feature assertion, not one route's.
 */
import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { buildTestApp } from '../auth/support/build-test-app';
import {
  httpServerOf,
  MeBody,
  RegisterBody,
  TokenPairBody,
} from '../auth/support/http-test-client';

const VALID_PASSWORD = 'correct horse battery';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

describe('Full auth lifecycle (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers, signs in, calls a guarded route, refreshes, then calls the guarded route again with the new token', async () => {
    const email = uniqueEmail('lifecycle');

    const register = await request(httpServerOf(app))
      .post('/auth/register')
      .send({ email, password: VALID_PASSWORD });
    const registerBody = register.body as RegisterBody;
    expect(register.status).toBe(201);

    const login = await request(httpServerOf(app))
      .post('/auth/login')
      .send({ email, password: VALID_PASSWORD });
    const loginBody = login.body as TokenPairBody;
    expect(login.status).toBe(200);

    const firstMe = await request(httpServerOf(app))
      .get('/auth/me')
      .set('Authorization', `Bearer ${loginBody.accessToken}`);
    const firstMeBody = firstMe.body as MeBody;
    expect(firstMe.status).toBe(200);
    expect(firstMeBody.accountId).toBe(registerBody.accountId);
    expect(firstMeBody.email).toBe(email);

    const refresh = await request(httpServerOf(app))
      .post('/auth/refresh')
      .send({ refreshToken: loginBody.refreshToken });
    const refreshBody = refresh.body as TokenPairBody;
    expect(refresh.status).toBe(200);
    // Not asserting refreshBody.accessToken !== loginBody.accessToken here:
    // the access-token payload (sub, email, iss, aud, iat, exp — no jti,
    // per FR8) and RS256 signing are both deterministic, so login and
    // refresh issued within the same wall-clock second produce a
    // byte-identical token. That's not a spec violation; it just makes the
    // comparison meaningless at this granularity.
    expect(refreshBody.refreshToken).not.toBe(loginBody.refreshToken);

    const secondMe = await request(httpServerOf(app))
      .get('/auth/me')
      .set('Authorization', `Bearer ${refreshBody.accessToken}`);
    const secondMeBody = secondMe.body as MeBody;
    expect(secondMe.status).toBe(200);
    expect(secondMeBody.accountId).toBe(firstMeBody.accountId);
    expect(secondMeBody.email).toBe(firstMeBody.email);
  });
});
