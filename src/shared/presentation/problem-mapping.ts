/**
 * Generic RFC 9457 problem-mapping machinery (FR24), shared by every bounded
 * context that can throw a mapped exception. Nothing here names a
 * feature-specific type: `shared` must depend on nothing feature-specific
 * (see problem-details.filter.ts's own module doc), so the closed `code` set
 * and the `matches`/`status`/`exposeMessage` rows that populate it are
 * contributed by each context's own module (e.g. `AuthModule`) rather than
 * declared here.
 */

export interface ProblemMapping {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  // Whitelist, not blacklist (constitution's authorization-check rule
  // applies here too): a row must opt IN to exposing `exception.message`,
  // so a new row that forgets to set this is safe by default.
  readonly exposeMessage: boolean;
  readonly headers?: (exception: unknown) => Readonly<Record<string, string>>;
}

export interface ProblemRow {
  readonly matches: (exception: unknown) => boolean;
  readonly status: number;
  readonly code: string;
  readonly exposeMessage: boolean;
  readonly headers?: (exception: unknown) => Readonly<Record<string, string>>;
}

// Each bounded context contributes its own `ProblemRow[]` under this token
// (same Symbol-token pattern as DYNAMO_DOCUMENT_CLIENT and auth.module.ts's
// own tokens) — ProblemDetailsFilter injects `readonly (readonly
// ProblemRow[])[]` and flattens it once.
//
// VERIFIED AGAINST @nestjs/core 11.2.3 SOURCE (source-driven-development):
// unlike Angular, Nest has no generic "multi provider" merging for custom
// tokens — `Provider` (provider.interface.d.ts) declares no `multi` field,
// and injector/module.js's `addProvider` stores providers in a `Map` keyed
// by token (`this._providers.set(...)`), so two providers registered under
// the same token simply overwrite each other; only the four framework
// constants `APP_FILTER`/`APP_GUARD`/`APP_INTERCEPTOR`/`APP_PIPE` get
// special-cased cross-module collection (scanner.js). So today, with only
// `auth` contributing, `AuthModule` provides this token directly as
// `useValue: [authProblemMappings]` — a plain array-of-one. Wiring a SECOND
// contributor (e.g. throttling) will need that `useValue` array assembled
// explicitly (e.g. at the composition root) rather than each module
// registering independently — see auth.module.ts's own comment on this
// provider for the concrete integration note.
export const PROBLEM_MAPPINGS = Symbol('PROBLEM_MAPPINGS');

// The closed table (FR24) is built as data, not an if-chain, so each row is
// exactly one line to read or add — generic over `code: string` here; the
// closed-set narrowing to a specific union happens in each module's own
// rows file (e.g. auth-problem-mappings.ts), not here.
export function row(
  matches: (exception: unknown) => boolean,
  status: number,
  code: string,
  exposeMessage: boolean,
  headers?: (exception: unknown) => Readonly<Record<string, string>>,
): ProblemRow {
  return { matches, status, code, exposeMessage, headers };
}
