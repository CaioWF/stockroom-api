/**
 * Reads the RS256 signing private key from one SSM Parameter Store
 * `SecureString` (Task 11's brief): a single PKCS8 PEM, plain text, no
 * envelope — one key, one parameter, matching the singular `SigningKey` the
 * port returns. Fetched lazily on first use and memoized per container (the
 * port's own JSDoc requires this so a Parameter Store outage cannot fail a
 * health check, FR25): `cachedSigningKey` caches the *promise*, assigned
 * synchronously before any `await`, so two callers racing before the first
 * `send()` resolves both see the same in-flight promise — the same
 * no-await-between-check-and-write reasoning `InMemoryRefreshTokenRepository.rotate`
 * uses for its own atomicity.
 *
 * `kid` is derived, not stored (plan.md: "the RFC 7638 thumbprint of the
 * key"). Computing it from the private key's own exported JWK yields the
 * identical thumbprint a public-key export would, since `calculateJwkThumbprint`
 * only reads a JWK's required public members (`kty`, `n`, `e` for RSA) — so
 * the public half of this key pair is never needed here.
 *
 * No typed error translation: per `src/auth/domain/errors.ts`'s own note,
 * `SERVICE_UNAVAILABLE` is deliberately untyped, so any SSM failure or
 * malformed value propagates as a plain `Error`.
 */

import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { calculateJwkThumbprint, exportJWK, importPKCS8 } from 'jose';

import { SigningKeyParameterMissingError } from './signing-key-parameter-missing.error';
import {
  SigningKey,
  SigningKeyProvider,
} from '../../domain/ports/signing-key-provider';

const RSA_SIGNING_ALGORITHM = 'RS256';

export class ParameterStoreSigningKeyProvider implements SigningKeyProvider {
  private cachedSigningKey: Promise<SigningKey> | undefined;

  constructor(
    private readonly ssmClient: SSMClient,
    private readonly parameterName: string,
  ) {}

  getSigningKey(): Promise<SigningKey> {
    this.cachedSigningKey ??= this.fetchSigningKey();
    return this.cachedSigningKey;
  }

  private async fetchSigningKey(): Promise<SigningKey> {
    const privateKey = await this.fetchParameterValue();
    const kid = await this.calculateKid(privateKey);
    return { kid, privateKey };
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
      throw new SigningKeyParameterMissingError(this.parameterName);
    }
    return value;
  }

  // `importPKCS8` defaults private keys to non-extractable (jose's
  // `KeyImportOptions.extractable` JSDoc), which would make the immediately
  // following `exportJWK` throw — `extractable: true` is required here
  // specifically because, unlike `Rs256AccessTokenSigner`'s import (which
  // only signs), this one also needs to export the key to derive `kid`.
  private async calculateKid(privateKey: string): Promise<string> {
    const key = await importPKCS8(privateKey, RSA_SIGNING_ALGORITHM, {
      extractable: true,
    });
    return calculateJwkThumbprint(await exportJWK(key));
  }
}
