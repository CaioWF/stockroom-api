---
status: approved
---

# Request throttling — Plan

> Grounded in `spec.md` (33 FRs, 28 ACs, clarified) and the seams `prd.md` declares. The design
> reasoning and the three adversarial review cycles behind it live in `brainstorm.md`; this file
> does not repeat them, it turns them into paths, types and an order.
>
> `codebase-map` was **skipped**: 68 TypeScript files under `src/`, one bounded context plus a
> shared layer, all of it read directly while writing this plan. `CLAUDE.md` allows the skip on a
> small repo, and a generated map would be a second copy of the tree below.

## Architecture

**One new bounded context**, `src/throttling/`, laid out domain-first exactly like `src/auth/`
(`domain/` → `application/` → `infrastructure/` → `presentation/`, with the module file at the
context root). This is replication, not invention: `src/auth/` already establishes ports in
`domain/ports/`, use cases in `application/`, DynamoDB adapters plus mappers in
`infrastructure/dynamo/`, and guards/decorators/typed errors in `presentation/`. The plan follows
that shape everywhere it applies and records each place it does not.

**Request path, public route (FR3, FR23).** `JwtAuthGuard` sees `@Public()` and returns
immediately → `ThrottleGuard` derives the client address from `X-Forwarded-For` (FR5), reads the
route group from handler metadata (FR4), and calls the use case → the use case builds the window
from the injected `Clock` (FR10), asks the `RateLimitStore` port to increment-and-return, hands the
result to the pure policy (FR7, FR9), and returns a decision → the guard either passes or throws
the typed rejection.

**Request path, protected route (FR2, FR23).** `JwtAuthGuard` verifies the token and populates
`request.authClaims` → all guards finish → `AccountThrottleInterceptor` runs (the framework's phase
boundary is what guarantees "after authentication", not provider ordering) → same use case, keyed
by the verified account id → passes to `next.handle()` or throws.

**Store path (FR14–FR17).** The DynamoDB adapter issues one conditional `UpdateItem`. On
`ConditionalCheckFailedException` it unmarshalls the item the exception carries, classifies which
clause failed, and either refuses (over the ceiling) or runs the rollover branch, promoting with a
single self-referencing `SET`. The whole sequence shares one deadline and one `AbortSignal`.

**Failure path (FR18–FR22).** The adapter classifies every non-protocol outcome as *degraded* and
throws a typed degraded error; the use case catches it, consults the instance-local fallback
limiter, emits the structured event, and admits. A fail-open boundary at both entry points catches
anything unclassified so a defect in this feature cannot turn a would-succeed request into a 503.

**Integration with what exists.** Five touch points outside the new context, each one already
owned by a module that must keep owning it: the key grammar (`src/shared/persistence/table-keys.ts`),
the configuration schema (`src/shared/config/environment.schema.ts`), the structured logger's field
allow-list (`src/shared/observability/structured-logger.ts`), the problem-details taxonomy (moved,
see Technical Decisions), and the generated OpenAPI document.

## File Structure

**New — throttling context**

- `src/throttling/domain/rate-limit-window.ts` — window value object: start, length, elapsed
  fraction, elapsed-window count between two starts.
- `src/throttling/domain/throttle-policy.ts` — pure arithmetic: saturated weighting, the
  admit/refuse decision, and the `Retry-After` inversion (FR7, FR9, FR25).
- `src/throttling/domain/throttle-decision.ts` — discriminated union
  (`{ kind: 'admitted' } | { kind: 'refused'; retryAfterSeconds: number }`).
- `src/throttling/domain/throttle-scope.ts` — the closed scope union (`ip` | `account`) and the
  route-group union, as string-literal unions, not enums of convenience.
- `src/throttling/domain/rate-limit-policy.ts` — the resolved limit/window/ceiling for a
  (scope, route group), produced from config.
- `src/throttling/domain/ports/rate-limit-store.ts` — the port the constitution names.
- `src/throttling/domain/rate-limit-store-degraded.error.ts` — the typed degraded outcome.
- `src/throttling/application/decide-request-admission.usecase.ts` — composes store, policy,
  deadline, fallback and the degraded classification.
- `src/throttling/infrastructure/dynamo/throttle-counter.repository.ts` — the `RateLimitStore`
  adapter: conditional increment, rollover branch, promote, bounded attempt loop.
- `src/throttling/infrastructure/dynamo/throttle-counter.mapper.ts` — item ↔ domain, including
  unmarshalling the raw `AttributeValue` item a failed conditional returns.
- `src/throttling/infrastructure/dynamo/throttle-dynamo-client.provider.ts` — a **separate**
  document client with retries disabled and explicit timeouts (see Technical Decisions).
