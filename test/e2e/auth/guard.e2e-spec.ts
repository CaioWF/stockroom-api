/**
 * `JwtAuthGuard`'s default-deny (FR11, FR12) exercised through the real
 * app: an HS256-forged token using the published public key as its HMAC
 * secret (AC-10), an RS256 token whose kid the trusted set never contains
 * and a genuinely expired RS256 token (AC-11), and confirmation that a
 * guarded route refuses with no credential while three of the six public
 * routes stay reachable without one (AC-12). The "exactly six" half of
 * AC-12 is proven separately, by
 * `test/unit/auth/presentation/public-route-allowlist.spec.ts` reflecting
 * `@Public()`'s metadata directly — see `contract.md`'s AC-12 entry.
 */
import { buildTestApp } from './support/build-test-app';

import { SignJWT } from 'jose';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { httpServerOf, ProblemBody } from './support/http-test-client';
import { TEST_ENV } from './support/set-test-environment';
import { signRs256Token } from './support/sign-token';
import { buildTestKeyMaterial } from './support/test-key-providers';

const TRUSTED_SUBJECT = '00000000-0000-7000-8000-000000000000';
const TRUSTED_EMAIL = 'attacker@example.com';

function currentUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

describe('JwtAuthGuard (e2e)', () => {
  let app: INestApplication;
  let trustedKid: string;
  let trustedPrivateKeyPem: string;
  let trustedPublicKeyPem: string;

  beforeAll(async () => {
    const testApp = await buildTestApp();
    app = testApp.app;
    trustedKid = testApp.keyMaterial.kid;
    trustedPrivateKeyPem = testApp.keyMaterial.privateKeyPem;
    trustedPublicKeyPem = testApp.keyMaterial.publicKeyPem;
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses a token signed HS256 with the published public key as the HMAC secret (AC-10, Finding 3)', async () => {
    const secret = new TextEncoder().encode(trustedPublicKeyPem);
    const forged = await new SignJWT({ email: TRUSTED_EMAIL })
      .setProtectedHeader({ alg: 'HS256', kid: trustedKid })
      .setSubject(TRUSTED_SUBJECT)
      .setIssuer(TEST_ENV.jwtIssuer)
      .setAudience(TEST_ENV.jwtAudience)
      .setIssuedAt(currentUnixSeconds())
      .setExpirationTime(currentUnixSeconds() + 900)
      .sign(secret);

    const response = await request(httpServerOf(app))
      .get('/auth/me')
      .set('Authorization', `Bearer ${forged}`);
    const body = response.body as ProblemBody;

    expect(response.status).toBe(401);
    expect(body.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('refuses a token whose kid is absent from the trusted set (AC-11, Finding 3)', async () => {
    const untrusted = await buildTestKeyMaterial();
    const forged = await signRs256Token({
      privateKeyPem: untrusted.privateKeyPem,
      kid: untrusted.kid,
      issuer: TEST_ENV.jwtIssuer,
      audience: TEST_ENV.jwtAudience,
      subject: TRUSTED_SUBJECT,
      email: TRUSTED_EMAIL,
      issuedAtSeconds: currentUnixSeconds(),
      expirationSeconds: currentUnixSeconds() + 900,
    });

    const response = await request(httpServerOf(app))
      .get('/auth/me')
      .set('Authorization', `Bearer ${forged}`);
    const body = response.body as ProblemBody;

    expect(response.status).toBe(401);
    expect(body.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('refuses an expired token (AC-11, Finding 3)', async () => {
    const forged = await signRs256Token({
      privateKeyPem: trustedPrivateKeyPem,
      kid: trustedKid,
      issuer: TEST_ENV.jwtIssuer,
      audience: TEST_ENV.jwtAudience,
      subject: TRUSTED_SUBJECT,
      email: TRUSTED_EMAIL,
      issuedAtSeconds: currentUnixSeconds() - 1000,
      expirationSeconds: currentUnixSeconds() - 500,
    });

    const response = await request(httpServerOf(app))
      .get('/auth/me')
      .set('Authorization', `Bearer ${forged}`);
    const body = response.body as ProblemBody;

    expect(response.status).toBe(401);
    expect(body.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('refuses a route absent from the public list with no credential (AC-12, default deny, Finding 3)', async () => {
    const response = await request(httpServerOf(app)).get('/auth/me');
    const body = response.body as ProblemBody;

    expect(response.status).toBe(401);
    expect(body.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('lets the three public routes this task built be reached without a credential (AC-12)', async () => {
    // An empty body still reaches the domain layer (proven by a
    // domain-specific 4xx code) rather than being blocked by the guard
    // (which would answer 401 with INVALID_ACCESS_TOKEN instead).
    const register = await request(httpServerOf(app))
      .post('/auth/register')
      .send({});
    const registerBody = register.body as ProblemBody;
    expect(registerBody.code).toBe('EMAIL_INVALID');

    const login = await request(httpServerOf(app)).post('/auth/login').send({});
    const loginBody = login.body as ProblemBody;
    expect(loginBody.code).toBe('EMAIL_INVALID');

    const refresh = await request(httpServerOf(app))
      .post('/auth/refresh')
      .send({});
    const refreshBody = refresh.body as ProblemBody;
    expect(refreshBody.code).toBe('INVALID_REFRESH_TOKEN');
  });
});
