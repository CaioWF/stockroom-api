# Product Requirements Document (PRD)

> Product context (who the user is, what the product is, the north-star metric) lives in the
> brief at `.specify/memory/product.md`. This PRD **references** that brief and records only what
> is specific to THIS feature — do not repeat the user profile or the product's value proposition.

## Problem

- Stockroom has no way to bound what a single caller costs it. Every route is served at whatever
  rate the caller chooses, so one client looping on a bug, one scraper, or one password-guessing
  script consumes the same capacity as every legitimate integration put together.
- The product's central problem (see `product.md`) names per-caller throttling as one of the four
  concerns Stockroom exists to solve once. This feature owns that one. `specs/001-authentication`
  owns sign-in and token expiry; `specs/003-product-catalog` owns pagination.
- It also owns the job-to-be-done the brief states as "keep serving reads while one noisy caller
  hammers the endpoint", which today has no implementation and no owner.
- The abuse target is live now, before the catalog exists. `/auth/register` and `/auth/login` accept
  unauthenticated traffic at any rate, and `specs/001-authentication` deliberately shipped no
  account lockout — a lockout reachable by any stranger would be a denial of service against the
  account holder — leaving credential-guessing bounded by nothing. That PRD records the gap and
  points here.
- The failure this feature prevents is asymmetric. Without it, the cost of abusing Stockroom is one
  packet and the cost of absorbing it is a Lambda invocation, a DynamoDB read, and a signature
  verification. With it, that ratio is capped per caller.

## Hypothesis

- A limit enforced per caller — by account where a verified account exists, by client address where
  one does not — will hold the cost of a hostile caller near constant while leaving normal
  integrations unaware the limit exists.
- A weighted sliding-window counter in the existing DynamoDB table should work because it makes the
  common request cost one conditional write and no read, needs no always-on component to sit idle
  and be paid for, and removes the boundary burst a fixed window admits. The design reasoning,
  the alternatives, and three rounds of adversarial review are recorded in `brainstorm.md`.
- Degrading rather than refusing should work because throttling is resource control, not
  authorization. The north-star metric explicitly discounts a client "throttled into failure", so a
  limiter that converts a counter-table incident into a sign-in outage would cost more of the metric
  than the abuse it prevents.
- The hypothesis is falsifiable in two directions, and both are cheap to observe. If legitimate
  integrations hit 429 in ordinary use — an office behind one NAT renewing tokens, a client paging
  the catalog — the keys or the limits are wrong. If a caller can exceed the configured limit while
  the store is healthy, the counter is wrong.

## User/Context

- Inherits the target user from `.specify/memory/product.md`. This feature narrows it in one way
  that shapes every limit: a "caller" is not always a person or an account. On public routes the
  only identity available is the network address, and behind NAT or CGNAT that address is shared by
  everyone in an office or on a carrier segment. Every public limit is therefore set for the
  aggregate of a shared address, not for one human.
- Usage scenarios specific to this feature:
  - A developer integrating for the first time hits a limit, reads `Retry-After`, waits, and is
    admitted — learning the limit from the API rather than from a support conversation.
  - An office of thirty clients behind one address renews tokens on a schedule and never notices a
    limit exists.
  - A credential-guessing script is refused long before it can enumerate a password, and the
    refusal costs Stockroom less than the attempt costs the attacker.
  - The counter's own storage has an incident, and callers keep signing in.
- Constraints specific to this feature:
  - The deployment target is Lambda behind an ALB. The process freezes between invocations, so
    nothing may depend on a timer firing later; N concurrent instances serve traffic, so nothing
    instance-local can be the limit; and the client address must be derived from the hop the ALB
    appended, never from the string the client sent.
  - The constitution's "idle costs nothing" rule excludes Redis or any always-on counter store
    without an ADR arguing for its standing cost. The counter lives in the existing table.
  - Volumetric L3/L4 attacks are out of scope and cannot be answered in application code — they
    never reach the process, and a limiter that writes per request would amplify them. That boundary
    is named, not silently omitted, and it also carries two smaller cases: floods of invalid tokens
    and floods of unmatched paths, both of which are refused before any throttle can run.

## Success Metric

- **Primary — false rejections at zero.** No caller under its configured limit is refused while the
  store is healthy. This is the metric that ties to the north-star, which counts only integrations
  that successfully read the catalog and explicitly discounts one "throttled into failure". Measured
  by the acceptance criteria in `spec.md`, including the cases that produced no rejection in an
  earlier design and would have shipped one: an office behind a shared address, a caller returning
  after an idle period, and a client that honours the `Retry-After` it was given.
