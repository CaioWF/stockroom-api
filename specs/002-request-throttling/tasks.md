# Tasks — Request throttling

## Implementation Checklist

> Mirrors `plan.md`'s `Implementation Order`. The plan chose the **layer** axis with a two-way
> parallel opener; scopes below are declared honestly, so Tasks 1 and 2 fan out and the rest
> serialize. See `Notes` for the one place the plan may have layered work that is actually
> file-disjoint.

- [x] Task 1: Throttling domain — window, policy, decision union, scope types, store port, degraded error (AC-4, AC-5, AC-7, AC-8) [scope: src/throttling/domain/**, test/unit/throttling/domain/**]
- [x] Task 2: Relocate the problem taxonomy behind a contribution registry, add `RATE_LIMIT_EXCEEDED` (AC-3, AC-23) [scope: src/shared/presentation/**, src/auth/presentation/**, src/auth/auth.module.ts, test/unit/auth/presentation/**, test/e2e/contract/**]
- [x] Task 3: Shared seams — throttle key builder, configuration variables, logger allow-list fields (AC-24, AC-26, AC-27) [scope: src/shared/persistence/table-keys.ts, src/shared/config/**, src/shared/observability/**, test/unit/shared/**]
- [x] Task 4: DynamoDB adapter — own client, conditional increment, rollover branch, promote, attempt loop (AC-6, AC-8, AC-10, AC-11, AC-25) [scope: src/throttling/infrastructure/dynamo/**, test/unit/throttling/infrastructure/dynamo/**, test/integration/throttle-counter-repository.int-spec.ts]
- [x] Task 5: Instance-local fallback limiter — lazy expiry, entry cap, admit-when-full (AC-19) [scope: src/throttling/infrastructure/local/**, test/unit/throttling/infrastructure/local/**]
- [x] Task 6: Use case — one deadline, `AbortSignal`, degraded classification, the two events (AC-9, AC-17, AC-18, AC-21) [scope: src/throttling/application/**, test/unit/throttling/application/**, test/integration/throttle-admission.int-spec.ts, test/fakes/in-memory-rate-limit-store.ts, test/fakes/failing-rate-limit-store.ts]
- [x] Task 7: Presentation — address policy, decorators, guard, interceptor, typed rejection, fail-open boundary (AC-1, AC-2, AC-12, AC-13, AC-13a, AC-14, AC-20, AC-22) [scope: src/throttling/presentation/**, test/unit/throttling/presentation/**]
- [x] Task 8: Wiring and published contract — module, registration, group and exemption decorators, 429 in the document, account-scoped e2e (AC-12, AC-15, AC-16)
- [x] Task 9: Environment example and gotchas

## Subtasks

### Task 1
- [ ] `rate-limit-window.ts`: window start from a `Clock` reading and a length, elapsed fraction, and the count of whole windows between two starts (the value FR15's branch keys off).
- [ ] `throttle-scope.ts`: `ThrottleScope = 'ip' | 'account'` and the route-group union, string-literal unions per the TypeScript lens.
- [ ] `rate-limit-policy.ts`: the resolved limit, window length and saturation ceiling for one (scope, route group).
- [ ] `throttle-decision.ts`: `{ kind: 'admitted' } | { kind: 'refused'; retryAfterSeconds: number }` — a refusal cannot be constructed without its retry hint.
- [ ] `throttle-policy.ts`: the saturated weighted estimate; refuse when the post-increment estimate **exceeds** the limit (FR7 — "exceeds", not "reaches").
- [ ] `throttle-policy.ts`: the `Retry-After` inversion, solved against the **saturation ceiling** and for admission **after** the retry's own increment, spanning the window boundary when the current count alone already meets the limit. Clamp to [1s, 3 windows].
- [ ] `ports/rate-limit-store.ts` and `rate-limit-store-degraded.error.ts`.
- [ ] Tests: weighting and saturation; every elapsed-window case; the boundary case; the idle-caller case; the inversion asserted by *simulating the retry against a counter grown to the ceiling*, never by asserting the returned number.

### Task 2
- [ ] Create `src/shared/presentation/problem-mapping.ts`: the `ProblemMapping` row type and the `PROBLEM_MAPPINGS` multi-provider token.
- [ ] Move the filter and `PROBLEM_CODES` to `src/shared/presentation/problem-details.filter.ts`; rename `AuthExceptionFilter` to `ProblemDetailsFilter`. It must import from neither `auth` nor `throttling`.
- [ ] Extract auth's rows into `src/auth/presentation/auth-problem-mappings.ts`, contributed by `AuthModule`.
- [ ] Add `RATE_LIMIT_EXCEEDED` to `PROBLEM_CODES`; keep the OpenAPI `code` enum generated from that same array.
- [ ] Follow the import in `openapi/problem-schema.ts` and the `APP_FILTER` provider in `auth.module.ts`.
- [ ] Preserve the two behaviours the existing filter documents: the `NotFoundException` passthrough handled before the closed table, and `exposeMessage` defaulting to `false`.
- [ ] Tests: the existing filter and contract e2e specs still pass unchanged in behaviour; a row contributed from a second module is picked up.

### Task 3
- [ ] `table-keys.ts`: `buildThrottleCounterKey(scope, identity, routeGroup)` → `PK = "THROTTLE#<scope>#<identity>"`, `SK = "<routeGroup>"`. Never the `USER#` partition.
- [ ] `environment.schema.ts`: the ten throttle variables, **every one** with a default through `positiveIntegerWithDefault`, mapped to camelCase on `AppConfig`.
- [ ] `structured-logger.ts`: add `scope`, `routeGroup`, `retryAfterSeconds` to `ALLOWED_LOG_FIELDS` — the allow-list drops unlisted fields silently, so this is not optional.
- [ ] Tests: key shape; the schema starting with none of the variables set; the logger emitting the new fields and still redacting an unlisted one.

### Task 4
- [ ] `throttle-dynamo-client.provider.ts`: its own `DynamoDBDocumentClient` from the same `AppConfig`, with `maxAttempts: 1` and explicit connection/request timeouts. Do **not** touch the shared singleton.
- [ ] `throttle-counter.mapper.ts`: item ↔ domain, plus unmarshalling the raw `AttributeValue` item that a failed conditional attaches to the exception — the document client does not unmarshall that field.
- [ ] `throttle-counter.repository.ts`: the conditional increment carrying both clauses (window match **and** under ceiling), `ReturnValues: ALL_NEW`, `ReturnValuesOnConditionCheckFailure: ALL_OLD`.
- [ ] The `ALL_OLD` branch: over-ceiling → refuse; one window elapsed → promote; two or more → previous zero; at-or-ahead within one window → adopt; ahead by more than one window → reset the item.
- [ ] The promote as a single self-referencing statement, conditioned on the stored window start so it is single-shot.
- [ ] The bounded attempt loop, re-reading `ALL_OLD` on every conditional failure; exhaustion is a degraded outcome, never a silent admission.
- [ ] The two-class error taxonomy: protocol vs degraded, with an unrecognized class treated as degraded and logged by name.
- [ ] `ttl` written two windows past the window start.
- [ ] Tests: unit for the branch selection and classification; integration for rollover, the promote race across independent clients, straddling clocks, the far-future window, the TTL value, and the store-call count (instrument the call site — a failed conditional carries no `ConsumedCapacity`).

### Task 5
- [ ] `instance-local-limiter.ts`: per-identity counters with lazy expiry evaluated on read, never a timer.
- [ ] Entry cap from configuration; when full, **admit** rather than refuse.
- [ ] The ceiling derived from the route's own limit times `THROTTLE_LOCAL_FALLBACK_FACTOR`.
- [ ] Tests: expiry on read; the cap admitting an unseen identity; the derived ceiling.

### Task 6
- [ ] `decide-request-admission.usecase.ts`: build the window from the `Clock`, call the store, apply the policy, return the decision.
- [ ] One deadline for all store work, driving an `AbortSignal` on the command; every promise the deadline outruns gets a terminal handler attached.
- [ ] Catch the degraded error: consult the fallback limiter, emit `throttle_degraded`, admit.
- [ ] Emit `throttle_refused` on a refusal, with scope and route group and nothing identifying.
- [ ] Fakes: `in-memory-rate-limit-store.ts` and `failing-rate-limit-store.ts` (throws, and a variant that delays past the budget).
- [ ] Tests: the deadline as a **total** — the stub delays just under budget on each of the three calls a rollover makes, and the whole request must still finish inside the budget with no unhandled rejection; degraded admits; backpressure does not produce a 429.
- [ ] `test/integration/throttle-admission.int-spec.ts`: the use case against local DynamoDB with independent store clients, independent `Clock` readings and independent fallback limiters — the only level where "the limit held **and** the fallback never engaged" is observable, since the fallback and the degraded event do not exist inside the repository.

### Task 7
- [ ] `client-address.policy.ts`: right-most `X-Forwarded-For` entry; IPv6 folded to /64; no header → one shared identity. Never `req.ip`, never `trust proxy`.
- [ ] `no-throttle.decorator.ts` with its own metadata key, and `throttle-group.decorator.ts` with a default group for unmarked routes.
- [ ] `throttle.guard.ts` (IP-keyed) and `account-throttle.interceptor.ts` (account-keyed, rejecting before `next.handle()`).
- [ ] `rate-limit-exceeded.error.ts` carrying `retryAfterSeconds`, plus the throttling problem-mapping row that renders 429 with the `Retry-After` header.
- [ ] The fail-open boundary at both entry points: any unclassified throw is logged and the request admitted.
- [ ] A protected route reaching the interceptor without auth claims is logged as a wiring defect and admitted.
- [ ] Tests: address derivation against a forged multi-entry header and against no header; /64 folding; key selection per route kind; decorator metadata; the fail-open boundary driven by a limiter that throws a plain `TypeError`; no rate-limit headers on a success.

### Task 8
- [ ] `throttling.module.ts`: providers, the `PROBLEM_MAPPINGS` row, `APP_GUARD` for the guard and `APP_INTERCEPTOR` for the interceptor.
- [ ] Import `ThrottlingModule` in `app.module.ts`.
- [ ] `@ThrottleGroup` on the auth routes; `@NoThrottle()` on `/health` and the OpenAPI document route.
- [ ] `throttle-exemption-allowlist.spec.ts`, mirroring the existing `public-route-allowlist.spec.ts`, so a route cannot become exempt silently.
- [ ] The 429 responses in the generated OpenAPI document.
- [ ] e2e: `/health` under a flood; `/auth/refresh` admitted while `/auth/login` is throttled.
- [ ] e2e for the account-scoped bucket: register, log in, and drive a protected route with the returned Bearer token past its limit — available because `build-test-app.ts` supplies in-memory key material, so no real SSM is involved.
- [ ] e2e for AC-13a: the same headers through the Lambda transport (`test/fixtures/alb-event.fixture.ts`) and through the HTTP transport must key the same identity.

### Task 9
- [ ] The ten variables in the environment example file, grouped and commented like the existing entries.
- [ ] `docs/gotchas.md`: the shadowed `req.ip` under `serverless-express`, and the un-unmarshalled item on a failed conditional. Both cost a review cycle to find.

## Blockers

- **Local DynamoDB must be running** for Task 4's integration suite and every e2e — `docker compose up -d dynamodb`.
- **No SSM blocker, contrary to an earlier reading.** `CLAUDE.md`'s note that `/auth/login` and `/.well-known/jwks.json` need real AWS SSM describes running the app by hand. The e2e suite does not: `test/e2e/auth/support/build-test-app.ts` overrides both key providers with an in-memory RS256 pair, and `login.e2e-spec.ts:42` and `me.e2e-spec.ts:58` already assert a successful login and an authenticated call on that basis. The account-scoped bucket is therefore coverable end to end, and Task 8 does so.
- Nothing external blocks starting: `specs/001-authentication` is merged, and no infrastructure work is required (`scripts/create-table.ts` already provisions the key schema and the `ttl` attribute).

## Notes

- **Task 6 defect to fix when that task is picked up.** `decide-request-admission.usecase.ts`
  already exists in the tree from earlier unfinished work (Task 6 was never ticked). Its degraded
  path passes `request.policy.saturationCeiling` to the fallback limiter
  (`decide-request-admission.usecase.ts:159`) instead of a ceiling derived from
  `THROTTLE_LOCAL_FALLBACK_FACTOR` via the new `deriveFallbackCeiling` (Task 5,
  `instance-local-limiter.ts`) — violates FR20a, since `saturationCeiling` uses the unrelated
  `THROTTLE_COUNTER_SATURATION_FACTOR` (default 2 vs. the fallback factor's default 1). Fix by
  computing the fallback ceiling with `deriveFallbackCeiling(request.policy.limit,
  config.throttleLocalFallbackFactor)` and threading `throttleLocalFallbackFactor` into the use
  case's construction. Re-verify Task 6's existing tests still reflect this before ticking it.
- **Batch 1 cross-task reconciliation (Task 1's port vs. Task 4's adapter).** Running Tasks 1 and 4
  in parallel, isolated worktrees meant Task 4 could not see Task 1's (or Task 3's) uncommitted
  work while building against it. Task 4's adapter needed the store to enforce the saturation
  ceiling in its own conditional write and to key by `scope`+`identity`+`routeGroup` separately
  (FR9/FR14/AC-6) — properties the original `RateLimitStore` port (`incrementAndRead(identityKey:
  string, ...)`, no ceiling parameter) could not express. The controller rewrote
  `src/throttling/domain/ports/rate-limit-store.ts` after both real implementations existed,
  adopting Task 4's better-specified shape (`ThrottleCounterIdentity`/`ThrottleCounterSnapshot`/
  `ThrottleCounterOutcome`, a `countRequest` method) while keeping the constitution-mandated
  interface name `RateLimitStore`, and widened `RateLimitStoreDegradedError`'s constructor
  (optional `underlyingErrorName`/`detail`, defaulting to the original fixed message) rather than
  adding a second error type. Anyone building against this port (Task 6, the use case) should read
  it as the settled shape — not as a placeholder still open for renegotiation.
- **Nest has no generic multi-provider** (Task 2 finding, verified against installed
  `@nestjs/core`/`@nestjs/common` source): only `APP_FILTER`/`APP_GUARD`/`APP_INTERCEPTOR`/
  `APP_PIPE` get cross-module provider collection. `PROBLEM_MAPPINGS` is currently
  `useValue: [authProblemMappings]` in `AuthModule`. Task 8 (wiring) must assemble
  `useValue: [authProblemMappings, throttlingProblemMappings]` explicitly — it cannot register a
  second `{ provide: PROBLEM_MAPPINGS, useValue: [...] }` in `ThrottlingModule` and expect
  aggregation; that would silently overwrite auth's rows.

- **Known spec deviation, Task 7.** `spec.md` FR5a requires the address derivation to live in a shared bootstrap step applied by `main.ts`, `lambda.ts` and the e2e builder. `plan.md` establishes there is no app-level setting to share, because neither `req.ip` nor `trust proxy` is usable — the derivation is a pure function, so every entry point gets the same behaviour by construction and the three files stay untouched. Mark this in `client-address.policy.ts` with a `SPEC_DEVIATION` comment naming FR5a and the plan's reasoning; the gate counts open ones so it is not forgotten.
- **A possible third parallel opener, flagged rather than acted on.** Task 3 touches only `src/shared/persistence/table-keys.ts`, `src/shared/config/**` and `src/shared/observability/**`, none of which Tasks 1 or 2 touch — so it is file-disjoint from both and could join the opening fan-out. The plan named only Tasks 1 and 2 as the parallel pair, so the order here follows the plan; raise it with `plan-writer` rather than re-slicing during implementation.
- **TDD is required** (`CLAUDE.md`): failing test first, per behaviour, asserting observable inputs/outputs/effects. Never assert on a mock. Several tests in this feature exist specifically because an obvious version of them would pass on a broken implementation — the subtasks say which, and those phrasings are load-bearing, not stylistic.
- **Do not commit per task.** Accumulate and propose the commit at the end, after `review-and-simplify`.
- Functions 4–20 lines, files under 400, no `any` — including in the mapper that unmarshalls the raw exception item.
