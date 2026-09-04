/** The one private key and its RFC 7638 thumbprint `kid`, as used by `AccessTokenSigner` (FR8). */
export interface SigningKey {
  readonly kid: string;
  readonly privateKey: string;
}

/**
 * Supplies the signing key. Async, memoized per container in the real
 * adapter (Task 11) and fetched lazily on first use so a Parameter Store
 * problem cannot fail a health check (FR25) — but memoization and laziness
 * are adapter concerns; this port only exposes the accessor.
 */
export interface SigningKeyProvider {
  getSigningKey(): Promise<SigningKey>;
}
