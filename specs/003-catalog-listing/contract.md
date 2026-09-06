# Catalog listing — Verification Contract

> One `AC-N` per section, in `spec.md` order, with a short label. The spec is authoritative for
> what each criterion says; this file says what proves it, how to run that proof, and what a human
> sees when it passes. `status:` is `evaluator`'s to fill.

## Environment

- **start**: `docker compose up -d dynamodb && npm run db:create-table` (from `CLAUDE.md`). Unit
  proofs need none of it.
- **env**: copy the repo's environment example to the local dotfile and source it manually — the
  project has no `dotenv` dependency, so nothing loads it for you. E2e and integration runs set
  their own values through `test/e2e/auth/support/set-test-environment.ts`, which must be the first
  import of any spec reaching `src/app.module.ts`.
- **fixtures**: e2e suites register the accounts they need through the public routes and seed
  products through the repository, since no write endpoint exists in this feature.
- **credentials**: `N/A`. No AWS account is involved:
  `test/e2e/auth/support/build-test-app.ts` overrides both key providers with an in-memory RS256
  pair, which is how the existing auth e2e suites already sign in.
- **teardown**: `docker compose down -v`.

> Path arguments to the test scripts match by **file-path substring**, not test name. Do not
> shorten them: checkouts commonly live under `/home/...`, so a short substring matches every file.

## AC-1 — full walk returns every product once

- **proof**: `test/e2e/catalog/page-walk.e2e-spec.ts`
- **command**: `npm run test:e2e -- catalog/page-walk`
- **observable**: a seeded catalog spanning several pages yields exactly N distinct products across
  the walk, with no repeat, and the walk terminates
- **status**: PASS (evaluator, 2026-09-06)

## AC-2 — under one page ends immediately

- **proof**: `test/e2e/catalog/page-walk.e2e-spec.ts`
- **command**: `npm run test:e2e -- catalog/page-walk`
- **observable**: every product returned in one response and `nextCursor` is `null`
- **status**: PASS (evaluator, 2026-09-06)

## AC-3 — empty catalog is 200, not an error

- **proof**: `test/e2e/catalog/page-walk.e2e-spec.ts`
- **command**: `npm run test:e2e -- catalog/page-walk`
- **observable**: `200` with an empty `items` array and `nextCursor` `null`
- **status**: PASS (evaluator, 2026-09-06)

## AC-4 — short page still carries a cursor

- **proof**: `test/unit/catalog/application/list-catalog.usecase.spec.ts`, driven by
  `test/fakes/in-memory-product-repository.ts` — proven against the fake because a genuinely short
  page from DynamoDB needs a filter expression or roughly 1MB of items, and a proof that cannot be
  built reliably is not a proof
- **command**: `npm run test:unit -- catalog/application/list-catalog`
- **observable**: fewer items than the requested limit, and `nextCursor` is not `null`
- **status**: PASS (evaluator, 2026-09-06)

## AC-5 — resuming from a stored cursor

- **proof**: `test/e2e/catalog/cursor-resume.e2e-spec.ts`
- **command**: `npm run test:e2e -- catalog/cursor-resume`
- **observable**: products written after the cursor was issued appear after the resumed position,
  never inside pages already served
- **status**: PASS (evaluator, 2026-09-06)

## AC-6 — cross-account isolation

- **proof**: `test/e2e/catalog/account-isolation.e2e-spec.ts`
- **command**: `npm run test:e2e -- catalog/account-isolation`
- **observable**: account B's walk contains no product of account A, under B's own cursor and under
  a cursor issued to A
- **status**: PASS (evaluator, 2026-09-06)

## AC-7 — wrong-shaped cursor is refused, foreign cursor is honored

> Covers AC-7a as well: the fidelity gate collapses the letter suffix onto this number, so the
> foreign-cursor case is proven here or not at all.

- **proof**: `test/unit/catalog/domain/catalog-cursor.spec.ts` for the refusal — including a cursor
  that decodes cleanly but names something other than a product, which a decode-failure check would
  wave through; `test/e2e/catalog/account-isolation.e2e-spec.ts` for the foreign cursor being
  honored against the caller's own partition
- **command**: `npm run test:unit -- catalog/domain/catalog-cursor` then
  `npm run test:e2e -- catalog/account-isolation`
- **observable**: `422` with code `INVALID_CURSOR` and no store query issued; and, for a well-formed
  foreign cursor, `200` carrying only the caller's own products
- **status**: PASS (evaluator, 2026-09-06)

## AC-8 — every invalid limit class is refused

- **proof**: `test/unit/catalog/application/list-catalog.usecase.spec.ts`
- **command**: `npm run test:unit -- catalog/application/list-catalog`
- **observable**: one refusal per input class — non-numeric, empty, zero, negative, fractional,
  above cap — each `422` with code `INVALID_PAGE_LIMIT`, and never a silently clamped page
- **status**: PASS (evaluator, 2026-09-06)

## AC-9 — default page size

- **proof**: `test/unit/catalog/application/list-catalog.usecase.spec.ts`
- **command**: `npm run test:unit -- catalog/application/list-catalog`
- **observable**: with no `limit` supplied, at most the default page size is returned
- **status**: PASS (evaluator, 2026-09-06)

## AC-10 — malformed input never yields 503

- **proof**: `test/e2e/catalog/invalid-input.e2e-spec.ts`
- **command**: `npm run test:e2e -- catalog/invalid-input`
- **observable**: every malformed `limit` and `cursor` answers `422`; no response is `503`, which is
  what the filter's default mapping would produce if an untyped error escaped the parser
- **status**: PASS (evaluator, 2026-09-06)

