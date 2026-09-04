import { generateKeyPairSync } from 'node:crypto';

import { SSMClient } from '@aws-sdk/client-ssm';
import { calculateJwkThumbprint, exportJWK, importSPKI } from 'jose';

import { ParameterStoreSigningKeyProvider } from '../../../../../src/auth/infrastructure/keys/parameter-store-signing-key.provider';
import { SigningKeyParameterMissingError } from '../../../../../src/auth/infrastructure/keys/signing-key-parameter-missing.error';
import { FakeSsmClient } from './fake-ssm-client';

const PARAMETER_NAME = '/stockroom/auth/signing-key';
const RSA_ALGORITHM = 'RS256';

describe('ParameterStoreSigningKeyProvider', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  async function expectedThumbprint(): Promise<string> {
    const key = await importSPKI(publicKey, RSA_ALGORITHM);
    return calculateJwkThumbprint(await exportJWK(key));
  }

  it('fetches lazily and derives kid from the private key', async () => {
    const fakeSsmClient = new FakeSsmClient(privateKey);
    const provider = new ParameterStoreSigningKeyProvider(
      fakeSsmClient as unknown as SSMClient,
      PARAMETER_NAME,
    );

    expect(fakeSsmClient.callCount).toBe(0);

    const signingKey = await provider.getSigningKey();

    expect(signingKey.privateKey).toBe(privateKey);
    expect(signingKey.kid).toBe(await expectedThumbprint());
    expect(fakeSsmClient.callCount).toBe(1);
  });

  it('memoizes so that two calls racing against the first, unsettled fetch trigger only one SSM call', async () => {
    const fakeSsmClient = new FakeSsmClient(privateKey);
    const provider = new ParameterStoreSigningKeyProvider(
      fakeSsmClient as unknown as SSMClient,
      PARAMETER_NAME,
    );

    expect(fakeSsmClient.callCount).toBe(0);

    const [first, second] = await Promise.all([
      provider.getSigningKey(),
      provider.getSigningKey(),
    ]);

    expect(fakeSsmClient.callCount).toBe(1);
    expect(first).toEqual(second);

    await provider.getSigningKey();
    expect(fakeSsmClient.callCount).toBe(1);
  });

  it('rejects with a typed SigningKeyParameterMissingError when the SSM parameter has no value (Finding 4)', async () => {
    const fakeSsmClient = new FakeSsmClient(undefined);
    const provider = new ParameterStoreSigningKeyProvider(
      fakeSsmClient as unknown as SSMClient,
      PARAMETER_NAME,
    );

    await expect(provider.getSigningKey()).rejects.toThrow(
      SigningKeyParameterMissingError,
    );
  });
});
