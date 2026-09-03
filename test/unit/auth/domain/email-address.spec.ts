import {
  EmailAddress,
  InvalidEmailAddressError,
} from '../../../../src/auth/domain/email-address';

describe('EmailAddress', () => {
  it('accepts a well-formed address and exposes it unchanged when already normalized', () => {
    const email = EmailAddress.parse('merchant@example.com');

    expect(email.toString()).toBe('merchant@example.com');
  });

  it('trims surrounding whitespace, normalizes to NFC, and lowercases the entire address', () => {
    const email = EmailAddress.parse('  Foo.Bar@Example.COM  ');

    expect(email.toString()).toBe('foo.bar@example.com');
  });

  it('treats two addresses differing only in case or surrounding whitespace as equal (AC-2)', () => {
    const first = EmailAddress.parse('Merchant@Example.com');
    const second = EmailAddress.parse('  merchant@example.com  ');

    expect(first.equals(second)).toBe(true);
    expect(first.toString()).toBe(second.toString());
  });

  it('lowercases using the locale-invariant conversion, not the Turkish dotless-i mapping', () => {
    // toLocaleLowerCase() under a 'tr' locale would map 'I' to dotless 'ı', not 'i'.
    // A locale-invariant lowercasing must always produce the ASCII 'i'.
    const email = EmailAddress.parse('IUSER@EXAMPLE.COM');

    expect(email.toString()).toBe('iuser@example.com');
  });

  it('rejects a non-string input', () => {
    expect(() => EmailAddress.parse(42)).toThrow(InvalidEmailAddressError);
  });

  it('rejects a string with no @ sign', () => {
    expect(() => EmailAddress.parse('not-an-address')).toThrow(
      InvalidEmailAddressError,
    );
  });

  it('rejects a string with internal whitespace', () => {
    expect(() => EmailAddress.parse('foo bar@example.com')).toThrow(
      InvalidEmailAddressError,
    );
  });

  it('rejects an address exceeding the length bound', () => {
    const overlong = `${'a'.repeat(250)}@example.com`;

    expect(() => EmailAddress.parse(overlong)).toThrow(
      InvalidEmailAddressError,
    );
  });

  it('rejects an empty string after trimming', () => {
    expect(() => EmailAddress.parse('   ')).toThrow(InvalidEmailAddressError);
  });
});
