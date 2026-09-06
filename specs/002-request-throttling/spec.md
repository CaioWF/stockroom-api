---
status: approved
feature: 002-request-throttling
date: 2026-09-05
---

# Request throttling — Spec

## User Stories

- **As a developer integrating for the first time, I want a refused request to tell me when to try
  again, so that I learn the limit from the API instead of from a support conversation.**
  Accepted when the refusal is a `429` carrying the same `problem+json` shape as every other error
  in the API, with a documented code and a `Retry-After`, and when a client that waits exactly that
  long is admitted on its next attempt.

- **As an office of clients behind one shared address, I want ordinary use never to hit a limit, so
  that renewing a token is not a coin flip.**
  Accepted when routine token renewal from many clients on one address stays under its limit while
  credential attempts from that same address are limited separately, and when a caller returning
  after an idle period is admitted immediately rather than judged on traffic it sent an hour ago.

- **As the operator of Stockroom, I want a hostile caller's cost capped, so that one script cannot
  consume the capacity of every legitimate integration.**
  Accepted when a caller exceeding its limit is refused, when that limit is not multiplied by the
  number of concurrently running instances, and when a caller that keeps retrying after refusal
  cannot push its own recovery time out indefinitely.

- **As an on-call engineer, I want a problem with the counter's storage to stay a problem with the
  counter, so that it never becomes a sign-in outage.**
  Accepted when the API keeps serving during a store incident, when it does so without inflating
  request latency enough to cause an outage by a different route, and when the degradation is
  visible in the logs as its own event rather than hidden inside a generic error.

- **As the author of the next feature, I want throttling to apply to routes I have not written yet,
  so that I inherit it without writing throttling code.**
  Accepted when a route added later is limited by default with no per-route wiring, and when
  exempting one is an explicit, enumerable act.

## Functional Requirements

**Scope and caller identity**

- **FR1** — Every route is throttled by default. Exemption is explicit, applied by a `@NoThrottle()`
  decorator carrying **its own metadata key**. The exemption MUST NOT be inferred from `@Public()`:
  four of the six public routes must stay limited, so keying the two off each other would silently
  exempt `register`, `login`, `refresh` and the key set.
- **FR2** — A protected route is counted by the verified account id taken from the request's auth
  claims, under scope `account`.
- **FR3** — A public route is counted by the client address under scope `ip`, dimensioned
  additionally by **route group**, so the public routes do not share one bucket.
- **FR4** — The route groups are: `credentials` (`POST /auth/register`, `POST /auth/login`),
  `refresh` (`POST /auth/refresh`), and `jwks` (`GET /.well-known/jwks.json`). `GET /health` and the
  OpenAPI document route are exempt.
- **FR5** — The client address is the **right-most** entry of `X-Forwarded-For`, the hop the ALB
  appended, and never the client-supplied portion of that header. It is read from the header
  directly. Two mechanisms are explicitly forbidden, both verified against the installed packages
  rather than recalled:
  - **`req.ip` MUST NOT be used.** Express defines `ip` as a getter on the request prototype
    (`express@5.2.1`, `lib/request.js:327`), but `@codegenie/serverless-express@5` constructs its
    request with `Object.assign(this, { ip: remoteAddress })` (`src/request.js`), and an own data
    property shadows a prototype getter — so `trust proxy` is never consulted. That `remoteAddress`
    is read from `event.requestContext.identity.sourceIp` (`src/event-sources/utils.js`), which an
    ALB event does not carry (it has `requestContext.elb`), so it falls through to the empty string.
  - **`trust proxy: true` MUST NOT be used.** `compileTrust(true)` returns a function that trusts
    every hop (`express/lib/utils.js:199`); `forwarded` parses `X-Forwarded-For` **backwards**, so
    `proxy-addr` returns the last untrusted address, which under "trust everything" is the
    **left-most** entry — the one the client sent. That is the bypass, not the defence.
  - A request arriving with no `X-Forwarded-For` at all has no derivable client address. It is
    treated as a single shared identity rather than as many, so it cannot be used to obtain an
    unmetered path.
