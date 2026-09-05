/**
 * `auth`'s own contribution to the shared problem-mapping registry (FR24,
 * Task 2 002-request-throttling) — every row here names a type this bounded
 * context defines. `AuthModule` provides this array under `PROBLEM_MAPPINGS`
 * (see ../../shared/presentation/problem-mapping.ts) so the shared
 * `ProblemDetailsFilter` never needs to import from `auth`.
 */
import { HttpStatus, UnauthorizedException } from '@nestjs/common';

import { RefreshTokenAccountNotFoundError } from '../application/refresh-token-account-not-found.error';
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
} from '../domain/errors';
import { InvalidEmailAddressError } from '../domain/email-address';
import { InvalidPasswordLengthError } from '../domain/raw-password';
import { InvalidRefreshTokenCredentialError } from '../domain/refresh-token-credential';
import { SigningKeyParameterMissingError } from '../infrastructure/keys/signing-key-parameter-missing.error';
import { VerificationKeysParameterMissingError } from '../infrastructure/keys/verification-keys-parameter-missing.error';
import { VerificationKeysParameterNotJsonArrayError } from '../infrastructure/keys/verification-keys-parameter-not-json-array.error';
import { VerificationKeysParameterNotStringArrayError } from '../infrastructure/keys/verification-keys-parameter-not-string-array.error';
import { row, ProblemRow } from '../../shared/presentation/problem-mapping';
import { ProblemCode } from '../../shared/presentation/problem-details.filter';
import { MissingAuthClaimsError } from './missing-auth-claims.error';
import { RefreshRejectedError } from './refresh-rejected.error';

// The closed table (FR24) as data, not an if-chain: the shared filter's
// lookup becomes a single `.find`, and each row is exactly one line to read
// or add. `row()`'s `code` parameter is typed `string` (problem-mapping.ts
// stays generic, since `shared` cannot import auth's types) — the `satisfies
// ProblemCode` on each literal below is what actually ties this context's
// contributed codes back to the closed set at compile time, so a typo'd
// code fails `tsc` here rather than only showing up in an e2e assertion.
export const authProblemMappings: readonly ProblemRow[] = [
  row(
    (e) => e instanceof EmailAlreadyRegisteredError,
    HttpStatus.CONFLICT,
    'EMAIL_ALREADY_REGISTERED' satisfies ProblemCode,
    true,
  ),
  row(
    (e) => e instanceof InvalidPasswordLengthError,
    HttpStatus.UNPROCESSABLE_ENTITY,
    'PASSWORD_LENGTH_INVALID' satisfies ProblemCode,
    true,
  ),
  row(
    (e) => e instanceof InvalidEmailAddressError,
    HttpStatus.UNPROCESSABLE_ENTITY,
    'EMAIL_INVALID' satisfies ProblemCode,
    true,
  ),
  row(
    (e) => e instanceof InvalidCredentialsError,
    HttpStatus.UNAUTHORIZED,
    'INVALID_CREDENTIALS' satisfies ProblemCode,
    true,
  ),
  row(
    (e) =>
      e instanceof InvalidRefreshTokenCredentialError ||
      e instanceof RefreshRejectedError,
    HttpStatus.UNAUTHORIZED,
    'INVALID_REFRESH_TOKEN' satisfies ProblemCode,
    true,
  ),
  // Finding 3: the access token itself is missing/malformed/expired/
  // untrusted — distinct from a login or refresh rejection above.
  row(
    (e) => e instanceof UnauthorizedException,
    HttpStatus.UNAUTHORIZED,
    'INVALID_ACCESS_TOKEN' satisfies ProblemCode,
    false,
  ),
  // Finding 4: typed infrastructure/invariant errors, none a reachable
  // business condition FR24's closed set names — all "something internal
  // broke," so all fold into the same SERVICE_UNAVAILABLE row
  // DEFAULT_MAPPING already answers, but explicit rather than relying on
  // the catch-all (constitution: "Errors are typed and mapped at the
  // edge"). `exposeMessage: false` for every one — none of these messages
  // (an account id, an SSM parameter name) is safe to publish.
  row(
    (e) =>
      e instanceof RefreshTokenAccountNotFoundError ||
      e instanceof MissingAuthClaimsError ||
      e instanceof SigningKeyParameterMissingError ||
      e instanceof VerificationKeysParameterMissingError ||
      e instanceof VerificationKeysParameterNotJsonArrayError ||
      e instanceof VerificationKeysParameterNotStringArrayError,
    HttpStatus.SERVICE_UNAVAILABLE,
    'SERVICE_UNAVAILABLE' satisfies ProblemCode,
    false,
  ),
];
