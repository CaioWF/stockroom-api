/**
 * Reads the trusted verification key from the local PEM pair
 * `npm run keys:generate` writes, the counterpart to
 * `FileSystemSigningKeyProvider`.
 *
 * The set holds exactly one key. Rotation is what makes the Parameter Store
 * adapter's set grow to two, and rotating a laptop's dev pair is not a case
 * this feature serves — regenerate the pair instead.
 *
 * `kid` uses the same RFC 7638 derivation as every other key adapter here,
 * so the guard matches a token signed by the private half of this pair.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { calculateJwkThumbprint, exportJWK, importSPKI } from 'jose';

import {
  VerificationKey,
  VerificationKeySetProvider,
} from '../../domain/ports/verification-key-set-provider';

const RSA_VERIFICATION_ALGORITHM = 'RS256';
const PUBLIC_KEY_FILE = 'public.pem';

export class FileSystemVerificationKeySetProvider implements VerificationKeySetProvider {
  private cachedVerificationKeys:
    Promise<readonly VerificationKey[]> | undefined;

  constructor(private readonly keysDirectory: string) {}

  getVerificationKeys(): Promise<readonly VerificationKey[]> {
    this.cachedVerificationKeys ??= this.readVerificationKeys();
    return this.cachedVerificationKeys;
  }

  private async readVerificationKeys(): Promise<readonly VerificationKey[]> {
    const publicKey = await readFile(
      join(this.keysDirectory, PUBLIC_KEY_FILE),
      'utf8',
    );
    return [{ kid: await calculateKid(publicKey), publicKey }];
  }
}

async function calculateKid(publicKey: string): Promise<string> {
  const key = await importSPKI(publicKey, RSA_VERIFICATION_ALGORITHM);
  return calculateJwkThumbprint(await exportJWK(key));
}
