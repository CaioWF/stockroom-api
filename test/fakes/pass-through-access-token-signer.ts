/**
 * A "pass-through" `AccessTokenSigner` (FR8) — no RS256, no real JWT.
 * `sign` returns a stable JSON encoding of the claims so a test can assert
 * on the exact string a use case produced, without parsing a real token.
 */

import {
  AccessTokenClaims,
  AccessTokenSigner,
} from '../../src/auth/domain/ports/access-token-signer';

export class PassThroughAccessTokenSigner implements AccessTokenSigner {
  sign(claims: AccessTokenClaims): Promise<string> {
    const encoded = JSON.stringify({
      accountId: claims.accountId,
      email: claims.email.toString(),
    });
    return Promise.resolve(encoded);
  }
}
