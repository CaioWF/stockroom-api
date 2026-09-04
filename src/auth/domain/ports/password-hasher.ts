import { PasswordDigest } from '../password-digest';
import { RawPassword } from '../raw-password';

/**
 * argon2id hashing and verification (FR5). Both async: the real adapter's
 * argon2id call is CPU-bound native work, not I/O, but still not something a
 * synchronous port signature should hide.
 */
export interface PasswordHasher {
  hash(password: RawPassword): Promise<PasswordDigest>;
  verify(password: RawPassword, digest: PasswordDigest): Promise<boolean>;
}
