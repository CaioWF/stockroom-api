/** One trusted verification key, identifiable by its RFC 7638 thumbprint `kid` (FR9, FR12). */
export interface VerificationKey {
  readonly kid: string;
  readonly publicKey: string;
}

/**
 * Supplies the *set* of currently trusted public keys — plural, because
 * during a key rotation both the guard and the key-set route need more than
 * one (plan.md's "Signing keys" decision). Async, memoized per container in
 * the real adapter (Task 11); the port only exposes the accessor.
 */
export interface VerificationKeySetProvider {
  getVerificationKeys(): Promise<readonly VerificationKey[]>;
}
