import { generateKeyPairSync } from 'node:crypto';

import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { importSPKI, SignJWT } from 'jose';

import { JwtAuthGuard } from '../../../../src/auth/presentation/jwt-auth.guard';
import type { AppConfig } from '../../../../src/shared/config/environment.schema';
import type {
  VerificationKey,
  VerificationKeySetProvider,
} from '../../../../src/auth/domain/ports/verification-key-set-provider';

// `importSPKI` wrapped in a spy (module registry is per-spec-file, so this
// mock never leaks into other suites) — the only way to observe whether the
// PEM->CryptoKey import is memoized per kid, since call count is otherwise
// invisible from outside the guard.
jest.mock('jose', () => {
  const actual: typeof import('jose') = jest.requireActual('jose');
  return { ...actual, importSPKI: jest.fn(actual.importSPKI) };
});

// Adapter-local test double (same convention as
// rs256-access-token-signer.spec.ts's FixedSigningKeyProvider): a fixed key
// set, too small and single-purpose to belong under test/fakes/**.
class FixedVerificationKeySetProvider implements VerificationKeySetProvider {
  constructor(private readonly keys: readonly VerificationKey[]) {}

  getVerificationKeys(): Promise<readonly VerificationKey[]> {
    return Promise.resolve(this.keys);
  }
}

const TEST_KID = 'test-verification-key';
const JWT_ISSUER = 'https://auth.stockroom.test';
const JWT_AUDIENCE = 'stockroom-api';

function buildExecutionContext(authorizationHeader?: string): ExecutionContext {
  const request = { headers: { authorization: authorizationHeader } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => (): void => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  it('imports the verification key only once across multiple canActivate() calls for the same kid', async () => {
    (importSPKI as jest.Mock).mockClear();
    const { importPKCS8 } = jest.requireActual<typeof import('jose')>('jose');
    const signingKey = await importPKCS8(privateKey, 'RS256');
    const token = await new SignJWT({ email: 'user@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: TEST_KID })
      .setSubject('00000000-0000-7000-8000-000000000001')
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(signingKey);
    const provider = new FixedVerificationKeySetProvider([
      { kid: TEST_KID, publicKey },
    ]);
    const guard = new JwtAuthGuard(new Reflector(), provider, {
      jwtIssuer: JWT_ISSUER,
      jwtAudience: JWT_AUDIENCE,
    } as AppConfig);

    await guard.canActivate(buildExecutionContext(`Bearer ${token}`));
    await guard.canActivate(buildExecutionContext(`Bearer ${token}`));
    await guard.canActivate(buildExecutionContext(`Bearer ${token}`));

    expect(importSPKI).toHaveBeenCalledTimes(1);
  });
});
