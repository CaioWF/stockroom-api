/**
 * Account and email-lock item shapes (plan.md's Data Layer Contract). Two
 * item types share one mapper file because both are written from, and
 * derived from, the same `Account` aggregate — an email-lock item carries no
 * fields of its own beyond the id it points back to.
 *
 * `toAccount` reconstructs `EmailAddress`/`PasswordDigest` from already-
 * normalized, already-hashed storage values — this is rebuilding a value
 * object from trusted data, not re-validating untrusted input, so a parse
 * failure here is a data-integrity bug and is left to surface untranslated
 * (per `errors.ts`'s "no typed error for the unexpected" policy).
 */

import { Account } from '../../domain/account';
import { EmailAddress } from '../../domain/email-address';
import { PasswordDigest } from '../../domain/password-digest';

/** The account item (`USER#<id>` / `PROFILE`). */
export function toAccountItem(account: Account): Record<string, unknown> {
  return {
    email: account.email.toString(),
    password_hash: account.passwordDigest.expose(),
    created_at: new Date().toISOString(),
    token_generation: account.tokenGeneration,
  };
}

/**
 * The email-lock item (`EMAIL#<normalized>` / `EMAIL`). `user_id` is the only
 * attribute — the lock's sole job is to exist-or-not under a condition
 * expression (FR4), never to carry data a reader consults beyond that id.
 */
export function toEmailLockItem(account: Account): Record<string, unknown> {
  return { user_id: account.id };
}

// The account id lives in the item's PK (`USER#<id>`), never as its own
// stored attribute (per the Data Layer Contract's account row), so the
// caller — which already knows the id from the key it queried by — merges
// it into `item.id` before calling this. Re-deriving it here by slicing the
// `USER#` prefix would duplicate a string literal table-keys.ts alone owns.
/** Reconstructs the `Account` aggregate from a stored account item. */
export function toAccount(item: Record<string, unknown>): Account {
  return new Account(
    item.id as string,
    EmailAddress.parse(item.email),
    PasswordDigest.fromHash(item.password_hash),
    item.token_generation as number,
  );
}
