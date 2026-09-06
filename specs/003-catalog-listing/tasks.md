# Tasks — Catalog listing

## Implementation Checklist

> Mirrors `plan.md`'s `Implementation Order`. The plan chose the **layer** axis and said why: one
> coupled context plus a cross-cutting refactor, with shared aggregation points touched by more
> than one step. Scopes below are declared honestly, so only Task 3 is genuinely disjoint.

- [x] Task 1: Relocate the OpenAPI path registry to `shared`, each context contributing its own paths, plus ADR-0005 (AC-13)
- [x] Task 2: Shared seams — `buildProductKey`, and the two new codes in `PROBLEM_CODES` (AC-12)
- [x] Task 3: Catalog domain — `Money`, `Product`, `CatalogPage`, cursor codec, port, errors (AC-19, AC-20) [scope: src/catalog/domain/**, test/unit/catalog/domain/**]
- [x] Task 4: DynamoDB adapter — one consistent query per page, mapper, no TTL attribute (AC-16, AC-17, AC-18)
- [x] Task 5: Use case — limit validation, cursor decoding, `nextCursor` from the store marker (AC-4, AC-7, AC-8, AC-9)
- [x] Task 6: Presentation and wiring — controller, query parsing, response shape, problem rows, path contributions, modules (AC-2, AC-3, AC-10, AC-11, AC-14, AC-15, AC-22)
- [x] Task 7: Seed script and end-to-end coverage, including cross-account isolation (AC-1, AC-5, AC-6, AC-21)

## Subtasks

### Task 1
- [ ] `src/shared/presentation/openapi-registry.ts`: the generic registry and its injection token, naming nothing feature-specific — the same contribution shape ADR-0004 established for problem rows.
- [ ] Each context exports its own path contributions; `auth/presentation/openapi/openapi-document.ts` shrinks to auth's own, and `/health` moves to whichever context owns it rather than staying in auth by accident.
- [ ] `AppModule` assembles the contributions. Forgetting a contributor is not a compile error, so the contract e2e is what catches it.
- [ ] Keep `test/e2e/contract/openapi.e2e-spec.ts` green at every step — it already asserts the document describes every route, which is the regression net for this refactor.
- [ ] ADR-0005 recording the relocation: the decision, the `auth`-imports-`catalog` alternative it rejects, and the cost that the composition root must now be edited per context.
- [ ] Tests: a context's paths reaching the document through the registry, and the document still describing every pre-existing route.

### Task 2
- [ ] `buildProductKey(accountId, productId)` in `shared/persistence/table-keys.ts`, returning `PK = CATALOG#<accountId>`, `SK = PRODUCT#<productId>`. Never `USER#`.
- [ ] `INVALID_CURSOR` and `INVALID_PAGE_LIMIT` appended to `PROBLEM_CODES`, which also feeds the published `code` enum.
- [ ] Tests: the key shape and its partition disjointness from the account partition; both codes present in the generated enum.

### Task 3
- [ ] `money.ts`: integer minor-unit amount plus an ISO-4217 code. A fractional or negative amount must not be constructible — reject at the boundary, do not round.
- [ ] `product.ts`: the entity, with `sku` and `name` as plain `string`. No value object for either — FR5b puts their validation in the write feature, so a wrapper here would guard no invariant and only add a type to unwrap.
- [ ] `catalog-cursor.ts`: encode, and decode with **positive** validation — assert the `PRODUCT#` prefix and a well-formed UUIDv7 before returning. `Buffer.from(s, 'base64url')` never throws, so "decoding succeeded" proves nothing.
- [ ] `catalog-page.ts` and `ports/product-repository.ts`: the port takes the account, the limit, and an optional decoded cursor, and returns items plus the store's own end marker — not a boolean.
- [ ] `errors.ts`: `InvalidCursorError`, `InvalidPageLimitError`.
- [ ] Tests: `Money` rejecting fractional and negative amounts; the cursor roundtrip; and rejection of a forged cursor, a truncated one, and one that **decodes cleanly but names something other than a product** — the last is the case a decode-failure check would wave through.

### Task 4
- [ ] `product.repository.ts`: one `QueryCommand` from `@aws-sdk/lib-dynamodb` (not `client-dynamodb` — the injected client is a `DynamoDBDocumentClient`), keyed on the caller's partition, with `ConsistentRead: true` and `Limit`.
- [ ] `ExclusiveStartKey` is rebuilt as `{ PK, SK }` where PK comes from the account and SK from the cursor — the cursor never contributes the partition.
- [ ] `nextCursor` derives from `LastEvaluatedKey`, never from the last returned item.
- [ ] `product.mapper.ts`: the only place stored attribute names appear, and it never emits `ttl` — the table expires items carrying it.
- [ ] The failure path emits `catalog_query_failed` with `accountId`, `durationMs`, `context`. No success log on a hot read path.
- [ ] Tests: `test/integration/catalog-listing.int-spec.ts` against local DynamoDB — a real multi-page walk, exactly one query per page counted at the call site, read-after-write visibility, ordering across **distinct** milliseconds, and a stored item read back carrying no `ttl`.

### Task 5
- [ ] `list-catalog.usecase.ts`: validate the limit, decode the cursor, call the port, assemble the page.
- [ ] The limit table is one rejection per input class: non-numeric, empty, zero, negative, fractional, above cap. Never clamp silently.
- [ ] A well-formed cursor naming a position absent from the caller's partition is honored, not rejected (FR10a) — no existence check, or the one-query-per-page property dies.
- [ ] Fake: `test/fakes/in-memory-product-repository.ts`, able to return a short page while still reporting a marker.
- [ ] Tests: the limit table; the default applied when absent; and **AC-4 proven here** — a page with fewer items than the limit that still carries a non-null cursor. This lives in the fake because a genuinely short page from DynamoDB needs a filter expression or ~1MB of items.

### Task 6
- [ ] `catalog.controller.ts`: `GET /products`, authenticated (not `@Public`), reading the account from `authClaims`.
- [ ] Query parsing at the trust boundary: input enters as `unknown`, leaves typed, and throws only this context's typed errors — anything else reaches the filter's default mapping and answers `503`.
- [ ] Repeated parameters (`?limit=5&limit=9`) arrive as arrays and are rejected rather than coerced.
- [ ] Response is exactly `{ items, nextCursor }` — no envelope, no second end-of-list signal.
- [ ] `catalog-problem-mappings.ts`: both codes at **`422`**, matching auth's status for invalid input, each row stating `exposeMessage` explicitly.
- [ ] `catalog-openapi-paths.ts` and `catalog.module.ts`; `AppModule` imports the module and assembles both the problem rows and the path contributions.
- [ ] Tests: key selection from claims; the response shape; both `422`s with their codes; that no malformed input yields `503`; and that the route needs no throttling decorator to be metered.

### Task 7
- [ ] `scripts/seed-catalog.ts`, composing its own id generator rather than importing `auth`'s infrastructure.
- [ ] e2e: walking a multi-page catalog to `nextCursor === null`, every product exactly once.
- [ ] e2e: resuming from a stored cursor after later writes, with the new products appearing after the resumed position rather than inside pages already served.
- [ ] e2e: cross-account isolation — account B listing with its own token, and with a cursor issued to A, never sees A's products. This is the feature's security proof.
- [ ] e2e: the `401`, and the published document describing the route and both codes.
- [ ] A check that `@aws-sdk` appears nowhere outside `**/infrastructure/`.

## Blockers

- **Local DynamoDB must be running** for Task 4's integration suite and every e2e —
  `docker compose up -d dynamodb`.
- **Task 1 blocks Tasks 6 and 7**: the catalog cannot publish a path until the registry it
  contributes to exists.
- No AWS credentials are required. `test/e2e/auth/support/build-test-app.ts` overrides both key
  providers with an in-memory RS256 pair, which is how the existing auth e2e suites already sign in.
- Nothing external blocks starting: 001 and 002 are merged, and the table needs no schema change.

## Notes

- **Only Task 3 is file-disjoint.** It touches `src/catalog/domain/**` and its tests alone, so it may
  run alongside Tasks 1 and 2. Every other task shares files with a sibling — Tasks 1, 2 and 6 all
  reach into `src/shared/presentation/` or `src/app.module.ts` — and their scopes are left broad on
  purpose so they serialize. Declaring a tighter scope to win parallelism would clobber.
- **AC-7a rides with AC-7.** The fidelity gate collapses letter-suffixed criteria onto the base
  number (the same way 002's AC-13a behaved), so the task covering AC-7 must also cover the
  foreign-cursor case or it silently goes unproven.
- **The riskiest task is Task 1, and it is first on purpose.** It rewrites shipped 001 code with an
  existing e2e as the only net.
- **TDD is required** (`CLAUDE.md`): failing test first, per behavior, asserting observable
  inputs/outputs/effects, never on a mock. The cursor tests and AC-4 exist specifically because an
  obvious version of them passes against a broken implementation.
- **Do not commit per task.** Accumulate and propose the commit at the end, after
  `review-and-simplify`.
- Functions 4–20 lines, files under 400, no `any`, and `@aws-sdk` only under `infrastructure/`.
