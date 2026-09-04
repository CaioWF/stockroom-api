import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
} from '../../../../src/auth/domain/errors';

describe('EmailAlreadyRegisteredError', () => {
  it('names itself and reports the conflicting email', () => {
    const error = new EmailAlreadyRegisteredError('merchant@example.com');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('EmailAlreadyRegisteredError');
    expect(error.email).toBe('merchant@example.com');
    expect(error.message).toContain('merchant@example.com');
  });
});

describe('InvalidCredentialsError', () => {
  it('names itself', () => {
    const error = new InvalidCredentialsError();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('InvalidCredentialsError');
  });

  it('produces an identical message on every construction, by taking no reason (AC-6)', () => {
    const wrongPassword = new InvalidCredentialsError();
    const unknownAddress = new InvalidCredentialsError();

    expect(wrongPassword.message).toBe(unknownAddress.message);
  });
});
