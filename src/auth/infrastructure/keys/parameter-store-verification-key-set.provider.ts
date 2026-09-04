/**
 * Reads the set of currently trusted RS256 verification keys from one SSM
 * Parameter Store `SecureString` (Task 11's brief): the value is a JSON
 * array of SPKI PEM public-key strings, not a `GetParametersByPath` prefix —
 * this keeps both key providers symmetric (one `GetParameterCommand` call
 * each) and matches the singular "NAME" env var naming in `.env.example`.
 * During a key rotation this array grows to hold two entries; every PEM it
 * contains is trusted, with no special-casing here — that is the rotation
 * operator's concern, not this adapter's.
 *
 * Fetched lazily on first use and memoized per container, same mechanism as
 * `ParameterStoreSigningKeyProvider`: `cachedVerificationKeys` caches the
 * *promise*, assigned synchronously before any `await`, so racing callers
 * before the first `send()` resolves share one in-flight promise.
 *
 * `kid` is derived per key via the RFC 7638 thumbprint, matching the signing
 * provider's derivation (`importSPKI` → `exportJWK` → `calculateJwkThumbprint`).
 *
 * No typed error translation: per `src/auth/domain/errors.ts`'s own note,
 * `SERVICE_UNAVAILABLE` is deliberately untyped, so any SSM failure or
 * malformed value (not valid JSON, not an array) propagates as a plain
 * `Error`.
 */

import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { calculateJwkThumbprint, exportJWK, importSPKI } from 'jose';

import { VerificationKeysParameterMissingError } from './verification-keys-parameter-missing.error';
import { VerificationKeysParameterNotJsonArrayError } from './verification-keys-parameter-not-json-array.error';
import { VerificationKeysParameterNotStringArrayError } from './verification-keys-parameter-not-string-array.error';
import {
  VerificationKey,
  VerificationKeySetProvider,
} from '../../domain/ports/verification-key-set-provider';

const RSA_VERIFICATION_ALGORITHM = 'RS256';

export class ParameterStoreVerificationKeySetProvider implements VerificationKeySetProvider {
  private cachedVerificationKeys:
    Promise<readonly VerificationKey[]> | undefined;

  constructor(
    private readonly ssmClient: SSMClient,
    private readonly parameterName: string,
  ) {}

  getVerificationKeys(): Promise<readonly VerificationKey[]> {
    this.cachedVerificationKeys ??= this.fetchVerificationKeys();
    return this.cachedVerificationKeys;
  }

  private async fetchVerificationKeys(): Promise<readonly VerificationKey[]> {
    const publicKeyPems = this.parsePublicKeyPems(
      await this.fetchParameterValue(),
    );
    return Promise.all(publicKeyPems.map((pem) => this.toVerificationKey(pem)));
  }

  private async fetchParameterValue(): Promise<string> {
    const response = await this.ssmClient.send(
      new GetParameterCommand({
        Name: this.parameterName,
        WithDecryption: true,
      }),
    );
    const value = response.Parameter?.Value;
    if (value === undefined) {
      throw new VerificationKeysParameterMissingError(this.parameterName);
    }
    return value;
  }

  private parsePublicKeyPems(rawValue: string): readonly string[] {
    const parsed: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      throw new VerificationKeysParameterNotJsonArrayError(this.parameterName);
    }
    if (!parsed.every((item) => typeof item === 'string')) {
      throw new VerificationKeysParameterNotStringArrayError(
        this.parameterName,
      );
    }
    return parsed;
  }

  private async toVerificationKey(
    publicKeyPem: string,
  ): Promise<VerificationKey> {
    const key = await importSPKI(publicKeyPem, RSA_VERIFICATION_ALGORITHM);
    const kid = await calculateJwkThumbprint(await exportJWK(key));
    return { kid, publicKey: publicKeyPem };
  }
}
