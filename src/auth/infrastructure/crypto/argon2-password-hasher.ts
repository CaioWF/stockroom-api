/**
 * argon2id password hashing (FR5) at OWASP-recommended parameters, named
 * explicitly rather than left to `@node-rs/argon2`'s defaults — a
 * security-relevant cost parameter left to "whatever the library ships
 * today" would silently change if the dependency's own defaults ever did.
 * `memoryCost` is kibibytes per the installed version's own type
 * definitions (`node_modules/@node-rs/argon2/index.d.ts`), so 19 MiB is
 * 19 * 1024 KiB, not 19000 or 19.
 *
 * `hash()` returns a self-describing PHC-format string carrying its own
 * salt and cost parameters, so `PasswordDigest.fromHash` can wrap it
 * directly and `verify()` needs no parameters back — the stored string
 * already carries them.
 */

import { hash, verify } from '@node-rs/argon2';
import type { Algorithm } from '@node-rs/argon2';

import { PasswordDigest } from '../../domain/password-digest';
import { RawPassword } from '../../domain/raw-password';
import { PasswordHasher } from '../../domain/ports/password-hasher';

const MEMORY_COST_KIB = 19 * 1024; // OWASP: 19 MiB
const TIME_COST = 2;
const PARALLELISM = 1;

// `@node-rs/argon2` declares `Algorithm` as an ambient `const enum`, whose
// members can't be accessed as values under this project's `isolatedModules`
// tsconfig setting (each file is transpiled independently, so the enum's
// numeric value can't be inlined across the package boundary). Numeric enums
// are structurally open in TypeScript, so this literal — 2, `Argon2id`'s own
// value per the library's `index.d.ts` — is still checked against the
// library's real `Options.algorithm` type without importing the enum as a
// runtime value.
const ARGON2ID: Algorithm = 2;

export class Argon2PasswordHasher implements PasswordHasher {
  async hash(password: RawPassword): Promise<PasswordDigest> {
    const hashed = await hash(password.expose(), {
      algorithm: ARGON2ID,
      memoryCost: MEMORY_COST_KIB,
      timeCost: TIME_COST,
      parallelism: PARALLELISM,
    });
    return PasswordDigest.fromHash(hashed);
  }

  async verify(
    password: RawPassword,
    digest: PasswordDigest,
  ): Promise<boolean> {
    return verify(digest.expose(), password.expose());
  }
}
