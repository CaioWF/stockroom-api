/**
 * An email address normalized for storage and comparison (FR2).
 *
 * Normalization order matters: trim first (so surrounding whitespace never
 * reaches NFC), then NFC (canonical composition — NOT NFKC, which folds
 * distinct characters together and could collide two different addresses),
 * then lowercase the entire address, local part included. RFC 5321 permits a
 * case-sensitive local part, but no mainstream mail provider honours that, so
 * treating case as significant would let `Foo@x.com` and `foo@x.com` become
 * two accounts (AC-2).
 *
 * @example
 * EmailAddress.parse('  Foo@Example.COM  ').toString() // 'foo@example.com'
 */

// RFC 5321 4.5.3.1.3 bounds a full reverse-path/forward-path at 256 octets
// including the angle brackets, i.e. 254 for the address itself.
const MAX_LENGTH = 254;

// Deliberately not a full RFC 5322 grammar: one '@', no whitespace on either
// side, and a domain with at least one '.'. Good enough to reject something
// that plainly is not an address without pulling in a parser library.
const SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class InvalidEmailAddressError extends Error {
  constructor(reason: string) {
    super(`invalid email address: ${reason}`);
    this.name = 'InvalidEmailAddressError';
  }
}

export class EmailAddress {
  private constructor(private readonly value: string) {}

  static parse(input: unknown): EmailAddress {
    if (typeof input !== 'string') {
      throw new InvalidEmailAddressError('must be a string');
    }

    // Locale-invariant: toLowerCase() (not toLocaleLowerCase()) is unaffected
    // by the runtime locale, so a Turkish-locale host never maps 'I' to a
    // dotless 'ı' and silently splits one address into two identities.
    const normalized = input.trim().normalize('NFC').toLowerCase();

    if (normalized.length === 0 || normalized.length > MAX_LENGTH) {
      throw new InvalidEmailAddressError('length must be 1..254 characters');
    }
    if (!SHAPE.test(normalized)) {
      throw new InvalidEmailAddressError('does not match the expected shape');
    }

    return new EmailAddress(normalized);
  }

  toString(): string {
    return this.value;
  }

  equals(other: EmailAddress): boolean {
    return this.value === other.value;
  }
}