## AC-11 — repeated query parameter is refused

- **proof**: `test/e2e/catalog/invalid-input.e2e-spec.ts` — proves the Express transport, which is
  the one that surfaces the repetition today; the Lambda transport needs multi-value headers on the
  ALB target group, which belongs to the infrastructure feature
- **command**: `npm run test:e2e -- catalog/invalid-input`
- **observable**: `?limit=5&limit=9` is refused rather than resolved to either value
- **status**: PASS (evaluator, 2026-09-06)

## AC-12 — published document carries the route and both codes

- **proof**: `test/e2e/contract/openapi.e2e-spec.ts`
- **command**: `npm run test:e2e -- contract/openapi`
- **observable**: the document describes `GET /products` with its success and error responses, and
  its `code` enum contains `INVALID_CURSOR` and `INVALID_PAGE_LIMIT`
- **status**: PASS (evaluator, 2026-09-06)

## AC-13 — no context registers a peer's paths

- **proof**: `test/unit/shared/presentation/openapi-registry.spec.ts` — both halves live here, so
  both have a command: contributions reaching the document through the registry, and an assertion
  over `src/auth/**` that it imports no peer context's module to register a path
- **command**: `npm run test:unit -- shared/presentation/openapi-registry`
- **observable**: each context's paths appear in the document having been contributed from its own
  module, and the import assertion over `auth` passes
- **status**: PASS (evaluator, 2026-09-06)

## AC-14 — unauthenticated request reads nothing

- **proof**: `test/e2e/catalog/invalid-input.e2e-spec.ts`
- **command**: `npm run test:e2e -- catalog/invalid-input`
- **observable**: `401` with no token, and no catalog query issued
- **status**: PASS (evaluator, 2026-09-06)

## AC-15 — over quota answers 429 with no new code

- **proof**: `test/e2e/catalog/throttled.e2e-spec.ts`, which must lower the limit through
  `buildTestApp({ configOverrides: { throttleAuthenticatedLimit: 2 } })` the way
  `test/e2e/throttling/account-scope.e2e-spec.ts` already does. Do **not** try to exhaust the
  ambient limit: `test/e2e/auth/support/set-test-environment.ts` sets
  `THROTTLE_AUTHENTICATED_LIMIT` to 1000 so other suites are not throttled, and a test that sends a
  thousand requests is not a test
- **command**: `npm run test:e2e -- catalog/throttled`
- **observable**: past the lowered limit the route answers `429` with its retry hint, and the
  catalog module contains no throttling decorator or registration
- **status**: PASS (evaluator, 2026-09-06)

## AC-16 — read-after-write visibility

- **proof**: `test/integration/catalog-listing.int-spec.ts`
- **command**: `npm run test:integration -- catalog-listing`
- **observable**: a product written immediately before the query appears in its result
- **status**: PASS (evaluator, 2026-09-06)

## AC-17 — stored product has no TTL attribute

- **proof**: `test/integration/catalog-listing.int-spec.ts` — asserted by reading the attribute
  back, not by waiting for a deletion DynamoDB performs on its own schedule
- **command**: `npm run test:integration -- catalog-listing`
- **observable**: the stored item carries no `ttl` attribute
- **status**: PASS (evaluator, 2026-09-06)

## AC-18 — one store query per page

- **proof**: `test/integration/catalog-listing.int-spec.ts`, counting commands at the adapter's call
  site
- **command**: `npm run test:integration -- catalog-listing`
- **observable**: exactly one query issued per page served, including the page that returns a cursor
- **status**: PASS (evaluator, 2026-09-06)

## AC-19 — same-millisecond products both appear

- **proof**: `test/integration/catalog-listing.int-spec.ts`
- **command**: `npm run test:integration -- catalog-listing`
- **observable**: two products written in the same millisecond both appear exactly once and the walk
  terminates; their relative order is not asserted, because the id generator does not guarantee one
- **status**: PASS (evaluator, 2026-09-06)

## AC-20 — price rejects fractional and negative amounts

- **proof**: `test/unit/catalog/domain/money.spec.ts`
- **command**: `npm run test:unit -- catalog/domain/money`
- **observable**: a fractional or negative amount is not constructible, and the serialized form
  carries an integer minor-unit amount with an ISO-4217 code
- **status**: PASS (evaluator, 2026-09-06)

## AC-21 — persistence details stay in the adapter

- **proof**: `test/e2e/catalog/account-isolation.e2e-spec.ts` for the response carrying no stored
  attribute name; the import direction is proven by the `pack:dependency-rule` gate, **not** by
  `npm run lint` — `eslint.config.mjs` carries no rule about `@aws-sdk`, so lint would pass on a
  violation
- **command**: `npm run test:e2e -- catalog/account-isolation` then
  `.specify/gates/run-gates.sh`
- **observable**: no `PK`, `SK`, or snake_case attribute in the response, and the gate reporting no
  dependency-rule violations
- **status**: PASS (evaluator, 2026-09-06)

## AC-22 — response shape

- **proof**: `test/e2e/catalog/page-walk.e2e-spec.ts`
- **command**: `npm run test:e2e -- catalog/page-walk`
- **observable**: the body carries exactly `items` and `nextCursor`; each product carries `id`,
  `name`, `sku`, `price` and `createdAt`; `price` carries an integer `amount` with a `currency`;
  and `createdAt` parses as an ISO-8601 UTC instant
- **status**: PASS (evaluator, 2026-09-06)

## Full-Suite Check

- **command**: `.specify/gates/run-gates.sh`
- **status**: PASS (evaluator, 2026-09-06)
