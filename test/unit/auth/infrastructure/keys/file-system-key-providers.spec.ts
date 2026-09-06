import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FileSystemSigningKeyProvider } from '../../../../../src/auth/infrastructure/keys/file-system-signing-key.provider';
import { FileSystemVerificationKeySetProvider } from '../../../../../src/auth/infrastructure/keys/file-system-verification-key-set.provider';

// A pair generated per test run, in a temp directory — never the repo's own
// keys/, so the suite stays independent of whether a developer has run
// `npm run keys:generate`.
function writeKeyPair(directory: string): void {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  writeFileSync(join(directory, 'private.pem'), privateKey);
  writeFileSync(join(directory, 'public.pem'), publicKey);
}

describe('file system key providers', () => {
  let keysDirectory: string;

  beforeEach(() => {
    keysDirectory = mkdtempSync(join(tmpdir(), 'stockroom-keys-'));
  });

  afterEach(() => {
    rmSync(keysDirectory, { recursive: true, force: true });
  });

  // AC-3: a token signed with the local pair has to verify against it, which
  // holds exactly when both providers derive the same thumbprint.
  it('derives the same kid from both halves of one pair', async () => {
    writeKeyPair(keysDirectory);

    const signingKey = await new FileSystemSigningKeyProvider(
      keysDirectory,
    ).getSigningKey();
    const verificationKeys = await new FileSystemVerificationKeySetProvider(
      keysDirectory,
    ).getVerificationKeys();

    expect(verificationKeys).toHaveLength(1);
    expect(verificationKeys[0]?.kid).toBe(signingKey.kid);
  });

  it('exposes the private key it read', async () => {
    writeKeyPair(keysDirectory);

    const signingKey = await new FileSystemSigningKeyProvider(
      keysDirectory,
    ).getSigningKey();

    expect(signingKey.privateKey).toContain('BEGIN PRIVATE KEY');
  });

  // AC-4: a missing or malformed pair fails, so the problem filter answers
  // 503 rather than the app serving unsigned or wrongly signed tokens.
  it('rejects when the private key is absent', async () => {
    await expect(
      new FileSystemSigningKeyProvider(keysDirectory).getSigningKey(),
    ).rejects.toThrow();
  });

  it('rejects when the public key is absent', async () => {
    await expect(
      new FileSystemVerificationKeySetProvider(
        keysDirectory,
      ).getVerificationKeys(),
    ).rejects.toThrow();
  });

  it('rejects when the private key is not a usable PEM', async () => {
    writeKeyPair(keysDirectory);
    writeFileSync(join(keysDirectory, 'private.pem'), 'not a pem');

    await expect(
      new FileSystemSigningKeyProvider(keysDirectory).getSigningKey(),
    ).rejects.toThrow();
  });

  it('rejects when the public key is not a usable PEM', async () => {
    writeKeyPair(keysDirectory);
    writeFileSync(join(keysDirectory, 'public.pem'), 'not a pem');

    await expect(
      new FileSystemVerificationKeySetProvider(
        keysDirectory,
      ).getVerificationKeys(),
    ).rejects.toThrow();
  });

  it('reads the pair once and reuses it', async () => {
    writeKeyPair(keysDirectory);
    const provider = new FileSystemSigningKeyProvider(keysDirectory);

    const first = await provider.getSigningKey();
    rmSync(join(keysDirectory, 'private.pem'));

    await expect(provider.getSigningKey()).resolves.toEqual(first);
  });
});