- **FR5a** — The derivation MUST be reachable from the e2e suite: it lives in a shared bootstrap
  step applied by `main.ts`, `lambda.ts` **and** the e2e application builder. Today
  `test/e2e/auth/support/build-test-app.ts` boots through
  `Test.createTestingModule(...).createNestApplication()`, so anything configured only in a
  production entry point is untested.
- **FR6** — An IPv6 client address is folded to its **/64 prefix** before it is used as an identity.
  A single subscriber routinely holds the whole /64, so keying the full address is both a bypass and
  an unbounded generator of counter items.

**Window algorithm**

- **FR7** — The limit is enforced by a weighted sliding-window counter. The estimate for a caller is
  the saturated previous-window count weighted by the fraction of the previous window still covered
  by the current window's elapsed time, plus the saturated current-window count. A caller is refused
  when that estimate, computed **after** its own increment, **exceeds** the configured limit.
  "Exceeds" and not "reaches": with FR8 counting the request before deciding, the Nth request in a
  fresh window produces a count of exactly N, and refusing at equality would serve only N−1.
- **FR8** — The counter is incremented before the decision is made, so a refused request also counts
  against its caller.
- **FR9** — Counts are saturated at `limit × THROTTLE_COUNTER_SATURATION_FACTOR`. The saturation is
  honoured in the estimate **and** enforced in the write condition: once a caller's current count
  has reached the ceiling the conditional write fails and no data is stored. This bounds recovery
  for everyone sharing an address to under one window after abuse stops, and bounds the stored
  value.
- **FR10** — Window boundaries are computed from the injected `Clock`, never from a direct clock
  read, so window behaviour is testable without waiting.

**Storage**

- **FR11** — State is one item per `(identity, scope, route group)` in the existing single table,
  holding the window start, the current count, the previous count, and a TTL attribute.
- **FR12** — The item's key is built in `src/shared/persistence/table-keys.ts`, under a partition
  prefix owned by the throttling context. It MUST NOT share the `USER#<accountId>` partition, which
  already holds the account profile and every refresh token: an account's request flood would
  otherwise consume the same per-partition write budget as that account's own sign-in.
- **FR13** — The TTL attribute expires an item **two** windows past its window start. One window is
  incorrect: the item would become deletable exactly as the next window opens, which is the window
  in which the previous count is the whole defence against a boundary burst, and a deleted item is
  indistinguishable from a first-ever request.
- **FR14** — The common path is a single conditional `UpdateItem` that increments the current count,
  admitted when the stored window matches the caller's (or no item exists) and the current count is
  below the saturation ceiling.
- **FR15** — When that condition fails, the request retrieves the stored item through
  `ReturnValuesOnConditionCheckFailure: 'ALL_OLD'` and branches on it. Verified against DynamoDB
  Local: the item is returned on the thrown `ConditionalCheckFailedException` as its `Item`
  property, but in raw `AttributeValue` form — `DynamoDBDocumentClient` does **not** unmarshall that
  field the way it unmarshalls a successful response, so the adapter must unmarshall it itself.
  The branches:
  - the stored count is at the ceiling in the live window → refuse;
  - exactly one window elapsed → promote the current count into the previous count;
  - two or more windows elapsed → set the previous count to **zero**, so a caller returning after an
    idle period is not judged on traffic from a window that is no longer adjacent;
  - the stored window is at or ahead of the caller's by no more than one window → treat as clock
    skew, adopt the stored window and increment against it;
  - the stored window is ahead by more than one window → treat the item as unusable and reset it to
    a fresh window with a zero previous count, so a single fast clock cannot pin the window into the
    future and stop rollover for every other instance.
