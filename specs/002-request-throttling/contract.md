# Request throttling — Verification Contract

> One `AC-N` per section, in `spec.md` order, with a short label. The spec is authoritative for
> what each criterion says; this file says what proves it, how to run that proof, and what a human
> sees when it passes. `status:` is `evaluator`'s to fill.

## Environment

- **start**: `docker compose up -d dynamodb && npm run db:create-table && npm run keys:generate`
  (from `CLAUDE.md`). Unit proofs need none of it.
- **env**: copy the repo's environment example to the local dotfile and source it manually — the
  project has no `dotenv` dependency, so nothing loads it for you. E2e and integration runs set
  their own values through `test/e2e/auth/support/set-test-environment.ts`, which must be the first
  import of any spec reaching `src/app.module.ts`.
- **fixtures**: `N/A` — nothing is seeded; e2e suites register the accounts they need through the
  public routes.
- **credentials**: `N/A`. `CLAUDE.md` notes that `/auth/login` and `/.well-known/jwks.json` need
  real AWS SSM — that applies to running the app by hand, **not** to the suites below.
  `test/e2e/auth/support/build-test-app.ts` overrides both key providers with an in-memory RS256
  pair, which is how `login.e2e-spec.ts:42` and `me.e2e-spec.ts:58` already assert a successful
  login and an authenticated call. Every proof here runs without an AWS account.
- **teardown**: `docker compose down -v`.

> Path arguments to the test scripts match by **file-path substring**, not test name. Do not
> shorten them: checkouts commonly live under `/home/...`, so a short substring matches every file.

## AC-1 — over the limit is refused

- **proof**: `test/e2e/throttling/credentials-limit.e2e-spec.ts`
- **command**: `npm run test:e2e -- throttling/credentials-limit`
- **observable**: the first N requests answer normally, request N+1 answers `429`
- **status**: PASS (evaluator, 2026-09-05)

## AC-2 — under the limit is not refused

- **proof**: `test/e2e/throttling/credentials-limit.e2e-spec.ts`
- **command**: `npm run test:e2e -- throttling/credentials-limit`
- **observable**: N−1 requests in one window, none of them `429`
- **status**: PASS (evaluator, 2026-09-05)

## AC-3 — refusal shape

- **proof**: `test/e2e/throttling/problem-document.e2e-spec.ts`
- **command**: `npm run test:e2e -- throttling/problem-document`
- **observable**: `429`, `content-type: application/problem+json`, body `code` is
  `RATE_LIMIT_EXCEEDED`, a `Retry-After` header is present
- **status**: PASS (evaluator, 2026-09-05)

## AC-4 — honouring Retry-After admits

- **proof**: `test/e2e/throttling/retry-after.e2e-spec.ts` — must push the counter to the
  saturation ceiling **after** capturing the header, or a stale derivation and a correct one give
  the same answer and the test proves nothing
- **command**: `npm run test:e2e -- throttling/retry-after`
- **observable**: the retry issued at the captured instant is admitted, not refused again
- **status**: PASS (evaluator, 2026-09-05)

## AC-5 — recovery bounded by one window

- **proof**: `test/unit/throttling/domain/throttle-policy.spec.ts`
- **command**: `npm run test:unit -- throttling/domain/throttle-policy`
- **observable**: after an arbitrarily large refused burst, the estimate falls under the limit
  within one window of the caller stopping
- **status**: PASS (evaluator, 2026-09-05)

## AC-6 — over the ceiling refuses without writing

- **proof**: `test/integration/throttle-counter-repository.int-spec.ts`
- **command**: `npm run test:integration -- throttle-counter-repository`
- **observable**: the decision is a refusal and the stored `current_count` is unchanged
- **status**: PASS (evaluator, 2026-09-05)

## AC-7 — idle caller is admitted

- **proof**: `test/unit/throttling/domain/throttle-policy.spec.ts`
- **command**: `npm run test:unit -- throttling/domain/throttle-policy`
- **observable**: with two or more windows elapsed, the previous count contributes zero and the
  caller is admitted
- **status**: PASS (evaluator, 2026-09-05)

## AC-8 — no boundary burst

- **proof**: `test/integration/throttle-counter-repository.int-spec.ts` — exercised **across a real
  rollover** by advancing the injected `Clock`, not against the pure policy alone; a correct
  weighting function on top of a broken promote still admits the burst
- **command**: `npm run test:integration -- throttle-counter-repository`
- **observable**: N admitted before the boundary, the group after it refused, total admitted well
  under 2N
- **status**: PASS (evaluator, 2026-09-05)

## AC-9 — limit holds across instances