- **Secondary — the limit actually holds.** A caller exceeding its limit is refused, and the refusal
  survives concurrency: N instances counting the same caller must not multiply the limit by N.
  Measured against local DynamoDB with independent clients and independent clocks.
- **Secondary — availability is not traded for control.** A store incident does not raise the error
  rate of `/auth/login`, and does not raise request latency enough to cause an outage by a different
  route. Measured by a fault-injection test at the store port with a bounded latency assertion.
- **Operational, once deployed.** The rate of 429 responses, split by route group and by scope, and
  the rate of degraded-mode events. A degraded rate that is not near zero means the counter's
  storage is the problem, not the callers.

## Dependencies & Interfaces

**Consumes (inputs)** — what this feature depends on to work:

- `specs/001-authentication` → the verified `authClaims` on the request (the account-scoped key),
  the `@Public()` decorator that distinguishes public routes from protected ones, the
  `PROBLEM_CODES` closed set and its exception filter, and the generated OpenAPI document.
- `specs/001-authentication` → `src/shared/persistence/table-keys.ts`, the single owner of the key
  grammar, which must gain a builder for the counter item.
- `specs/001-authentication` → the injected `Clock` port, and the boundary-parsing pattern in
  `src/shared/config/environment.schema.ts`.
- The existing DynamoDB single table → one counter item per (identity, scope, route group), with a
  TTL attribute.
- The ALB → the client address, taken from the hop the ALB appends to `X-Forwarded-For`.

**Exposes (outputs)** — what this feature now offers to others:

- A `429` response carrying `Retry-After` and a `problem+json` body with the new closed-set code
  `RATE_LIMIT_EXCEEDED`, published in the OpenAPI document → every API client.
- Throttling applied by default to any route added later, with no new code at the route
  → `specs/003-product-catalog`, whose paginated listing inherits the account-scoped limit.
- A `@NoThrottle()` decorator, with its own metadata key, for routes that must never be refused
  → the health check and the OpenAPI document route today.
- `ProblemDetailsFilter` and `PROBLEM_CODES` relocated from `src/auth/presentation/` to
  `src/shared/presentation/` → every bounded context that emits an error code, since the taxonomy
  stops being an auth concern the moment a second context uses it.
- Structured degraded-mode and rejection events suitable for alarming → operations.

**Dependencies** — couplings with explicit direction:

- `specs/001-authentication` — **blocks this feature**, and is done. Without a verified account
  identity there is no account-scoped key, and without its problem-details taxonomy there is no
  place for a 429 to land.
- `specs/003-product-catalog` — **unblocked by this feature**. Its listing route is the consumer the
  challenge originally named; building the mechanism first means 003 inherits it with no new code.
  003 does not block this one, which is why the throttle ships against the auth routes instead of
  waiting for a route that does not exist.
- `specs/004-cloud-infrastructure` — **carries what this feature delegates**. The volumetric class
  named out of scope above, and the two smaller cases with it, are answered by WAF rate-based rules
  and Shield on the ALB. This feature can ship without that; the boundary is only honest if 004
  eventually closes it, and this PRD is the record that it was assigned rather than forgotten.

## Out of Scope

- **Volumetric L3/L4 attacks.** Unanswerable in application code and amplified by a per-request
  write. Delegated to `specs/004-cloud-infrastructure` as above.
- **Counting floods of invalid tokens.** The gap is real — an invalid token is refused before any
  throttle downstream of authentication can run — and three implementations were examined and
  rejected in `brainstorm.md`. Defending one signature check with one DynamoDB write costs more than
  the attack does. Delegated to the same infrastructure layer, and recorded as a known limit rather
  than left implied.
- **Throttling unmatched paths.** The router refuses a nonexistent path before any guard runs, so
  those requests are counted nowhere. Cheap to serve, same delegation.
- **`RateLimit-*` headers on successful responses.** Deliberate, and the reasoning is recorded: a
  client discovers the limit only by hitting it. Reversible later, since adding headers to 200
  responses is additive rather than breaking.
- **A bucket per individual route.** Route *groups* are in scope; six independently tuned limits are
  configuration for its own sake.
- **Any always-on counter store.** Redis or ElastiCache would need an ADR arguing its standing cost
  against the constitution's "idle costs nothing" rule. Not attempted here.
- **Per-tenant or dynamic limits, and any API for changing them.** Limits are environment
  configuration, not a product surface. A merchant cannot raise its own limit, and there is no
  admin route to raise it for them.
- **Account lockout.** Still out of scope, for the reason `specs/001-authentication` records: a
  lockout any stranger can trigger is a denial of service against the account holder, and this
  product has no mail path to unlock one. Throttling refuses a rate; it never disables an account.
