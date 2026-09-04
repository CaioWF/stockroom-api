import { EmailAddress } from '../email-address';

/**
 * The claims that vary per token (FR8): subject and the informational email
 * claim FR13 describes. Issuer, audience, and expiry are configuration
 * (FR7, FR8), not per-call data, so the adapter supplies them from its own
 * config rather than have every caller thread them through — only what
 * actually changes between accounts crosses this port.
 */
export interface AccessTokenClaims {
  readonly accountId: string;
  readonly email: EmailAddress;
}

/** Signs claims into an RS256 JWT (FR8). Async — the real adapter reads its signing key lazily. */
export interface AccessTokenSigner {
  sign(claims: AccessTokenClaims): Promise<string>;
}
