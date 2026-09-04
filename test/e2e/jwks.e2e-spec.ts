/**
 * `GET /.well-known/jwks.json` (FR9, AC-13): every trusted key published as
 * an RFC 7517 JWK Set, unauthenticated, with an explicit cache lifetime.
 * The JWK's usability is proven behaviorally — verifying a token signed
 * with the matching private key against the JWK the route actually
 * returns — rather than only asserting on its shape.
 */
import { buildTestApp } from './auth/support/build-test-app';

import type { INestApplication } from '@nestjs/common';
import { importJWK, JWK, jwtVerify } from 'jose';
import request from 'supertest';

import { httpServerOf } from './auth/support/http-test-client';
import { TEST_ENV } from './auth/support/set-test-environment';
import { signRs256Token } from './auth/support/sign-token';

const RS256_ALGORITHM = 'RS256';
const TRUSTED_SUBJECT = '00000000-0000-7000-8000-000000000000';
const TRUSTED_EMAIL = 'jwks-consumer@example.com';

interface JwkSetBody {
  readonly keys: readonly JWK[];
}

function currentUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

describe('GET /.well-known/jwks.json (e2e)', () => {
  let app: INestApplication;
  let kid: string;
  let privateKeyPem: string;

  beforeAll(async () => {
    const testApp = await buildTestApp();
    app = testApp.app;
    kid = testApp.keyMaterial.kid;
    privateKeyPem = testApp.keyMaterial.privateKeyPem;
  });

  afterAll(async () => {
    await app.close();
  });

  it('publishes every trusted key with an explicit cache lifetime, unauthenticated (AC-13)', async () => {
    const response = await request(httpServerOf(app)).get(
      '/.well-known/jwks.json',
    );

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toMatch(/max-age=\d+/);

    const body = response.body as JwkSetBody;
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]?.kid).toBe(kid);
  });

  it('publishes a key that verifies a token actually signed with the matching private key (AC-13)', async () => {
    const response = await request(httpServerOf(app)).get(
      '/.well-known/jwks.json',
    );
    const body = response.body as JwkSetBody;
    const publishedJwk = body.keys[0];
    if (publishedJwk === undefined) {
      throw new Error('expected at least one published key');
    }

    const token = await signRs256Token({
      privateKeyPem,
      kid,
      issuer: TEST_ENV.jwtIssuer,
      audience: TEST_ENV.jwtAudience,
      subject: TRUSTED_SUBJECT,
      email: TRUSTED_EMAIL,
      issuedAtSeconds: currentUnixSeconds(),
      expirationSeconds: currentUnixSeconds() + 900,
    });

    const publicKey = await importJWK(publishedJwk, RS256_ALGORITHM);
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: [RS256_ALGORITHM],
      issuer: TEST_ENV.jwtIssuer,
      audience: TEST_ENV.jwtAudience,
    });

    expect(payload.sub).toBe(TRUSTED_SUBJECT);
  });
});