- **proof**: `test/integration/throttle-admission.int-spec.ts` — the **use case** against local
  DynamoDB, with independent store clients, independent `Clock` readings and independent fallback
  limiters. Not the repository spec: the fallback limiter and the degraded event live in the use
  case, so a repository-level test cannot observe half of what this criterion asserts.
- **command**: `npm run test:integration -- throttle-admission`
- **observable**: admitted count does not exceed the limit, no increment lost, and no
  `throttle_degraded` line emitted (a shared in-process fallback could otherwise make a broken
  store path pass for the wrong reason)
- **status**: PASS (evaluator, 2026-09-05)

## AC-10 — straddling clocks at a rollover

- **proof**: `test/integration/throttle-counter-repository.int-spec.ts`
- **command**: `npm run test:integration -- throttle-counter-repository`
- **observable**: exactly one promote takes effect, the loser's request is still counted, no
  store-failure event
- **status**: PASS (evaluator, 2026-09-05)

## AC-11 — far-future window is reset

- **proof**: `test/integration/throttle-counter-repository.int-spec.ts`
- **command**: `npm run test:integration -- throttle-counter-repository`
- **observable**: the stored item comes back with a fresh window start and a zero previous count,
  and the request is counted
- **status**: PASS (evaluator, 2026-09-05)

## AC-12 — key selection per route kind

- **proof**: `test/unit/throttling/presentation/throttle-key-selection.spec.ts` for the selection,
  plus `test/e2e/throttling/account-scope.e2e-spec.ts` driving a protected route past its limit
  with a real Bearer token — available end to end, since `build-test-app.ts` supplies in-memory key
  material and no real SSM is involved
- **command**: `npm run test:unit -- throttling/presentation/throttle-key-selection` then
  `npm run test:e2e -- throttling/account-scope`
- **observable**: protected route keys by the verified account id and answers `429` once that
  account's own limit is passed; public route keys by client address plus route group
- **status**: PASS (evaluator, 2026-09-05)

## AC-13 — forged and absent X-Forwarded-For

- **proof**: `test/unit/throttling/presentation/client-address.policy.spec.ts`
- **command**: `npm run test:unit -- throttling/presentation/client-address`
- **observable**: with a multi-entry header the right-most entry wins and varying the left-hand
  entries yields the same identity; with no header at all, one shared identity rather than an
  unmetered path
- **status**: PASS (evaluator, 2026-09-05)

## AC-13a — same derivation across transports

- **proof**: `test/e2e/throttling/client-address.e2e-spec.ts`, driving the same headers through the
  Lambda transport (`test/fixtures/alb-event.fixture.ts`) and through the HTTP transport
- **command**: `npm run test:e2e -- throttling/client-address`
- **observable**: both transports key the same identity. The original framing — "not configured in
  a path the tests do not execute" — no longer has a failure mode, because the derivation is a pure
  function over headers with no app-level setting; what this proves is that the transport which
  synthesizes its own request object does not change the answer
- **status**: PASS (evaluator, 2026-09-05)

## AC-14 — IPv6 /64 folding

- **proof**: `test/unit/throttling/presentation/client-address.policy.spec.ts`
- **command**: `npm run test:unit -- throttling/presentation/client-address`
- **observable**: two addresses inside one /64 produce one identity
- **status**: PASS (evaluator, 2026-09-05)

## AC-15 — route groups are separate buckets

- **proof**: `test/e2e/throttling/route-groups.e2e-spec.ts`
- **command**: `npm run test:e2e -- throttling/route-groups`
- **observable**: `/auth/login` answering `429` while `/auth/refresh` from the same address is
  still admitted
- **status**: PASS (evaluator, 2026-09-05)

## AC-16 — health is never throttled

- **proof**: `test/e2e/throttling/health-exempt.e2e-spec.ts`
- **command**: `npm run test:e2e -- throttling/health-exempt`
- **observable**: every response `200` under a request count that exceeds any configured limit
- **status**: PASS (evaluator, 2026-09-05)

## AC-17 — store outage does not refuse

- **proof**: `test/unit/throttling/application/decide-request-admission.usecase.spec.ts`, driven by
  `test/fakes/failing-rate-limit-store.ts` — injected at the port, not by killing DynamoDB, which
  would also break the routes under test and prove nothing
- **command**: `npm run test:unit -- throttling/application/decide-request-admission`
- **observable**: the request is admitted, a `throttle_degraded` line is emitted, and the call
  returns within the configured deadline
- **status**: PASS (evaluator, 2026-09-05)

## AC-18 — deadline is a total, not per call

- **proof**: `test/unit/throttling/application/decide-request-admission.usecase.spec.ts` — the
  stub delays just under the budget on **each** of the three calls a rollover makes; a stub that
  delays once passes identically on a per-call timeout, which is the defect
