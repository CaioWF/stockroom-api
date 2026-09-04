/**
 * Entity- and use-case-level errors for the closed code set FR24 names. The
 * three codes already detected inside a value object —
 * `PASSWORD_LENGTH_INVALID` (`InvalidPasswordLengthError`, raw-password.ts),
 * `EMAIL_INVALID` (`InvalidEmailAddressError`, email-address.ts), and the
 * malformed-at-the-boundary case of `INVALID_REFRESH_TOKEN`
 * (`InvalidRefreshTokenCredentialError`, refresh-token-credential.ts) — stay
 * in their own files; this file owns only what becomes detectable once an
 * entity or a use case exists to detect it.
 *
 * `SERVICE_UNAVAILABLE` has no type here: see the note at the bottom of this
 * file for why.
 */

/**
 * `EMAIL_ALREADY_REGISTERED` (FR4, AC-2): the registration transaction's
 * email-lock condition found the address already claimed.
 */
export class EmailAlreadyRegisteredError extends Error {
  constructor(public readonly email: string) {
    super(`account already registered for email: ${email}`);
    this.name = 'EmailAlreadyRegisteredError';
  }
}

/**
 * `INVALID_CREDENTIALS`: wrong password or unregistered address at sign-in
 * (AC-6). One type for both cases, not two — AC-6 requires an identical
 * body either way, and a type with no reason field makes producing two
 * different bodies for the two branches impossible to do by accident, the
 * same way `RefreshTokenCredential`'s rejection reason is deliberately
 * absent from what reaches the client.
 */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('invalid credentials');
    this.name = 'InvalidCredentialsError';
  }
}

// SERVICE_UNAVAILABLE is deliberately not a type in this file. FR23 assigns
// translating an infrastructure failure into a typed error to the adapters
// (Tasks 10-12) — nothing at this layer ever looks at validated domain state
// and concludes "storage is unavailable" the way it concludes "this email is
// taken" or "this password is wrong". FR24 describes SERVICE_UNAVAILABLE as
// the code for "anything unexpected reaching the boundary", which makes it a
// presentation-layer default (Task 13's exception filter): whatever reaches
// it that isn't one of the other five typed errors maps to this code.
