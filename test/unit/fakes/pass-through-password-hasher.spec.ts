import { PassThroughPasswordHasher } from '../../fakes/pass-through-password-hasher';
import { RawPassword } from '../../../src/auth/domain/raw-password';

describe('PassThroughPasswordHasher', () => {
  it('verifies true for the same password that was hashed', async () => {
    const hasher = new PassThroughPasswordHasher();
    const password = RawPassword.parse('correct horse battery staple');

    const digest = await hasher.hash(password);

    await expect(hasher.verify(password, digest)).resolves.toBe(true);
  });

  it('verifies false for a different password against that digest', async () => {
    const hasher = new PassThroughPasswordHasher();
    const original = RawPassword.parse('correct horse battery staple');
    const different = RawPassword.parse('another totally different phrase');

    const digest = await hasher.hash(original);

    await expect(hasher.verify(different, digest)).resolves.toBe(false);
  });

  it('produces the same digest content for the same password across calls', async () => {
    const hasher = new PassThroughPasswordHasher();
    const password = RawPassword.parse('correct horse battery staple');

    const first = await hasher.hash(password);
    const second = await hasher.hash(password);

    expect(first.expose()).toBe(second.expose());
  });
});