- **FR16** — The promote is a second conditional `UpdateItem` gated on the stored window start, so
  exactly one of several concurrent invocations performs it; the losers re-enter FR15 against the
  window that won. It is a **single atomic statement**:
  `SET previous_count = current_count, current_count = :one, window_start = :new`. Verified against
  DynamoDB Local — the expression is accepted and its operands read the pre-update item, so
  `previous_count` receives the old `current_count` in the same write. It therefore cannot lose a
  concurrent increment the way writing back a value read from `ALL_OLD` would.
  Every conditional failure re-reads the stored item; the loop is bounded by a
  configured attempt count, and exhausting it is treated as a store failure (FR18), never as a
  silent admission.
- **FR17** — Automatic SDK retries are disabled for the throttling client. The increment is not
  idempotent, so a transparent retry after a lost response would double-count; with retries off, a
  timeout is unambiguously an unknown outcome.

**Failure behaviour**

- **FR18** — Store outcomes are classified into exactly two kinds: **protocol** (a conditional check
  failing, which is the normal rollover and ceiling path and is never an error) and **degraded**
  (contention, backpressure, timeout, service error, network error, and any unrecognized error).
  A degraded outcome MUST NOT refuse the request.
- **FR19** — On a degraded outcome the request proceeds, the event is logged as structured JSON on a
  counter suitable for alarming, and the instance-local fallback limiter applies as a coarse
  ceiling. The ceiling is documented as degraded, not equivalent: with N warm instances the
  effective limit is N times it.
- **FR20** — The fallback limiter applies **only** in degraded mode, expires entries lazily on read
  rather than on a timer, caps its entries, and **admits** rather than refuses once that cap is
  reached. Refusing there would turn a counter-table incident into a total outage, because every
  distinct address is a distinct entry and the cap is reached within seconds of an incident.
- **FR20a** — The local ceiling is **derived from the route's own configured limit**, not set as a
  separate absolute number: it is that limit multiplied by `THROTTLE_LOCAL_FALLBACK_FACTOR`
  (default 1), applied per instance. No principled absolute value exists until the Lambda's expected
  concurrency is known, and a derived ceiling needs no second number to justify and follows the
  limits when they are tuned. It is a per-instance ceiling: with N warm instances the effective
  allowance is N times it, which FR19 already requires be documented as degraded.
- **FR21** — All of a request's store work shares a **single deadline**, not one per call. When it
  expires the in-flight command is aborted through an `AbortSignal`, and any promise the deadline
  outruns still receives a terminal handler, so an abandoned rejection cannot terminate the process.
- **FR22** — Any error raised anywhere in the throttling path that is not a classified store outcome
  is caught at the entry point, logged, and the request admitted. Without this, an unclassified
  throw reaches the global exception filter, whose default mapping is `503`, and a defect in the
  limiter would refuse a request that was going to succeed.
- **FR22a** — A protected route reaching the account-scoped interceptor without verified auth claims
  is a wiring defect, not a caller's doing. It is logged as such and the request is admitted, under
  the same rule as FR22 — the throttle never converts a broken guard chain into a refusal.

**Placement**

- **FR23** — IP-keyed throttling runs in a guard. Account-keyed throttling runs in an
  **interceptor** rather than a second guard, so that "after authentication" is guaranteed by the
  framework's phase ordering (all guards, then interceptors) instead of by the relative registration
  order of two global guards declared in different modules.

**Response contract**

- **FR24** — A refusal is `429` with a `problem+json` body carrying the new closed-set code
  `RATE_LIMIT_EXCEEDED` and a `Retry-After` header.
- **FR25** — `Retry-After` is the smallest whole number of seconds after which the caller would be
  **admitted**, computed against the saturation ceiling rather than the counts observed at refusal,
  and solved for admission *after* the retry's own increment. It always spans the window boundary
  — the remainder of the current window, plus however long the fresh window needs for its promoted,
  worst-case previous count to decay enough — because the current window's own count can be driven
  to the saturation ceiling by continued traffic before the wait ends (AC-4), and once it can, no
  instant inside that same window ever admits, regardless of how little of it had elapsed at
  refusal. An implementation with a separate "still inside this window" answer for a caller under
  the limit at refusal time is a defect: verified numerically during implementation, it always
  fails AC-4. It is clamped to at least one second and at most three windows.
