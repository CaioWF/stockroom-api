/**
 * Signs access tokens as RS256 JWTs (FR8). `jose`'s `importPKCS8`/`SignJWT`
 * cover the whole flow from a PEM string to a compact JWS without hand-
 * rolling any JOSE serialization — the same reasoning `SigningKeyProvider`'s
 * own port JSDoc gives for not reading a key file directly here: this class
 * only knows how to sign, not where the key comes from (Task 11 supplies
 * the real provider).
 *
 * `iat`/`exp` are computed from the injected `Clock`, never `Date.now()`,
 * per FR20 — a test can assert on the exact claim values without real
 * elapsed time.
 */

import type { KeyLike } from 'jose';
import { importPKCS8, SignJWT } from 'jose';

import {
  AccessTokenClaims,
  AccessTokenSigner,
} from '../../domain/ports/access-token-signer';
import { Clock } from '../../domain/ports/clock';
import { SigningKeyProvider } from '../../domain/ports/signing-key-provider';

const JWT_ALGORITHM = 'RS256';
const MILLISECONDS_PER_SECOND = 1000;

export class Rs256AccessTokenSigner implements AccessTokenSigner {
  // `signingKeyProvider.getSigningKey()` is itself memoized per container
  // (its own JSDoc), so `privateKey` never changes within this instance's
  // lifetime — caching the imported CryptoKey the same way (a memoized
  // promise, assigned before any await) avoids redoing jose's PEM->CryptoKey
  // import on every sign() call.
  private cachedKey: Promise<KeyLike> | undefined;

  constructor(
    private readonly signingKeyProvider: SigningKeyProvider,
    private readonly clock: Clock,
    private readonly jwtIssuer: string,
    private readonly jwtAudience: string,
    private readonly accessTokenTtlSeconds: number,
  ) {}

  async sign(claims: AccessTokenClaims): Promise<string> {
    const { kid, privateKey } = await this.signingKeyProvider.getSigningKey();
    const key = await this.importSigningKey(privateKey);
    const issuedAtSeconds = this.toUnixSeconds(this.clock.now());

    return new SignJWT({ email: claims.email.toString() })
      .setProtectedHeader({ alg: JWT_ALGORITHM, kid })
      .setSubject(claims.accountId)
      .setIssuer(this.jwtIssuer)
      .setAudience(this.jwtAudience)
      .setIssuedAt(issuedAtSeconds)
      .setExpirationTime(issuedAtSeconds + this.accessTokenTtlSeconds)
      .sign(key);
  }

  private toUnixSeconds(date: Date): number {
    return Math.floor(date.getTime() / MILLISECONDS_PER_SECOND);
  }

  private importSigningKey(privateKey: string): Promise<KeyLike> {
    this.cachedKey ??= importPKCS8(privateKey, JWT_ALGORITHM);
    return this.cachedKey;
  }
}
