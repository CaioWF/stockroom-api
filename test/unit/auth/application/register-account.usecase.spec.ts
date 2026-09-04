import { RegisterAccount } from '../../../../src/auth/application/register-account.usecase';
import { EmailAddress } from '../../../../src/auth/domain/email-address';
import {
  RawPassword,
  InvalidPasswordLengthError,
} from '../../../../src/auth/domain/raw-password';
import { EmailAlreadyRegisteredError } from '../../../../src/auth/domain/errors';
import { InMemoryUserRepository } from '../../../fakes/in-memory-user-repository';
import { PassThroughPasswordHasher } from '../../../fakes/pass-through-password-hasher';
import { SequentialIdGenerator } from '../../../fakes/sequential-id-generator';

const PASSWORD = 'correct horse battery';

function buildRegisterAccount(): {
  registerAccount: RegisterAccount;
  userRepository: InMemoryUserRepository;
} {
  const userRepository = new InMemoryUserRepository();
  const registerAccount = new RegisterAccount(
    userRepository,
    new PassThroughPasswordHasher(),
    new SequentialIdGenerator(),
  );
  return { registerAccount, userRepository };
}

describe('RegisterAccount', () => {
  it('registers a new account and returns its id and normalized email (AC-1)', async () => {
    const { registerAccount, userRepository } = buildRegisterAccount();
    const email = EmailAddress.parse('New.User@Example.com');
    const password = RawPassword.parse(PASSWORD);

    const result = await registerAccount.execute(email, password);

    expect(result.accountId).toBe('00000000-0000-7000-8000-000000000000');
    expect(result.email.toString()).toBe('new.user@example.com');
    expect(Object.keys(result)).toEqual(['accountId', 'email']);

    const stored = await userRepository.findById(result.accountId);
    expect(stored).toBeDefined();
    const hasher = new PassThroughPasswordHasher();
    await expect(hasher.verify(password, stored!.passwordDigest)).resolves.toBe(
      true,
    );
    await expect(
      hasher.verify(
        RawPassword.parse('a different password!'),
        stored!.passwordDigest,
      ),
    ).resolves.toBe(false);
  });

  it('never returns a token or password material (AC-1)', async () => {
    const { registerAccount } = buildRegisterAccount();
    const email = EmailAddress.parse('no-secrets-here@example.com');
    const password = RawPassword.parse(PASSWORD);

    const result = await registerAccount.execute(email, password);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toMatch(/token/i);
    expect(serialized).not.toContain(PASSWORD);
  });

  it('rejects a duplicate address, including a case/whitespace variant, leaving the original account intact (AC-2)', async () => {
    const { registerAccount, userRepository } = buildRegisterAccount();
    const original = await registerAccount.execute(
      EmailAddress.parse('duplicate@example.com'),
      RawPassword.parse(PASSWORD),
    );

    await expect(
      registerAccount.execute(
        EmailAddress.parse('  Duplicate@Example.com  '),
        RawPassword.parse('a totally different password'),
      ),
    ).rejects.toThrow(EmailAlreadyRegisteredError);

    const stored = await userRepository.findByEmail(
      EmailAddress.parse('duplicate@example.com'),
    );
    expect(stored?.id).toBe(original.accountId);
    const hasher = new PassThroughPasswordHasher();
    await expect(
      hasher.verify(RawPassword.parse(PASSWORD), stored!.passwordDigest),
    ).resolves.toBe(true);
  });

  // AC-3: RegisterAccount's `execute` takes a RawPassword, not a raw string —
  // the 12-128 character policy is enforced by RawPassword.parse (Task 5), so
  // a caller can no longer construct an out-of-policy RawPassword to hand
  // this use case in the first place. This test proves that boundary holds:
  // the invalid input is refused before RegisterAccount is ever invoked,
  // rather than duplicating a length check inside the use case that the type
  // system already makes impossible to bypass.
  it('cannot be reached with a password outside the length policy — RawPassword.parse refuses it first (AC-3)', () => {
    expect(() => RawPassword.parse('short')).toThrow(
      InvalidPasswordLengthError,
    );
  });
});