- **FR26** — No rate-limit headers are emitted on successful responses.
- **FR27** — `PROBLEM_CODES` and the exception filter move from `src/auth/presentation/` to
  `src/shared/presentation/`, and `AuthExceptionFilter` is renamed `ProblemDetailsFilter`. The
  OpenAPI document's `code` enum continues to be generated from that same array, and the document
  gains the `429` responses. The filter performs no I/O.

**Configuration and observability**

- **FR28** — Limits and windows are environment configuration: `THROTTLE_CREDENTIALS_LIMIT` (10) and
  `THROTTLE_CREDENTIALS_WINDOW_SECONDS` (60); `THROTTLE_REFRESH_LIMIT` (60); `THROTTLE_JWKS_LIMIT`
  (120); `THROTTLE_AUTHENTICATED_LIMIT` (100) and `THROTTLE_AUTHENTICATED_WINDOW_SECONDS` (60);
  `THROTTLE_COUNTER_SATURATION_FACTOR` (2); `THROTTLE_LOCAL_FALLBACK_FACTOR` (1);
  `THROTTLE_LOCAL_CACHE_MAX_ENTRIES`; `THROTTLE_STORE_DEADLINE_MILLISECONDS`;
  `THROTTLE_STORE_MAX_ATTEMPTS`.
  The limit values are a **starting posture, not a product commitment**. They are sized for an
  office behind one NAT; a carrier-grade NAT aggregates orders of magnitude more, and raising them
  blindly to cover that would weaken the defence against credential guessing, which is the reason
  this feature ships before `specs/003-product-catalog`. FR30's per-route-group refusal metric is
  what says when to move them.
- **FR29** — Every one of them carries a default and is added to the environment example file. The
  configuration schema refuses to start on a missing required variable and the Lambda turns that
  into a blanket `503`, so a partially applied throttle configuration must not be able to take the
  service down.
- **FR30** — A refusal and a degraded-mode event are each emitted as structured JSON carrying the
  scope and route group, and never the caller's credentials or token.

## Acceptance Criteria

- **AC-1** — Given a public route with a limit of N per window, when a single address sends N+1
  requests inside one window, then the first N are served and the last returns `429`.
- **AC-2** — Given the same route and address, when it sends fewer than N requests in a window,
  then none of them is refused.
- **AC-3** — Given a refusal, when the response is inspected, then it is `429` with a
  `problem+json` body whose `code` is `RATE_LIMIT_EXCEEDED` and which carries a `Retry-After`
  header.
- **AC-4** — Given a refusal carrying `Retry-After: S`, when the caller continues sending until its
  counter reaches the saturation ceiling and then retries exactly S seconds after the refusal, then
  that retry is admitted. (Without the extra traffic a stale derivation and a correct one coincide,
  so the criterion is only meaningful with it.)
- **AC-5** — Given a caller that exceeded its limit, when it stops sending, then it is admitted
  again within one window, regardless of how many requests it sent while refused.
- **AC-6** — Given a caller whose current count has reached the saturation ceiling, when it sends
  another request, then the request is refused and no counter data is written.
- **AC-7** — Given a caller that sent traffic and then went idle for two or more windows, when it
  sends its next request, then it is admitted — the count from the non-adjacent window does not
  weigh against it.
- **AC-8** — Given a limit of N per window, when a caller sends N requests in the seconds before a
  window boundary and N more in the seconds after it, then the second group is refused; the total
  admitted across the boundary does not reach 2N.
