/**
 * The only place in this feature a status code is chosen (FR24, AC-27): a
 * closed, exhaustive table maps each thrown/encountered type to its HTTP
 * status and problem-detail `code`. `@Catch()` with no type argument is
 * deliberate — it must catch the typed domain/application/presentation
 * errors, Nest's own `UnauthorizedException` (thrown by the guard), AND
 * anything unrecognized, which is the `SERVICE_UNAVAILABLE` default FR24
 * describes.
 *
 * Nest's own `NotFoundException` for a route the router never matched
 * (Finding 1, error-taxonomy fix) is deliberately excluded from the closed
 * `ProblemCode` mapping entirely and handled first, in `catch()` itself: a
 * client asking for an undeclared URL is a different failure class than any
 * of this API's own business rejections FR24's set names, and answering it
 * with `SERVICE_UNAVAILABLE` (503) would make every typo, stale bookmark, or
 * wrong-method call indistinguishable from a real backend outage to a load
 * balancer or uptime monitor. `routes-resolver.js` (`@nestjs/core`) is the
 * only place Nest itself throws `NotFoundException`, so this check precisely
 * identifies "no route matched" and nothing this app throws deliberately —
 * verified by reading Nest's own source, not assumed.
 *
 * `detail` is safe by construction (Finding 2, error-taxonomy fix): each
 * `ProblemMapping` row declares `exposeMessage` explicitly, defaulting to
 * `false` via `DEFAULT_MAPPING` and every newly typed infrastructure error
 * below — so any future untyped exception, or any typed error nobody has
 * reviewed for safety, never echoes its raw `.message` into a public
 * response. Only the five domain/presentation errors already reviewed as
 * safe (each just echoes back what the caller itself submitted, or a fixed,
 * non-identifying string — see each type's own file) opt in.
 *
 * `UnauthorizedException` -> `INVALID_ACCESS_TOKEN` (Finding 3): a 7th
 * closed-set code, distinct from `INVALID_CREDENTIALS` (wrong password or
 * unknown address at `/auth/login`) and `INVALID_REFRESH_TOKEN` (bad refresh
 * credential at `/auth/refresh`), so a client can tell "the access token
 * itself is missing/malformed/expired/untrusted" apart from a login
 * rejection instead of re-prompting for credentials when it should instead
 * silently call `/auth/refresh`. `RefreshRejectedError` -> `INVALID_REFRESH_TOKEN`
 * (the presentation-layer type `auth.controller.ts` throws for every
 * non-`'rotated'` `RotationOutcome`) is the other controller-level decision.
 *
 * `status` in the body always mirrors the actual HTTP status line (AC-27) —
 * both come from the same `ProblemMapping` value, so they cannot drift.
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';

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
import { MissingAuthClaimsError } from './missing-auth-claims.error';
import { RefreshRejectedError } from './refresh-rejected.error';

// The closed set (FR24, AC-26) as a runtime array rather than only a type:
// src/auth/presentation/openapi/problem-schema.ts builds the generated
// document's `code` enum from this exact array, so the published contract
// and what this filter actually emits can never drift apart.
export const PROBLEM_CODES = [
  'EMAIL_ALREADY_REGISTERED',
  'PASSWORD_LENGTH_INVALID',
  'EMAIL_INVALID',
  'INVALID_CREDENTIALS',
  'INVALID_REFRESH_TOKEN',
  'INVALID_ACCESS_TOKEN',
  'SERVICE_UNAVAILABLE',
] as const;

export type ProblemCode = (typeof PROBLEM_CODES)[number];

interface ProblemMapping {
  readonly status: number;
  readonly code: ProblemCode;
  readonly title: string;
  // Whitelist, not blacklist (constitution's authorization-check rule
  // applies here too): a row must opt IN to exposing `exception.message`,
  // so a new row that forgets to set this is safe by default.
  readonly exposeMessage: boolean;
}

interface ProblemRow {
  readonly matches: (exception: unknown) => boolean;
  readonly status: number;
  readonly code: ProblemCode;
  readonly exposeMessage: boolean;
}

function row(
  matches: (exception: unknown) => boolean,
  status: number,
  code: ProblemCode,
  exposeMessage: boolean,
): ProblemRow {
  return { matches, status, code, exposeMessage };
}

// The closed table (FR24) as data, not an if-chain: `mapException` becomes a
// single lookup, and each row is exactly one line to read or add.
const PROBLEM_ROWS: readonly ProblemRow[] = [
  row(
    (e) => e instanceof EmailAlreadyRegisteredError,
    HttpStatus.CONFLICT,
    'EMAIL_ALREADY_REGISTERED',
    true,
  ),
  row(
    (e) => e instanceof InvalidPasswordLengthError,
    HttpStatus.UNPROCESSABLE_ENTITY,
    'PASSWORD_LENGTH_INVALID',
    true,
  ),
  row(
    (e) => e instanceof InvalidEmailAddressError,
    HttpStatus.UNPROCESSABLE_ENTITY,
    'EMAIL_INVALID',
    true,
  ),
  row(
    (e) => e instanceof InvalidCredentialsError,
    HttpStatus.UNAUTHORIZED,
    'INVALID_CREDENTIALS',
    true,
  ),
  row(
    (e) =>
      e instanceof InvalidRefreshTokenCredentialError ||
      e instanceof RefreshRejectedError,
    HttpStatus.UNAUTHORIZED,
    'INVALID_REFRESH_TOKEN',
    true,
  ),
  // Finding 3: the access token itself is missing/malformed/expired/
  // untrusted — distinct from a login or refresh rejection above.
  row(
    (e) => e instanceof UnauthorizedException,
    HttpStatus.UNAUTHORIZED,
    'INVALID_ACCESS_TOKEN',
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
    'SERVICE_UNAVAILABLE',
    false,
  ),
];

interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly code: ProblemCode;
}

const DEFAULT_MAPPING: ProblemMapping = {
  status: HttpStatus.SERVICE_UNAVAILABLE,
  code: 'SERVICE_UNAVAILABLE',
  title: 'service unavailable',
  exposeMessage: false,
};

@Catch()
export class AuthExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const response = httpContext.getResponse<Response>();
    const request = httpContext.getRequest<Request>();

    // Finding 1: a routing-level "no such route" answers a genuine 404,
    // entirely outside the closed ProblemCode contract — see this file's
    // module doc for why.
    if (exception instanceof NotFoundException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    const mapping = this.mapException(exception);
    response
      .status(mapping.status)
      .type('application/problem+json')
      .json(this.toProblemDetails(mapping, exception, request));
  }

  // The closed table (FR24) is PROBLEM_ROWS itself now — this is just the
  // lookup, each row owning exactly one match condition.
  private mapException(exception: unknown): ProblemMapping {
    const matched = PROBLEM_ROWS.find((candidate) =>
      candidate.matches(exception),
    );
    return matched === undefined ? DEFAULT_MAPPING : this.toMapping(matched);
  }

  private toMapping(matched: ProblemRow): ProblemMapping {
    return {
      status: matched.status,
      code: matched.code,
      title: matched.code.toLowerCase().replace(/_/g, ' '),
      exposeMessage: matched.exposeMessage,
    };
  }

  private toProblemDetails(
    mapping: ProblemMapping,
    exception: unknown,
    request: Request,
  ): ProblemDetails {
    return {
      type: 'about:blank',
      title: mapping.title,
      status: mapping.status,
      detail: this.detailFor(mapping, exception),
      instance: request.originalUrl,
      code: mapping.code,
    };
  }

  // Finding 2: `detail` never echoes a raw exception message unless the
  // row explicitly opted in — see `ProblemMapping.exposeMessage`'s own doc.
  private detailFor(mapping: ProblemMapping, exception: unknown): string {
    if (mapping.exposeMessage && exception instanceof Error) {
      return exception.message;
    }
    return mapping.title;
  }
}
