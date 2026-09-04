/**
 * A "pass-through" `PasswordHasher` (FR5) — no real argon2id. Deterministic
 * so `hash` then `verify` composes predictably in a test: `verify` re-derives
 * the same marked string from the candidate password and compares it against
 * what `digest.expose()` yields, rather than reaching around `PasswordDigest`'s
 * opacity with a cast — `expose()` and `fromHash()` are its own public
 * construction/inspection contract, so this fake never needs an unsafe cast
 * to see or produce a digest's content.
 */

import { PasswordDigest } from '../../src/auth/domain/password-digest';
import { RawPassword } from '../../src/auth/domain/raw-password';
import { PasswordHasher } from '../../src/auth/domain/ports/password-hasher';

const FAKE_HASH_PREFIX = 'fake-hash:';

export class PassThroughPasswordHasher implements PasswordHasher {
  hash(password: RawPassword): Promise<PasswordDigest> {
    const marked = `${FAKE_HASH_PREFIX}${password.expose()}`;
    return Promise.resolve(PasswordDigest.fromHash(marked));
  }

  verify(password: RawPassword, digest: PasswordDigest): Promise<boolean> {
    const candidate = `${FAKE_HASH_PREFIX}${password.expose()}`;
    return Promise.resolve(candidate === digest.expose());
  }
}
