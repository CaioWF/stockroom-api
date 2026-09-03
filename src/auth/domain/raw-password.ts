/**
 * A candidate plaintext password, accepted only within the length policy
 * (FR3, AC-3). No composition rule beyond length is imposed.
 *
 * NFC runs before the length check because normalization changes length:
 * RFC 8265's `OpaqueString` profile specifies canonical composition (form
 * C), so this follows the same form rather than NFKC, which would fold
 * distinct characters together and discard entropy the caller believed they
 * had.
 *
 * The upper bound is a trust-boundary control, not cosmetic: argon2id does
 * not truncate its input the way bcrypt does, so an unbounded body lets an
 * unauthenticated caller force the hash to chew through arbitrary-sized
 * input. Checking it here means no oversized value ever reaches a hash call.
 *
 * @example
 * RawPassword.parse('correct horse battery').expose() // the NFC-normalized string
 */

const MIN_LENGTH = 12;
const MAX_LENGTH = 128;

export class InvalidPasswordLengthError extends Error {
  constructor(actualLength: number) {
    super(
      `password length must be ${MIN_LENGTH}..${MAX_LENGTH} characters after NFC normalization, got ${actualLength}`,
    );
    this.name = 'InvalidPasswordLengthError';
  }
}

export class RawPassword {
  private constructor(private readonly value: string) {}

  static parse(input: unknown): RawPassword {
    if (typeof input !== 'string') {
      throw new InvalidPasswordLengthError(0);
    }

    const normalized = input.normalize('NFC');
    if (normalized.length < MIN_LENGTH || normalized.length > MAX_LENGTH) {
      throw new InvalidPasswordLengthError(normalized.length);
    }

    return new RawPassword(normalized);
  }

  /** Yields the plaintext for a hasher call. The value is never logged. */
  expose(): string {
    return this.value;
  }
}
