import { generateKeyPairSync } from 'node:crypto';

import { SSMClient } from '@aws-sdk/client-ssm';
import { calculateJwkThumbprint, exportJWK, importSPKI } from 'jose';

import { ParameterStoreVerificationKeySetProvider } from '../../../../../src/auth/infrastructure/keys/parameter-store-verification-key-set.provider';
import { VerificationKeysParameterMissingError } from '../../../../../src/auth/infrastructure/keys/verification-keys-parameter-missing.error';
import { VerificationKeysParameterNotJsonArrayError } from '../../../../../src/auth/infrastructure/keys/verification-keys-parameter-not-json-array.error';
import { VerificationKeysParameterNotStringArrayError } from '../../../../../src/auth/infrastructure/keys/verification-keys-parameter-not-string-array.error';
import { FakeSsmClient } from './fake-ssm-client';

const PARAMETER_NAME = '/stockroom/auth/verification-keys';
const RSA_ALGORITHM = 'RS256';

function generatePublicKeyPem(): string {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }).publicKey;
}

async function thumbprintOf(publicKeyPem: string): Promise<string> {
  const key = await importSPKI(publicKeyPem, RSA_ALGORITHM);
  return calculateJwkThumbprint(await exportJWK(key));
}

describe('ParameterStoreVerificationKeySetProvider', () => {
  it('fetches lazily and resolves every trusted key with its RFC 7638 kid', async () => {
    const publicKeyPem1 = generatePublicKeyPem();
    const publicKeyPem2 = generatePublicKeyPem();
    const fakeSsmClient = new FakeSsmClient(
      JSON.stringify([publicKeyPem1, publicKeyPem2]),
    );
    const provider = new ParameterStoreVerificationKeySetProvider(
      fakeSsmClient as unknown as SSMClient,
      PARAMETER_NAME,
    );

    expect(fakeSsmClient.callCount).toBe(0);

    const keys = await provider.getVerificationKeys();

    expect(keys).toHaveLength(2);
    expect(keys).toEqual(
      expect.arrayContaining([
        { publicKey: publicKeyPem1, kid: await thumbprintOf(publicKeyPem1) },
        { publicKey: publicKeyPem2, kid: await thumbprintOf(publicKeyPem2) },
      ]),
    );
    expect(fakeSsmClient.callCount).toBe(1);
  });

  it('memoizes so that two calls racing against the first, unsettled fetch trigger only one SSM call', async () => {
    const publicKeyPem1 = generatePublicKeyPem();
    const publicKeyPem2 = generatePublicKeyPem();
    const fakeSsmClient = new FakeSsmClient(
      JSON.stringify([publicKeyPem1, publicKeyPem2]),
    );
    const provider = new ParameterStoreVerificationKeySetProvider(
      fakeSsmClient as unknown as SSMClient,
      PARAMETER_NAME,
    );

    expect(fakeSsmClient.callCount).toBe(0);

    const [first, second] = await Promise.all([
      provider.getVerificationKeys(),
      provider.getVerificationKeys(),
    ]);

    expect(fakeSsmClient.callCount).toBe(1);
    expect(first).toEqual(second);

    await provider.getVerificationKeys();
    expect(fakeSsmClient.callCount).toBe(1);
  });

  it('rejects with a typed VerificationKeysParameterMissingError when the SSM parameter has no value (Finding 4)', async () => {
    const fakeSsmClient = new FakeSsmClient(undefined);
    const provider = new ParameterStoreVerificationKeySetProvider(
      fakeSsmClient as unknown as SSMClient,
      PARAMETER_NAME,
    );

    await expect(provider.getVerificationKeys()).rejects.toThrow(
      VerificationKeysParameterMissingError,
    );
  });

  it('rejects with a typed VerificationKeysParameterNotJsonArrayError when the parameter value is not JSON (Finding 4)', async () => {
    const fakeSsmClient = new FakeSsmClient('not json');
    const provider = new ParameterStoreVerificationKeySetProvider(
      fakeSsmClient as unknown as SSMClient,
      PARAMETER_NAME,
    );

    // JSON.parse throws its own SyntaxError before the "is it an array"
    // check ever runs, so this case is a SyntaxError, not the typed
    // not-a-JSON-array error — see the provider's own catch site.
    await expect(provider.getVerificationKeys()).rejects.toThrow(SyntaxError);
  });

  it('rejects with a typed VerificationKeysParameterNotJsonArrayError when the parameter value is valid JSON but not an array (Finding 4)', async () => {
    const fakeSsmClient = new FakeSsmClient(
      JSON.stringify({ not: 'an array' }),
    );
    const provider = new ParameterStoreVerificationKeySetProvider(
      fakeSsmClient as unknown as SSMClient,
      PARAMETER_NAME,
    );

    await expect(provider.getVerificationKeys()).rejects.toThrow(
      VerificationKeysParameterNotJsonArrayError,
    );
  });

  it('rejects with a typed VerificationKeysParameterNotStringArrayError when the array contains a non-string element (Finding 4)', async () => {
    const fakeSsmClient = new FakeSsmClient(
      JSON.stringify([generatePublicKeyPem(), 42]),
    );
    const provider = new ParameterStoreVerificationKeySetProvider(
      fakeSsmClient as unknown as SSMClient,
      PARAMETER_NAME,
    );

    await expect(provider.getVerificationKeys()).rejects.toThrow(
      VerificationKeysParameterNotStringArrayError,
    );
  });
});
