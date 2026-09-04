import { Account } from '../account';
import { EmailAddress } from '../email-address';

/**
 * Register's account write and sign-in's account lookup (plan.md's
 * "Data flow, register" / "Data flow, sign in"). Both operations read/write
 * strongly consistent — AC-7 requires a just-committed account to be
 * visible on the very next sign-in.
 */
export interface UserRepository {
  /**
   * Writes the account and its email lock in one transaction, conditioned on
   * the lock's absence (FR4, AC-4). Throws `EmailAlreadyRegisteredError`
   * when the lock already exists — the conditional write is the single
   * source of truth for uniqueness, not a prior read.
   */
  create(account: Account): Promise<void>;

  /**
   * Looks up an account by its normalized email. `undefined` means no
   * account is registered for the address — sign-in turns that into the
   * same `InvalidCredentialsError` a wrong password produces (AC-6).
   */
  findByEmail(email: EmailAddress): Promise<Account | undefined>;

  /**
   * Looks up an account by its id. `undefined` means no account exists for
   * that id — refresh's rotation (Task 9) needs this to recover the email
   * `AccessTokenSigner.AccessTokenClaims` requires, since `RefreshToken`
   * carries only the account id, not the email.
   */
  findById(accountId: string): Promise<Account | undefined>;
}
