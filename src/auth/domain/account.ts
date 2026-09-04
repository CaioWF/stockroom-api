/**
 * The account aggregate (FR1-FR5): an identity, its normalized email, the
 * argon2id digest of its password, and the revocation generation FR19
 * describes. Fields arrive already validated — by `EmailAddress.parse`,
 * `PasswordDigest.fromHash`, and a repository read — so this layer carries
 * them rather than re-validating them (see `errors.ts` for what *is*
 * detected at this layer, once an entity or use case exists to detect it).
 *
 * A plain data carrier, deliberately: comparing `tokenGeneration` against a
 * presented token's stamped value is `RotateRefreshToken`'s job (Task 9),
 * not this entity's — giving it that method here would duplicate a decision
 * the use case already owns.
 *
 * @example
 * new Account(id, email, digest, 0).tokenGeneration // 0
 */

import { EmailAddress } from './email-address';
import { PasswordDigest } from './password-digest';

export class Account {
  constructor(
    public readonly id: string,
    public readonly email: EmailAddress,
    public readonly passwordDigest: PasswordDigest,
    public readonly tokenGeneration: number,
  ) {}
}
