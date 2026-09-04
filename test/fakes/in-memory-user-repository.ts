/**
 * An in-memory `UserRepository` (FR1-FR5) enforcing the same email-uniqueness
 * invariant the real DynamoDB adapter's conditional write does (FR4, AC-4):
 * a second `create` for an already-claimed normalized email throws rather
 * than silently overwriting. Keyed by `EmailAddress.toString()`, the
 * normalized value the value object itself exposes for comparison — never a
 * raw, unnormalized input.
 */

import { Account } from '../../src/auth/domain/account';
import { EmailAddress } from '../../src/auth/domain/email-address';
import { EmailAlreadyRegisteredError } from '../../src/auth/domain/errors';
import { UserRepository } from '../../src/auth/domain/ports/user-repository';

export class InMemoryUserRepository implements UserRepository {
  private readonly accountsByEmail = new Map<string, Account>();
  private readonly accountsById = new Map<string, Account>();

  // Returns Promise.reject() rather than throwing synchronously, so the
  // uniqueness violation always surfaces as a rejected promise, matching the
  // port's documented "Throws EmailAlreadyRegisteredError" for every caller
  // — including one that chains `.catch()` without an enclosing `await`/
  // `try`. (`async` + `throw` would do the same, but eslint's
  // `require-await` rejects an `async` method with no `await` inside it.)
  create(account: Account): Promise<void> {
    const normalizedEmail = account.email.toString();
    if (this.accountsByEmail.has(normalizedEmail)) {
      return Promise.reject(new EmailAlreadyRegisteredError(normalizedEmail));
    }
    this.accountsByEmail.set(normalizedEmail, account);
    this.accountsById.set(account.id, account);
    return Promise.resolve();
  }

  findByEmail(email: EmailAddress): Promise<Account | undefined> {
    return Promise.resolve(this.accountsByEmail.get(email.toString()));
  }

  findById(accountId: string): Promise<Account | undefined> {
    return Promise.resolve(this.accountsById.get(accountId));
  }
}
