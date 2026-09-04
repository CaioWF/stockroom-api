/**
 * Mints UUIDv7 identifiers (FR10). Deliberately just this: the 256-bit
 * refresh-token secret that plan.md's Architecture section also mentions
 * ("through IdGenerator plus random bytes") is generated with
 * `node:crypto.randomBytes` directly inside the use case rather than
 * through a port. A port earns its place by needing a swappable or
 * test-controllable implementation; random-secret generation needs neither
 * — no test asserts on a secret's exact bytes, only that it is present and
 * distinct — while id minting does: a fake's deterministic sequence is what
 * makes assertions on stored keys and rotation chains legible and stable in
 * the use-case tests Task 9 writes.
 */
export interface IdGenerator {
  newId(): string;
}