- `src/throttling/infrastructure/local/instance-local-limiter.ts` — degraded-mode ceiling: lazy
  expiry, entry cap, admit-when-full.
- `src/throttling/presentation/client-address.policy.ts` — right-most `X-Forwarded-For` entry,
  IPv6 /64 folding, the no-header identity.
- `src/throttling/presentation/no-throttle.decorator.ts` — own metadata key (FR1).
- `src/throttling/presentation/throttle-group.decorator.ts` — route-group metadata (FR4).
- `src/throttling/presentation/throttle.guard.ts` — IP-keyed entry point.
- `src/throttling/presentation/account-throttle.interceptor.ts` — account-keyed entry point.
- `src/throttling/presentation/rate-limit-exceeded.error.ts` — the typed rejection carrying
  `retryAfterSeconds`.
- `src/throttling/throttling.module.ts` — wiring, plus its problem-mapping row contribution.

**New — shared problem taxonomy (FR27)**

- `src/shared/presentation/problem-details.filter.ts` — the filter and `PROBLEM_CODES`, moved.
- `src/shared/presentation/problem-mapping.ts` — the `ProblemMapping`/row types and the
  `PROBLEM_MAPPINGS` multi-provider token contexts contribute rows to.
- `src/auth/presentation/auth-problem-mappings.ts` — auth's rows, extracted from the moved file.

**Touched**

- `src/shared/persistence/table-keys.ts` — add `buildThrottleCounterKey`.
- `src/shared/config/environment.schema.ts` — the throttle variables and their defaults (FR28–29).
- `src/shared/observability/structured-logger.ts` — add `scope`, `routeGroup`, `retryAfterSeconds`
  to the field allow-list.
- `src/auth/presentation/openapi/problem-schema.ts` — import path follows the move.
- `src/auth/presentation/openapi/response-schemas.ts`, `openapi-document.ts` — the 429 responses.
- `src/auth/auth.module.ts` — the `APP_FILTER` provider follows the move; auth contributes its rows.
- `src/auth/presentation/auth.controller.ts`, `jwks.controller.ts`, `openapi.controller.ts`,
  `src/health/health.controller.ts` — group and exemption decorators.
- `src/app.module.ts` — import `ThrottlingModule`.
- The environment example file — the new variables.

**Tests** — mirroring the existing layout exactly:

- `test/unit/throttling/domain/*.spec.ts`, `test/unit/throttling/application/*.spec.ts`,
  `test/unit/throttling/infrastructure/**/*.spec.ts`,
  `test/unit/throttling/presentation/*.spec.ts`
- `test/unit/throttling/presentation/throttle-exemption-allowlist.spec.ts` — mirrors the existing
  `test/unit/auth/presentation/public-route-allowlist.spec.ts`, asserting exactly which routes are
  exempt so a new one cannot become exempt silently.
- `test/integration/throttle-counter-repository.int-spec.ts` — the store protocol against local
  DynamoDB.
- `test/integration/throttle-admission.int-spec.ts` — the **use case** against local DynamoDB, which
  is the only level where the fallback limiter and the degraded event exist and therefore the only
  level where "the limit held and the fallback never engaged" is observable.
- `test/e2e/throttling/*.e2e-spec.ts`
- `test/fakes/in-memory-rate-limit-store.ts`, `test/fakes/failing-rate-limit-store.ts`
- Reuses `test/fakes/controllable-clock.ts` and `test/fixtures/alb-event.fixture.ts` unchanged.

## Technical Decisions

- **A separate DynamoDB document client for throttling, not the shared singleton.** FR17 requires
  retries disabled and explicit timeouts. `src/shared/persistence/dynamo-client.provider.ts` is a
  singleton shared by both auth repositories, and disabling retries there would remove
  transient-error recovery from sign-in and token rotation — a change nobody asked for and the
  opposite of what those paths want. The throttling context builds its own client from the same
  `AppConfig`, with `maxAttempts: 1` and explicit connection/request timeouts. This is a deliberate
  divergence from "reuse the shared provider", recorded because the divergence is the point.

- **The problem taxonomy moves behind a contribution registry, not wholesale.** FR27 says the filter
  and `PROBLEM_CODES` move to `src/shared/presentation/`. Moving the file as it stands would carry
  its imports of `src/auth/domain/**` and `src/auth/infrastructure/**` with it, making `shared`
  depend on `auth` — backwards, and against the constitution's dependency rule. So the move splits:
  `shared` owns the problem-document shape, the closed code set, the filter, and a
  `PROBLEM_MAPPINGS` multi-provider token; `AuthModule` and `ThrottlingModule` each provide their
  own rows, importing their own errors. `shared` then imports from neither. This is forced by the
  relocation FR27 mandates, not opportunistic refactoring — with two contexts emitting codes, a
  registry is the smallest correct shape.

