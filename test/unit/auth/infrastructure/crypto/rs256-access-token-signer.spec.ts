import { generateKeyPairSync } from 'node:crypto';

import {
  decodeProtectedHeader,
  importPKCS8,
  importSPKI,
  jwtVerify,
} from 'jose';

import { Rs256AccessTokenSigner } from '../../../../../src/auth/infrastructure/crypto/rs256-access-token-signer';
import { EmailAddress } from '../../../../../src/auth/domain/email-address';
import {
  SigningKey,
  SigningKeyProvider,
} from '../../../../../src/auth/domain/ports/signing-key-provider';
import { ControllableClock } from '../../../../fakes/controllable-clock';

// `importPKCS8` wrapped in a spy (module registry is per-spec-file, so this
// mock never leaks into other suites) — the only way to observe whether the
// PEM->CryptoKey import is memoized, since call count is otherwise invisible
// from outside the signer.
jest.mock('jose', () => {
  const actual: typeof import('jose') = jest.requireActual('jose');
  return { ...actual, importPKCS8: jest.fn(actual.importPKCS8) };
});

// Adapter-local test double (per the brief): a fixed {kid, privateKey} from a
// key pair generated once here — too small and single-purpose to belong
// under test/fakes/**.
class FixedSigningKeyProvider implements SigningKeyProvider {
  constructor(private readonly key: SigningKey) {}

  getSigningKey(): Promise<SigningKey> {
    return Promise.resolve(this.key);
  }
}

const TEST_KID = 'test-signing-key';
const JWT_ISSUER = 'https://auth.stockroom.test';
const JWT_AUDIENCE = 'stockroom-api';
const ACCESS_TOKEN_TTL_SECONDS = 900;
const MILLISECONDS_PER_SECOND = 1000;

describe('Rs256AccessTokenSigner', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  it('signs claims into an RS256 JWT carrying FR8/FR13 header and payload fields', async () => {
    const clock = new ControllableClock(new Date('2026-01-01T00:00:00.000Z'));
    const provider = new FixedSigningKeyProvider({ kid: TEST_KID, privateKey });
    const signer = new Rs256AccessTokenSigner(
      provider,
      clock,
      JWT_ISSUER,
      JWT_AUDIENCE,
      ACCESS_TOKEN_TTL_SECONDS,
    );
    const accountId = '00000000-0000-7000-8000-000000000001';
    const email = EmailAddress.parse('user@example.com');

    const token = await signer.sign({ accountId, email });

    const header = decodeProtectedHeader(token);
    expect(header.alg).toBe('RS256');
    expect(header.kid).toBe(TEST_KID);

    const verificationKey = await importSPKI(publicKey, 'RS256');
    const { payload } = await jwtVerify(token, verificationKey, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      currentDate: clock.now(),
    });

    const expectedIssuedAtSeconds = Math.floor(
      clock.now().getTime() / MILLISECONDS_PER_SECOND,
    );
    expect(payload.sub).toBe(accountId);
    expect(payload.email).toBe('user@example.com');
    expect(payload.iss).toBe(JWT_ISSUER);
    expect(payload.aud).toBe(JWT_AUDIENCE);
    expect(payload.iat).toBe(expectedIssuedAtSeconds);
    expect(payload.exp).toBe(
      expectedIssuedAtSeconds + ACCESS_TOKEN_TTL_SECONDS,
    );
  });

  it('imports the signing key only once across multiple sign() calls', async () => {
    (importPKCS8 as jest.Mock).mockClear();
    const clock = new ControllableClock(new Date('2026-01-01T00:00:00.000Z'));
    const provider = new FixedSigningKeyProvider({ kid: TEST_KID, privateKey });
    const signer = new Rs256AccessTokenSigner(
      provider,
      clock,
      JWT_ISSUER,
      JWT_AUDIENCE,
      ACCESS_TOKEN_TTL_SECONDS,
    );
    const accountId = '00000000-0000-7000-8000-000000000001';
    const email = EmailAddress.parse('user@example.com');

    await signer.sign({ accountId, email });
    await signer.sign({ accountId, email });
    await signer.sign({ accountId, email });

    expect(importPKCS8).toHaveBeenCalledTimes(1);
  });
});