- **AC-9** — Given many concurrent callers of the same identity served by independent application
  instances with independent clocks and independent fallback limiters, when they together exceed
  the limit, then the number admitted does not exceed the limit, no increment is lost, and no
  degraded-mode event is emitted — so a passing result cannot come from the fallback quietly
  enforcing the limit in place of a broken store path.
- **AC-10** — Given two instances whose clocks straddle a window boundary, when both attempt the
  rollover concurrently, then exactly one promote takes effect, the other's request is still
  counted, and no store-failure event is emitted.
- **AC-11** — Given a stored window more than one window ahead of the caller's, when a request
  arrives, then the item is reset to a fresh window with a zero previous count and the request is
  counted, rather than the caller adopting the future window.
- **AC-12** — Given a request on a protected route, when it is counted, then the key is the verified
  account id; and given a request on a public route, then the key is the client address and its
  route group.
- **AC-13** — Given a request carrying a forged `X-Forwarded-For` with several entries, when the
  client address is derived, then the **right-most** entry is used and the client-supplied portion
  is ignored, so varying the header yields no fresh bucket; and given a request with no
  `X-Forwarded-For` at all, then it is counted under one shared identity rather than escaping the
  limit.
- **AC-13a** — Given a request arriving through the Lambda transport from a real ALB event, when the
  client address is derived, then it is the same address the same headers yield under the HTTP
  transport. (This criterion was originally worded against FR5a's shared bootstrap step. `plan.md`
  established there is no app-level setting to share — the derivation is a pure function over
  headers — so the "configured in a path the tests do not execute" failure mode no longer exists.
  What remains worth proving is that the transport that synthesizes its own request object does not
  change the answer.)
- **AC-14** — Given two IPv6 addresses inside the same /64, when both send requests, then they share
  one counter.
- **AC-15** — Given `/auth/login` throttled to its limit from one address, when the same address
  calls `/auth/refresh`, then that call is admitted — the route groups are separate buckets.
- **AC-16** — Given a flood that would exceed any configured limit, when it targets `GET /health`,
  then every response is `200`.
- **AC-17** — Given the counter's store is unavailable, when requests arrive, then they are served
  rather than refused, a degraded-mode event is logged, and the whole request completes within the
  configured store deadline.
- **AC-18** — Given a rollover that makes several store calls and a store slow enough that each call
  approaches the deadline, when the request is served, then the total time stays within the single
  per-request deadline rather than a multiple of it, and no unhandled promise rejection is raised.
- **AC-19** — Given the fallback limiter's entry cap is reached during degraded mode, when a
  previously unseen caller arrives, then it is admitted.
- **AC-20** — Given a defect in the throttling path that raises an unclassified error, when a
  request that would otherwise succeed arrives, then it succeeds and the error is logged, rather
  than returning `503`.
- **AC-21** — Given the store applies backpressure or the rollover attempt budget is exhausted, when
  the request is decided, then it is not refused with `429` on that basis; it degrades like any
  other store failure.
- **AC-22** — Given a successful response from any throttled route, when its headers are inspected,
  then no rate-limit headers are present.
- **AC-23** — Given the published OpenAPI document, when it is inspected, then `RATE_LIMIT_EXCEEDED`
  appears in the `code` enum and the throttled routes document a `429` response.
- **AC-24** — Given a counter item, when its key is inspected, then it is under the throttling
  context's own partition prefix and not under `USER#<accountId>`, and its TTL attribute is two
  windows past its window start.
- **AC-25** — Given a request served in the common case, when the store calls it issued are counted,
  then there is exactly one; and given a request that triggers a rollover, then there are three —
  the conditional increment that failed, the promote, and the increment that followed.
- **AC-26** — Given the environment with none of the throttle variables set, when the service
  starts, then it starts and every throttle value takes its default, and the degraded-mode ceiling
  resolves to the route's own configured limit.
- **AC-27** — Given a refusal or a degraded-mode event, when the emitted log line is inspected, then
  it is structured JSON naming the scope and route group and containing no credential or token.