- **FR5a needs no shared bootstrap step, because there is no configuration to share.** The spec
  asked for one so the e2e suite could not diverge from the production entry points. Since `clarify`
  established that both `req.ip` and `trust proxy` are unusable here, the address is read from the
  header by a pure function in `client-address.policy.ts`. There is no app-level setting for an
  entry point to get wrong, so the requirement is satisfied by construction and more strongly than a
  bootstrap step would: `main.ts`, `lambda.ts` and `test/e2e/auth/support/build-test-app.ts` stay
  untouched. The existing `test/fixtures/alb-event.fixture.ts` gives the lambda-path e2e a real ALB
  event to assert against.

- **Route group by decorator, with a default.** `@ThrottleGroup('credentials')` on the handler,
  mirroring the existing `@Public()` metadata pattern. FR1 makes throttling the default, so a route
  carrying no group decorator falls into a default group rather than escaping — the decorator opts a
  route into a *different* budget, never out of one. Exemption is the separate `@NoThrottle()`, with
  its own metadata key (FR1 forbids inferring it from `@Public()`).

- **Decomposition axis: layer, with a two-way parallel opener.** The `slice` axis does not fit. This
  is one bounded context plus five shared files (`table-keys.ts`, `environment.schema.ts`,
  `structured-logger.ts`, the OpenAPI schemas, `app.module.ts`) that nearly every step touches —
  shared-file gravity that would make declared-disjoint slices clobber each other under parallel
  execution. Two genuinely file-disjoint units open the work and can run in parallel: the pure domain
  (step 1) and the taxonomy relocation (step 2). Everything after them is a dependency chain and is
  ordered as one.

- **Naming (`naming-conventions` lens).** camelCase in code, snake_case at the DynamoDB boundary,
  one mapping site (`throttle-counter.mapper.ts`), exactly as `refresh-token.mapper.ts` does. One
  name per concept across layers: `windowStart` ↔ `window_start`, `currentCount` ↔ `current_count`.
  Note the existing mapper's warning — attribute names are not mechanically derived, they are the
  literal strings the condition expressions name, so the mapper is the single place they appear.

- **TypeScript (`typescript-conventions` lens).** The decision is a discriminated union, not a
  boolean plus optional fields, so a refusal cannot be constructed without its `retryAfterSeconds`.
  Scope and route group are string-literal unions. Configuration is parsed at the boundary through
  the existing zod schema and reaches the domain as a typed `RateLimitPolicy`. No `any`, including
  in the mapper that unmarshalls the raw exception item.

- **Postgres (`postgres-conventions` lens): not applicable.** The store is DynamoDB.

- **Observability (`observability-and-instrumentation` lens).** Two named events, `throttle_refused`
  and `throttle_degraded`, each carrying scope and route group and nothing identifying (FR30). The
  degraded event is the one an alarm watches; a non-trivial rate means the counter's storage is the
  problem, not the callers. `StructuredLogger`'s allow-list must gain the new fields — it withholds
  unknown fields by design, so a field added without listing it is silently dropped.

- **Table provisioning needs no change.** `scripts/create-table.ts` already declares the partition
  key, sort key and a `ttl` attribute for time-to-live; the counter item reuses all three.

## Data Layer Contract

- **Code↔schema mapping**: `windowStart` ↔ `window_start`, `currentCount` ↔ `current_count`,
  `previousCount` ↔ `previous_count`, `expiresAt` ↔ `ttl`. The single mapping site is
  `src/throttling/infrastructure/dynamo/throttle-counter.mapper.ts`, which owns both directions —
  including unmarshalling the raw `AttributeValue` item that
  `ReturnValuesOnConditionCheckFailure: 'ALL_OLD'` attaches to the thrown exception, which the
  document client does **not** unmarshall for you.
- **Tables/columns**: no new table. One new item shape in the existing single table, keyed by
  `buildThrottleCounterKey(scope, identity, routeGroup)` in `src/shared/persistence/table-keys.ts`:
  `PK = "THROTTLE#<scope>#<identity>"`, `SK = "<routeGroup>"`. The `THROTTLE#` prefix is its own
  partition space — FR12 forbids sharing `USER#<accountId>`, which already holds the profile and
  every refresh token. Attributes, with synthetic values:
  `{ PK: "THROTTLE#ip#203.0.113.7", SK: "credentials", window_start: 1757030400, current_count: 7,
  previous_count: 3, ttl: 1757030520 }`. `window_start` and `ttl` are Unix epoch **seconds**
  (numbers), matching `refresh-token.mapper.ts`'s existing `ttl` convention; the counts are numbers.
