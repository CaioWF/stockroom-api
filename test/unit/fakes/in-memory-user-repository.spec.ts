import { InMemoryUserRepository } from '../../fakes/in-memory-user-repository';
import { Account } from '../../../src/auth/domain/account';
import { EmailAddress } from '../../../src/auth/domain/email-address';
import { PasswordDigest } from '../../../src/auth/domain/password-digest';
import { EmailAlreadyRegisteredError } from '../../../src/auth/domain/errors';

const HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaGVkdmFsdWU';

function buildAccount(id: string, email: string): Account {
  return new Account(
    id,
    EmailAddress.parse(email),
    PasswordDigest.fromHash(HASH),
    0,
  );
}

describe('InMemoryUserRepository', () => {
  it('finds a created account by its normalized email', async () => {
    const repository = new InMemoryUserRepository();
    const account = buildAccount(
      '018f1c9a-1234-7abc-89ab-0123456789ab',
      'Merchant@Example.com',
    );

    await repository.create(account);

    const found = await repository.findByEmail(
      EmailAddress.parse('merchant@example.com'),
    );
    expect(found).toBe(account);
  });

  it('finds a created account by its id', async () => {
    const repository = new InMemoryUserRepository();
    const account = buildAccount(
      '018f1c9a-1234-7abc-89ab-0123456789ab',
      'merchant@example.com',
    );

    await repository.create(account);

    await expect(
      repository.findById('018f1c9a-1234-7abc-89ab-0123456789ab'),
    ).resolves.toBe(account);
  });

  it('returns undefined for an email with no registered account', async () => {
    const repository = new InMemoryUserRepository();

    await expect(
      repository.findByEmail(EmailAddress.parse('nobody@example.com')),
    ).resolves.toBeUndefined();
  });

  it('returns undefined for an id with no registered account', async () => {
    const repository = new InMemoryUserRepository();

    await expect(repository.findById('missing-id')).resolves.toBeUndefined();
  });

  it('rejects a second create for the same normalized email (AC-4)', async () => {
    const repository = new InMemoryUserRepository();
    const first = buildAccount(
      '018f1c9a-1234-7abc-89ab-0123456789ab',
      'merchant@example.com',
    );
    const second = buildAccount(
      '018f1c9a-5678-7def-9abc-fedcba987654',
      'Merchant@Example.com',
    );
    await repository.create(first);

    await expect(repository.create(second)).rejects.toThrow(
      EmailAlreadyRegisteredError,
    );
  });
});