## Out of Scope

- **Volumetric L3/L4 attacks.** Unanswerable in application code, and amplified rather than reduced
  by a per-request write. Delegated to `specs/004-cloud-infrastructure` (WAF rate-based rules,
  Shield on the ALB).
- **Counting floods of invalid tokens.** An invalid token is refused before any throttle downstream
  of authentication can run. Three implementations were examined and rejected in `brainstorm.md`;
  defending one signature check with one store write costs more than the attack. Same delegation,
  recorded as a known limit.
- **Throttling unmatched paths.** The router refuses a nonexistent path before any guard or
  interceptor runs, so such requests are counted nowhere. Same delegation.
- **`RateLimit-*` headers on successful responses.** Deliberate and reversible; adding them later is
  additive rather than breaking.
- **A bucket per individual route.** Route groups are in scope; six independently tuned limits are
  configuration for its own sake.
- **Any always-on counter store** (Redis, ElastiCache). Would need an ADR arguing its standing cost
  against the constitution's "idle costs nothing" rule.
- **Per-tenant or dynamic limits, and any API for changing them.** Limits are environment
  configuration, not a product surface.
- **Account lockout.** Out of scope for the reason `specs/001-authentication` records: a lockout any
  stranger can trigger is a denial of service against the account holder, and this product has no
  mail path to undo one. Throttling refuses a rate; it never disables an account.
- **Crediting the credentials bucket on a successful sign-in.** Considered during `clarify` as the
  one thing this design could do that a general-purpose limiter cannot, since Stockroom owns both
  the limiter and the authentication outcome. Rejected: it puts a store write on the login success
  path, which pays nothing for throttling today, and it hands an attacker holding one valid account
  a way to renew an address's budget between attempts against other accounts — partially undoing
  the cost asymmetry the feature exists to create.

**Dependencies**

- `specs/001-authentication` — blocks this feature and is complete. Supplies the verified account
  identity, the `@Public()` decorator, the problem-details taxonomy the `429` joins, the key-grammar
  module, the `Clock` port, and the configuration schema pattern.
- `specs/003-product-catalog` — unblocked by this feature; its paginated listing inherits the
  account-scoped limit with no new throttling code.
- `specs/004-cloud-infrastructure` — carries the three delegated cases above. This feature ships
  without it; the boundary is only honest if 004 eventually closes it.

**Resolved during `clarify`** — no branch is left open for `plan-writer`.

- **The FR5 mechanism**, resolved by reading the installed packages rather than by asking. Both
  candidate mechanisms are unusable and are now forbidden in FR5 with the evidence: `req.ip` is
  shadowed by an own property the adapter assigns, and resolves to the empty string under an ALB
  event; `trust proxy: true` resolves the left-most, client-supplied entry. The address is read
  from the header directly, right-most entry.
- **Whether one `UpdateExpression` may read an attribute it also writes**, resolved by probing
  DynamoDB Local: it is accepted and operands read the pre-update item, so the FR16 promote is one
  atomic statement. The probe also established that the item returned on a failed conditional
  arrives in raw `AttributeValue` form (FR15).
- **The degraded-mode ceiling**, resolved with the user: derived from the route's own limit through
  `THROTTLE_LOCAL_FALLBACK_FACTOR` rather than set as an absolute number (FR20a).
- **The public limit values**, confirmed with the user as a starting posture to be moved on
  evidence from FR30's metric, not raised pre-emptively to cover carrier-grade NAT (FR28).
- **Crediting the credentials bucket on successful sign-in**, raised as the deliberate
  anti-convention probe and declined; recorded in `Out of Scope` with the reasoning.

One item remains deliberately deferred rather than open: the DynamoDB behaviours above were
established against **DynamoDB Local**, which is the same environment the integration suite runs in.
`plan-writer` should treat them as verified for the test path and note that the production path
inherits them from the same expression grammar.