- **Indexes**: none. Every access is a point write against the full key; there is no query pattern
  and no GSI.
- **RLS**: `N/A` — DynamoDB, and the item is service-owned infrastructure state, not tenant data.
  A caller never reads its own counter; the only reader is the service.
- **Migration**: additive and requires no migration step. The item is created on first write and
  removed by TTL; `scripts/create-table.ts` already provisions the key schema and the `ttl`
  attribute, so no table change ships with this feature.

## Implementation Order

1. **Throttling domain** — window, policy (weighting, saturation, `Retry-After` inversion), decision
   union, scope/route-group types, `RateLimitStore` port, degraded error. Pure, no framework, no
   network. Covers FR6–FR10, FR25. *File-disjoint from step 2 — the two can run in parallel.*
2. **Problem taxonomy relocation** — split the filter into shared machinery plus the
   `PROBLEM_MAPPINGS` registry, extract auth's rows, follow the import in the OpenAPI schema and the
   `APP_FILTER` provider. Adds `RATE_LIMIT_EXCEEDED` to the closed set. Covers FR27.
   *File-disjoint from step 1.*
3. **Shared seams** — the key builder in `table-keys.ts`, the configuration variables and defaults,
   the logger's new allow-list fields. One task because all three are shared files. Covers
   FR11–FR12, FR28–FR29, and the field half of FR30.
4. **DynamoDB adapter** — its own client provider (retries off, timeouts), the conditional
   increment, the `ALL_OLD` branch, the self-referencing promote, the bounded attempt loop, the
   two-class error taxonomy. Covers FR13–FR18.
5. **Instance-local fallback limiter** — lazy expiry, entry cap, admit-when-full, derived ceiling.
   Covers FR19–FR20a.
6. **Use case** — composes store, policy and fallback under one deadline with an `AbortSignal`, and
   emits the two events. Covers FR21 and the event half of FR30.
7. **Presentation** — client-address policy, both decorators, the guard, the interceptor, the typed
   rejection and its problem row, the fail-open boundary including the missing-claims case. Covers
   FR1–FR5, FR22, FR22a, FR23, FR24, FR26.
8. **Wiring and contract** — `ThrottlingModule`, registration in `app.module.ts`, group decorators
   on the auth routes, exemptions on health and the OpenAPI route, the 429 responses in the
   generated document. Covers FR4 and FR23's registration half, plus AC-23.
9. **Environment example and docs** — the new variables in the example file, and the `gotchas.md`
   entries the review cycles earned (the shadowed `req.ip`, the un-unmarshalled exception item).

## How to Validate

Strategy only — the per-`AC-N` proof map with commands and observables belongs in `contract.md`.

- **Unit** carries the arithmetic and every branch that a running system makes hard to reach: the
  weighting and saturation, all five elapsed-window branches, the `Retry-After` inversion, the
  address policy against a forged header, the two decorators' metadata, the error classification,
  and the fallback limiter's cap behaviour. These need no DynamoDB and no framework, which is the
  point of keeping the arithmetic in `domain/`.
- **Integration**, against local DynamoDB, carries what only the real conditional protocol can show:
  rollover, the promote race between independent clients, the boundary case exercised *across* a
  rollover rather than against the pure policy, the straddling-clock and far-future-window cases,
  the TTL attribute's value, and the store-call count per request. Two of these exist specifically
  because a single-process happy-path test would pass on a broken implementation.
- **End-to-end** carries the contract a client sees: the 429 and its problem document, honouring
  `Retry-After` after pushing the counter to its ceiling, route groups as separate buckets, and
  `/health` staying 200 under a flood, and the account-scoped bucket driven by a real Bearer token.
  An earlier revision of this plan recorded the account path as coverable only one layer down,
  because a successful login was believed to need real AWS SSM. That was a misreading of
  `CLAUDE.md`, which describes running the app by hand: `test/e2e/auth/support/build-test-app.ts`
  overrides both key providers with an in-memory RS256 pair, and `login.e2e-spec.ts` and
  `me.e2e-spec.ts` already assert a successful login and an authenticated call on that basis. There
  is no gap; the account-scoped path is covered end to end like everything else.
- **Quality checklist**: `.specify/gates/run-gates.sh` green; no `any`; functions 4–20 lines and
  files under 400; every `AC-N` cited by a task; no new `SPEC_DEVIATION` left open; the exemption
  allow-list test updated whenever a route is added.
