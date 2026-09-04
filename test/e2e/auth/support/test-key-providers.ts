/**
 * Test-only doubles for the two Parameter-Store-backed key-provider ports
 * (task-13-brief.md's "Local/e2e signing-key strategy"): e2e tests cannot
 * reach real AWS SSM, so this mints a throwaway RS256 pair in-memory —
 * simpler and less brittle for CI than depending on `keys/private.pem`
 * existing on disk — deriving `kid` the same RFC 7638 way
 * generate-dev-keys.ts and the real Parameter Store adapters already do.
 * Wired in only via `Test.createTestingModule(...).overrideProvider(...)`
 * in build-test-app.ts; production `auth.module.ts` wiring is never
 * touched.
 */

import { generateKeyPairSync } from 'node:crypto';

import { calculateJwkThumbprint, exportJWK, importSPKI } from 'jose';

import type {
  SigningKey,
  SigningKeyProvider,
} from '../../../../src/auth/domain/ports/signing-key-provider';
import type {
  VerificationKey,
  VerificationKeySetProvider,
} from '../../../../src/auth/domain/ports/verification-key-set-provider';

const RSA_MODULUS_LENGTH = 2048;
const RS256_ALGORITHM = 'RS256';

export interface TestKeyMaterial {
  readonly kid: string;
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
  readonly signingKeyProvider: SigningKeyProvider;
  readonly verificationKeySetProvider: VerificationKeySetProvider;
}

/** Generates one throwaway RS256 pair and wraps it as both port doubles, keyed by its RFC 7638 thumbprint. */
export async function buildTestKeyMaterial(): Promise<TestKeyMaterial> {
  const { privateKey, publicKey } = generateRsaKeyPairPem();
  const kid = await calculateKid(publicKey);
  const signingKey: SigningKey = { kid, privateKey };
  const verificationKey: VerificationKey = { kid, publicKey };

  return {
    kid,
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
    signingKeyProvider: { getSigningKey: () => Promise.resolve(signingKey) },
    verificationKeySetProvider: {
      getVerificationKeys: () => Promise.resolve([verificationKey]),
    },
  };
}

function generateRsaKeyPairPem(): { privateKey: string; publicKey: string } {
  return generateKeyPairSync('rsa', {
    modulusLength: RSA_MODULUS_LENGTH,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
}

async function calculateKid(publicKeyPem: string): Promise<string> {
  const key = await importSPKI(publicKeyPem, RS256_ALGORITHM);
  return calculateJwkThumbprint(await exportJWK(key));
}