- **command**: `npm run test:unit -- throttling/application/decide-request-admission`
- **observable**: total elapsed under one budget, the request served, and no unhandled promise
  rejection surfaced by the run
- **status**: PASS (evaluator, 2026-09-05)

## AC-19 — full fallback cache admits

- **proof**: `test/unit/throttling/infrastructure/local/instance-local-limiter.spec.ts`
- **command**: `npm run test:unit -- throttling/infrastructure/local/instance-local-limiter`
- **observable**: with the entry cap reached, a previously unseen identity is admitted
- **status**: PASS (evaluator, 2026-09-05)

## AC-20 — unclassified error fails open

- **proof**: `test/unit/throttling/presentation/fail-open-boundary.spec.ts`, driven by a limiter
  that throws a plain `TypeError`
- **command**: `npm run test:unit -- throttling/presentation/fail-open-boundary`
- **observable**: the request succeeds and the error is logged — not the `503` the global filter's
  default mapping would otherwise produce
- **status**: PASS (evaluator, 2026-09-05)

## AC-21 — backpressure is not a 429

- **proof**: two halves, because the criterion spans two layers —
  `test/unit/throttling/infrastructure/dynamo/throttle-counter.repository.spec.ts` for the
  classification, and
  `test/unit/throttling/application/decide-request-admission.usecase.spec.ts` for the decision,
  since "not refused with 429" is the use case's behaviour and the repository only classifies
- **command**: `npm run test:unit -- throttling/infrastructure/dynamo/throttle-counter` then
  `npm run test:unit -- throttling/application/decide-request-admission`
- **observable**: a throttling-class store error and an exhausted attempt budget both classify as
  degraded, and the request that follows is admitted rather than refused
- **status**: PASS (evaluator, 2026-09-05)

## AC-22 — no rate-limit headers on success

- **proof**: `test/e2e/throttling/problem-document.e2e-spec.ts`
- **command**: `npm run test:e2e -- throttling/problem-document`
- **observable**: a `200` from a throttled route carries no `RateLimit-*` and no `Retry-After`
- **status**: PASS (evaluator, 2026-09-05)

## AC-23 — published contract carries the code and the 429

- **proof**: `test/e2e/contract/openapi.e2e-spec.ts`
- **command**: `npm run test:e2e -- contract/openapi`
- **observable**: `RATE_LIMIT_EXCEEDED` in the document's `code` enum, and throttled routes
  documenting a `429` response
- **status**: PASS (evaluator, 2026-09-05)

## AC-24 — key shape and TTL

- **proof**: `test/unit/shared/persistence/table-keys.spec.ts` for the key;
  `test/integration/throttle-counter-repository.int-spec.ts` for the stored `ttl`
- **command**: `npm run test:unit -- shared/persistence/table-keys` then
  `npm run test:integration -- throttle-counter-repository`
- **observable**: `PK` under the `THROTTLE#` prefix and never `USER#`; `ttl` two windows past the
  window start, asserted by reading the attribute rather than waiting for a deletion DynamoDB
  performs on its own schedule
- **status**: PASS (evaluator, 2026-09-05)

## AC-25 — store calls per request

- **proof**: `test/integration/throttle-counter-repository.int-spec.ts`, counting commands at the
  adapter's call site — `ReturnConsumedCapacity` cannot see this, because a failed conditional is
  charged but carries no `ConsumedCapacity`, so a success-only assertion measures one and two and
  agrees with the wrong claim
- **command**: `npm run test:integration -- throttle-counter-repository`
- **observable**: one command in the common case, three at a rollover, one over the ceiling
- **status**: PASS (evaluator, 2026-09-05)

## AC-26 — starts with no throttle variables set

- **proof**: `test/unit/shared/config/environment.schema.spec.ts`
- **command**: `npm run test:unit -- shared/config/environment.schema`
- **observable**: parsing succeeds with none of the ten set, every value takes its default, and the
  degraded ceiling resolves to the route's own limit
- **status**: PASS (evaluator, 2026-09-05)

## AC-27 — event shape

- **proof**: `test/unit/shared/observability/structured-logger.spec.ts` for the allow-list;
  `test/unit/throttling/application/decide-request-admission.usecase.spec.ts` for the two events
- **command**: `npm run test:unit -- shared/observability/structured-logger` then
  `npm run test:unit -- throttling/application/decide-request-admission`
- **observable**: one JSON line per event naming scope and route group, with no credential, token
  or address in it, and an unlisted field still dropped
- **status**: PASS (evaluator, 2026-09-05)

## Full-Suite Check

- **command**: `bash .specify/gates/run-gates.sh`
- **status**: PASS (evaluator, 2026-09-05)
