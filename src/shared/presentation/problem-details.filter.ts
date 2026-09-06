/**
 * The only place in this feature a status code is chosen (FR24, AC-27): a
 * closed, exhaustive table maps each thrown/encountered type to its HTTP
 * status and problem-detail `code`. `@Catch()` with no type argument is
 * deliberate — it must catch every typed domain/application/presentation
 * error any contributing bounded context defines, Nest's own
 * `UnauthorizedException` (thrown by a guard), AND anything unrecognized,
 * which is the `SERVICE_UNAVAILABLE` default FR24 describes.
 *
 * This filter lives in `shared` (Task 2, 002-request-throttling) because a
 * second bounded context (`throttling`) needs to emit its own code
 * (`RATE_LIMIT_EXCEEDED`) through the same RFC 9457 pipeline and the same
 * closed `code` enum `auth` already built — but `shared` must depend on
 * nothing feature-specific. So the actual `matches`/`status`/`exposeMessage`
 * rows are contributed by each context's own module (`auth-problem-mappings.ts`
 * for `auth`, and so on) rather than declared here, and injected through the
 * `PROBLEM_MAPPINGS` token as an array-of-arrays, flattened once — see
 * problem-mapping.ts's own doc for how today's single contributor (`auth`)
 * assembles that array, and the note on wiring a second one.
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
 * `false` via `DEFAULT_MAPPING` — so any future untyped exception, or any
 * typed error nobody has reviewed for safety, never echoes its raw
 * `.message` into a public response. Only rows a context has explicitly
 * reviewed as safe opt in.
 *
 * `status` in the body always mirrors the actual HTTP status line (AC-27) —
 * both come from the same `ProblemMapping` value, so they cannot drift.
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  PROBLEM_MAPPINGS,
  ProblemMapping,
  ProblemRow,
} from './problem-mapping';

// The closed set (FR24, AC-26) as a runtime array rather than only a type:
// src/auth/presentation/openapi/problem-schema.ts builds the generated
// document's `code` enum from this exact array, so the published contract
// and what this filter actually emits can never drift apart. `shared` names
// the full closed set (rather than each context unioning its own) because
// the published OpenAPI `code` enum needs exactly ONE array to generate
// from — the per-context `matches`/`status`/`exposeMessage` logic behind
// each code is still contributed separately, via PROBLEM_MAPPINGS below.
export const PROBLEM_CODES = [
  'EMAIL_ALREADY_REGISTERED',
  'PASSWORD_LENGTH_INVALID',
  'EMAIL_INVALID',
  'INVALID_CREDENTIALS',
  'INVALID_REFRESH_TOKEN',
  'INVALID_ACCESS_TOKEN',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMIT_EXCEEDED',
  'INVALID_CURSOR',
  'INVALID_PAGE_LIMIT',
] as const;

export type ProblemCode = (typeof PROBLEM_CODES)[number];

interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly code: ProblemCode;
}

// SERVICE_UNAVAILABLE is the one row that belongs to `shared` itself rather
// than any single context: every context needs an "unrecognized error"
// fallback, and this is it.
const DEFAULT_MAPPING: ProblemMapping = {
  status: HttpStatus.SERVICE_UNAVAILABLE,
  code: 'SERVICE_UNAVAILABLE',
  title: 'service unavailable',
  exposeMessage: false,
};

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  // Flattened once at construction, not per request: PROBLEM_MAPPINGS
  // resolves to an array-of-arrays (one per contributing module — see that
  // token's own doc for how contributors are assembled today), and the
  // lookup itself doesn't care which module a row came from.
  private readonly rows: readonly ProblemRow[];

  constructor(
    @Inject(PROBLEM_MAPPINGS)
    contributedRows: readonly (readonly ProblemRow[])[],
  ) {
    this.rows = contributedRows.flat();
  }

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
    this.applyHeaders(response, mapping, exception);
    response
      .status(mapping.status)
      .type('application/problem+json')
      .json(this.toProblemDetails(mapping, exception, request));
  }

  // The closed table (FR24) is the flattened contributed rows themselves —
  // this is just the lookup, each row owning exactly one match condition.
  private mapException(exception: unknown): ProblemMapping {
    const matched = this.rows.find((candidate) => candidate.matches(exception));
    return matched === undefined ? DEFAULT_MAPPING : this.toMapping(matched);
  }

  private toMapping(matched: ProblemRow): ProblemMapping {
    return {
      status: matched.status,
      code: matched.code,
      title: matched.code.toLowerCase().replace(/_/g, ' '),
      exposeMessage: matched.exposeMessage,
      headers: matched.headers,
    };
  }

  private applyHeaders(
    response: Response,
    mapping: ProblemMapping,
    exception: unknown,
  ): void {
    const headers = mapping.headers?.(exception) ?? {};
    for (const [name, value] of Object.entries(headers)) {
      response.setHeader(name, value);
    }
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
      // mapping.code is a contributed row's plain string (ProblemMapping is
      // generic, see problem-mapping.ts); every context is expected to draw
      // its codes from PROBLEM_CODES above, so this narrows the boundary
      // where `shared`'s closed set meets each context's open contribution.
      code: mapping.code as ProblemCode,
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
