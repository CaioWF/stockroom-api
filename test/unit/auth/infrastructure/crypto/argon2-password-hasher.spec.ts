import { Argon2PasswordHasher } from '../../../../../src/auth/infrastructure/crypto/argon2-password-hasher';
import { RawPassword } from '../../../../../src/auth/domain/raw-password';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('verifies a digest against the password it was produced from (FR5)', async () => {
    const password = RawPassword.parse('correct horse battery staple');

    const digest = await hasher.hash(password);

    await expect(hasher.verify(password, digest)).resolves.toBe(true);
  });

  it('rejects a digest against a different password (FR5)', async () => {
    const password = RawPassword.parse('correct horse battery staple');
    const otherPassword = RawPassword.parse('wrong horse battery staple');

    const digest = await hasher.hash(password);

    await expect(hasher.verify(otherPassword, digest)).resolves.toBe(false);
  });

  it('produces a PHC hash string that names the argon2id variant explicitly', async () => {
    const password = RawPassword.parse('correct horse battery staple');

    const digest = await hasher.hash(password);

    // PHC strings are self-describing (e.g. "$argon2id$v=19$m=19456,t=2,p=1$...")
    // — this is the one concrete proof the *id* variant was actually selected
    // rather than left to whatever the library defaults to.
    expect(digest.expose()).toContain('argon2id');
  });
});
