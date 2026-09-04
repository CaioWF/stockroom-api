import { Account } from '../../../../src/auth/domain/account';
import { EmailAddress } from '../../../../src/auth/domain/email-address';
import { PasswordDigest } from '../../../../src/auth/domain/password-digest';

// Fixture id: UUIDv7-shaped (version nibble '7', variant nibble in 8-b) but
// not tied to any real account — synthetic test fixture, not a real id.
const ACCOUNT_ID = '018f1c9a-1234-7abc-89ab-0123456789ab';
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaGVkdmFsdWU';

describe('Account', () => {
  it('carries the id, email, password digest, and token generation exactly as given', () => {
    const email = EmailAddress.parse('merchant@example.com');
    const digest = PasswordDigest.fromHash(HASH);

    const account = new Account(ACCOUNT_ID, email, digest, 0);

    expect(account.id).toBe(ACCOUNT_ID);
    expect(account.email).toBe(email);
    expect(account.passwordDigest).toBe(digest);
    expect(account.tokenGeneration).toBe(0);
  });

  it('carries a token generation greater than zero after revocation has run', () => {
    const email = EmailAddress.parse('merchant@example.com');
    const digest = PasswordDigest.fromHash(HASH);

    const account = new Account(ACCOUNT_ID, email, digest, 3);

    expect(account.tokenGeneration).toBe(3);
  });
});
