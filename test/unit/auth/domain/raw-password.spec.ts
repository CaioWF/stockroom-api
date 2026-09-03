import {
  RawPassword,
  InvalidPasswordLengthError,
} from '../../../../src/auth/domain/raw-password';

describe('RawPassword', () => {
  it('accepts a password at the minimum length of 12', () => {
    const password = RawPassword.parse('a'.repeat(12));

    expect(password.expose()).toBe('a'.repeat(12));
  });

  it('accepts a password at the maximum length of 128', () => {
    const password = RawPassword.parse('a'.repeat(128));

    expect(password.expose()).toHaveLength(128);
  });

  it('rejects a password of 11 characters, naming the length rule (AC-3)', () => {
    expect(() => RawPassword.parse('a'.repeat(11))).toThrow(
      InvalidPasswordLengthError,
    );
    expect(() => RawPassword.parse('a'.repeat(11))).toThrow(/12\.\.128/);
  });

  it('rejects a password of 129 characters, naming the length rule (AC-3)', () => {
    expect(() => RawPassword.parse('a'.repeat(129))).toThrow(
      InvalidPasswordLengthError,
    );
    expect(() => RawPassword.parse('a'.repeat(129))).toThrow(/12\.\.128/);
  });

  it('measures length after NFC normalization, not before', () => {
    // U+0065 U+0301 (e + combining acute) is two code units before NFC and
    // one after — NFC composes them into U+00E9 (é). Pad so the composed
    // form lands exactly on the 12-character floor.
    const decomposed = 'é' + 'a'.repeat(11);

    expect(() => RawPassword.parse(decomposed)).not.toThrow();
    expect(RawPassword.parse(decomposed).expose()).toHaveLength(12);
  });

  it('rejects a non-string input', () => {
    expect(() => RawPassword.parse(12345)).toThrow(InvalidPasswordLengthError);
  });

  it('imposes no composition rule beyond length', () => {
    const allLowercase = 'abcdefghijkl';

    expect(() => RawPassword.parse(allLowercase)).not.toThrow();
  });
});
