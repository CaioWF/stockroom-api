/**
 * An opaque wrapper around a password hash (FR5). The digest is never
 * persisted, logged, or returned as plaintext, so this type must not leak
 * its contents through any of the ways a value escapes into a log line: a
 * template-string conversion, `JSON.stringify`, or a bare `console.log`.
 *
 * The value lives in a private class field (`#value`), which — unlike a
 * `private` TypeScript property — is invisible to `Object.keys`,
 * `JSON.stringify`'s default enumeration, and `util.inspect`. The overrides
 * below make that opacity explicit and independent of that engine detail.
 *
 * @example
 * const digest = PasswordDigest.fromHash(hashedByArgon2id);
 * `${digest}` // '[PasswordDigest]', never the hash
 */

const INSPECT_CUSTOM = Symbol.for('nodejs.util.inspect.custom');

export class InvalidPasswordDigestError extends Error {
  constructor() {
    super('password digest must be a non-empty hash string');
    this.name = 'InvalidPasswordDigestError';
  }
}

export class PasswordDigest {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  static fromHash(hash: unknown): PasswordDigest {
    if (typeof hash !== 'string' || hash.length === 0) {
      throw new InvalidPasswordDigestError();
    }
    return new PasswordDigest(hash);
  }

  /** Yields the hash for storage or verification. Never log the result. */
  expose(): string {
    return this.#value;
  }

  toString(): string {
    return '[PasswordDigest]';
  }

  toJSON(): string {
    return '[PasswordDigest]';
  }

  [INSPECT_CUSTOM](): string {
    return '[PasswordDigest]';
  }
}
