/**
 * Crafts a compact RS256 JWT directly with `jose`, mirroring
 * `Rs256AccessTokenSigner`'s own construction — used by guard.e2e-spec.ts to
 * build tokens the guard must refuse (unknown kid, expired) without routing
 * through the real `AuthenticateAccount` use case.
 */
import { importPKCS8, SignJWT } from 'jose';

const RS256_ALGORITHM = 'RS256';

export interface SignTokenOptions {
  readonly privateKeyPem: string;
  readonly kid: string;
  readonly issuer: string;
  readonly audience: string;
  readonly subject: string;
  readonly email: string;
  readonly issuedAtSeconds: number;
  readonly expirationSeconds: number;
}

export async function signRs256Token(
  options: SignTokenOptions,
): Promise<string> {
  const key = await importPKCS8(options.privateKeyPem, RS256_ALGORITHM);
  return new SignJWT({ email: options.email })
    .setProtectedHeader({ alg: RS256_ALGORITHM, kid: options.kid })
    .setSubject(options.subject)
    .setIssuer(options.issuer)
    .setAudience(options.audience)
    .setIssuedAt(options.issuedAtSeconds)
    .setExpirationTime(options.expirationSeconds)
    .sign(key);
}
