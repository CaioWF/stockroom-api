/**
 * Reads the RS256 signing key from the local PEM pair `npm run keys:generate`
 * writes, for a developer running the server without an AWS account. The
 * composition root selects this adapter only when `AppConfig.keySource` is
 * `filesystem`, which `parseAppConfig` grants to one exact `NODE_ENV` value.
 *
 * Mirrors `ParameterStoreSigningKeyProvider`: the promise is memoized on
 * first use, assigned before any `await` so racing callers share one read,
 * and `kid` comes from the same RFC 7638 derivation so a token signed here
 * verifies against the public half of the same pair.
 *
 * No typed error translation, matching the Parameter Store adapter and
 * `src/auth/domain/errors.ts`'s note that `SERVICE_UNAVAILABLE` is
 * deliberately untyped: a missing or malformed PEM propagates as a plain
 * error and the filter answers 503.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { calculateJwkThumbprint, exportJWK, importPKCS8 } from 'jose';

import {
  SigningKey,
  SigningKeyProvider,
} from '../../domain/ports/signing-key-provider';

const RSA_SIGNING_ALGORITHM = 'RS256';
const PRIVATE_KEY_FILE = 'private.pem';

export class FileSystemSigningKeyProvider implements SigningKeyProvider {
  private cachedSigningKey: Promise<SigningKey> | undefined;

  constructor(private readonly keysDirectory: string) {}

  getSigningKey(): Promise<SigningKey> {
    this.cachedSigningKey ??= this.readSigningKey();
    return this.cachedSigningKey;
  }

  private async readSigningKey(): Promise<SigningKey> {
    const privateKey = await readFile(
      join(this.keysDirectory, PRIVATE_KEY_FILE),
      'utf8',
    );
    return { kid: await calculateKid(privateKey), privateKey };
  }
}

// `importPKCS8` defaults private keys to non-extractable, which would make
// the following `exportJWK` throw — the same reason the Parameter Store
// adapter passes this flag.
async function calculateKid(privateKey: string): Promise<string> {
  const key = await importPKCS8(privateKey, RSA_SIGNING_ALGORITHM, {
    extractable: true,
  });
  return calculateJwkThumbprint(await exportJWK(key));
}
