/**
 * Registers a new account (FR1, FR4, FR5): mints a UUIDv7 id via
 * `IdGenerator`, hashes the password via `PasswordHasher`, and writes the
 * account through `UserRepository.create` — the repository's conditional
 * write is the single source of truth for email uniqueness, so a duplicate
 * address surfaces as `EmailAlreadyRegisteredError` thrown straight out of
 * `create`, uncaught and untranslated here (AC-2). Translating that into an
 * HTTP status is the presentation layer's job (Task 13), not this one's.
 *
 * A brand-new account always starts at revocation generation zero — nothing
 * has rotated a refresh token for it yet.
 *
 * FR1 permits exactly the id and the normalized email to leave this
 * boundary: no token, no password material anywhere in the result (AC-1).
 */

import { Account } from '../domain/account';
import { EmailAddress } from '../domain/email-address';
import { RawPassword } from '../domain/raw-password';
import { IdGenerator } from '../domain/ports/id-generator';
import { PasswordHasher } from '../domain/ports/password-hasher';
import { UserRepository } from '../domain/ports/user-repository';

const INITIAL_TOKEN_GENERATION = 0;

export interface RegisterAccountResult {
  readonly accountId: string;
  readonly email: EmailAddress;
}

export class RegisterAccount {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    email: EmailAddress,
    password: RawPassword,
  ): Promise<RegisterAccountResult> {
    const passwordDigest = await this.passwordHasher.hash(password);
    const account = new Account(
      this.idGenerator.newId(),
      email,
      passwordDigest,
      INITIAL_TOKEN_GENERATION,
    );

    await this.userRepository.create(account);

    return { accountId: account.id, email: account.email };
  }
}
