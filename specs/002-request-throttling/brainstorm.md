---
status: approved
feature: 002-request-throttling
date: 2026-09-05
---

# Request throttling — Brainstorm

> The approved design + the reasoning trail that produced it. Upstream of `spec.md`/`plan.md`:
> this is where the **why this shape** lives (exploration, trade-offs, what was left open); the
> *what* and the *how* live in the spec and plan templates. No code — contracts and intent, not
> function bodies.
>
> Revised 2026-09-05 after three `doubt-driven-development` cycles, the skill's full budget. Each
> reviewer saw the design and its contract without the reasoning that produced them. The first broke
> it in seven places, the second in five more, the third in five more again — and each round broke
> the previous round's repairs. Guard placement, the rollover protocol, the store-error taxonomy,
> route scoping, the `Retry-After` derivation, the deadline mechanics and the degraded-mode rules
> are all consequences of those passes. The last section indexes every defect and names which round
> found it, because several rules below look arbitrary until you know which failure they answer.

## Understanding

Per-caller request throttling for the Stockroom API, built as a cross-cutting capability rather
than as a property of one endpoint. It ships applied to the existing auth routes and is inherited
by the paginated catalog endpoint that feature 003 will add.

The originating challenge (`SWE_Challenge-Back-TREM.pdf`, Stone/Renda Extra) ties rate limiting to
the product listing route: *"A API de listagem deverá ser paginada e incorporar algum mecanismo de
rate-limit para lidar com um volume significativo de requisições."* That route does not exist yet.
Three sequencings were possible; the chosen one builds the mechanism first because
`/auth/login` and `/auth/register` are a live abuse target today, so the throttle ships with
a real consumer instead of a speculative one, and 003 inherits it without new code.

Assumptions made where the challenge was silent:

- **The threat is application-layer abuse, not DDoS.** "Volume significativo de requisições" is
  read as abuse by an identifiable caller: password guessing at scale, catalog scraping, a client
  looping on a bug, a noisy neighbour. Volumetric L3/L4 attacks are out of scope and cannot be
  answered in application code — they never reach the Nest process. Worse, a limiter that writes
  to DynamoDB per request *amplifies* such an attack, since each hostile request becomes a Lambda
  invocation plus a write. The counter would be a cost surface, not a defence. Mitigation for that
  class is named explicitly in the spec as an infrastructure concern (Shield Standard, already
  active on the ALB; WAF rate-based rules) so its absence reads as a boundary, not an oversight.
  Two further things are deliberately delegated to that same boundary: floods of *invalid tokens*
  (see "Counting authentication failures") and floods of *unmatched paths* (see "Guards and
  placement").
- **Throttling is resource control, not authorization.** This is what makes fail-open the correct
  posture below; the constitution's default-deny rule governs authorization decisions, which this
  is not.
- Limits are a starting posture, tunable per environment, not a product commitment.

## Investigation

Read before designing, and what each produced:

- `.specify/memory/constitution.md` — decides three things outright, so they were never presented
  as open. It names the port `RateLimitStore` literally; its "idle costs nothing" principle rules
  out Redis/ElastiCache (any always-on component must earn its standing cost in an ADR); and
  "time and randomness are injected" requires the window to read the existing `Clock` port so it
  is testable without waiting. Also fixes the module shape: bounded context first, technical layer
  second (`src/throttling/domain/`, never `src/domain/throttling/`), and no `@aws-sdk` import
  outside an `infrastructure/` directory.
- `.specify/memory/product.md` — "keep serving reads while one noisy caller hammers the endpoint"
  is a job-to-be-done, and the north-star metric explicitly discounts a client "throttled into
  failure". Both argue for a limiter that degrades rather than one that fails hard.
- `src/lambda.ts` and `src/auth/presentation/jwt-auth.guard.ts` — the deployment target is Lambda
  behind an ALB, which makes "where the counter lives" the central decision. Both files already
  keep state across warm invocations (`appPromise` memoized at module scope; `verificationKeyCache`
  as a `Map` on a guard singleton), which is the precedent that makes an instance-local fallback
  limiter viable here. The guard also throws `UnauthorizedException` from inside `canActivate`,
  which aborts the guard pipeline — the fact that ruled out a post-auth throttle guard counting
  authentication failures.
- `src/auth/presentation/problem-details.filter.ts` — the closed `PROBLEM_CODES` set and the
  status-mapping table a 429 must join; its `exposeMessage` allow-list is the pattern a new row
  follows. Two properties of it are constraints rather than details: `catch()` returns `void` and
  Nest's `ExceptionsHandler` does not await a filter, so the filter cannot perform reliable I/O on
  Lambda; and it is registered `@Catch()` with a `SERVICE_UNAVAILABLE` default mapping, so any
  unclassified throw from anywhere upstream becomes a 503.
- `src/shared/persistence/table-keys.ts` — the single place a PK/SK pair is assembled, and the
  fact that `USER#<accountId>` already partitions both the profile and every refresh token.
- `src/shared/config/environment.schema.ts` — the boundary-parsing pattern for new variables, and
  the fact that a missing required variable throws at bootstrap, which `lambda.ts` turns into a
  blanket 503.
- `src/health/health.controller.ts`, `jwks.controller.ts`, `openapi.controller.ts`,
  `auth.controller.ts` — the full `@Public()` inventory: six routes, not three.
- `test/e2e/auth/support/build-test-app.ts` — boots through
  `Test.createTestingModule(...).createNestApplication()`, so neither `main.ts` nor `lambda.ts` runs
  under e2e. Whatever they configure is untested unless it moves into shared bootstrap.
- `@nestjs/throttler@6.5.0`, unpacked and read (`dist/throttler.service.js`, `dist/*.d.ts`) rather
  than recalled — see "Approaches considered".

## Approaches considered

### Counter location

- **DynamoDB, behind a port** — correct across instances, pay-per-use, reuses the existing single
  table. Costs a write per request and a few milliseconds of latency. **Chosen**, and effectively
  pre-decided by the constitution.
- **In-memory per instance** — free and instant, but N concurrent Lambda instances mean N
  independent buckets, so the effective limit is N × the configured one. Not demonstrable and not
  honest. Survives only as the degraded fallback described below.
- **Redis / ElastiCache** — the conventional answer, rejected on the standing-cost principle
  without an ADR arguing for it.

### Window algorithm

- **Fixed window counter** — one atomic `ADD` per request, TTL cleans up, roughly thirty lines.
  Its known defect is boundary burst: at 100/min, 100 requests at second 59 plus 100 at second 61
  pass, twice the limit inside two seconds.
- **Sliding window log** — exact, but the item grows with traffic and the abusive caller is
  precisely the one who inflates it most. Disproportionate.
- **Token bucket** — the model clients most expect, and it yields a precise `Retry-After`. But
  time-based refill does not fit an atomic `ADD`; it needs a conditional update with retry or
  optimistic locking, which is the largest race surface of the four.
- **Sliding window counter** — **chosen**. Weights the previous window by the elapsed fraction of
  the current one, reaching near-log precision at roughly fixed-window cost: one charged write in
  the common case, three at a rollover. It removes the boundary burst, and it answers the
  challenge's stated evaluation criterion of "competência em lógica eficiente" with a decision that
  can be defended rather than one that merely works.

The `Retry-After` weakness the token bucket would not have had is real, was got wrong twice, and is
answered explicitly under "Errors" rather than waved away.

### Library versus own implementation

`@nestjs/throttler@6.5.0` is peer-compatible with the installed Nest 11 and was inspected at the
source before judging, per `source-driven-development`.

- It does support a custom store: `ThrottlerStorage.increment(key, ttl, limit, blockDuration,
  throttlerName)`, injectable through the module's `storage` option, and `getTracker` is
  overridable, which would have covered the hybrid key.
- But its default storage is unusable on this platform. It is neither fixed nor sliding window:
  each hit schedules a `setTimeout(ttl)` that decrements the counter by one (`setExpirationTime`).
  Lambda freezes the process between invocations, so those timers do not fire reliably and the
  counter never comes back down. The single most valuable part of the package is the part that
  does not work here.
- Its record shape, `{totalHits, timeToExpire, isBlocked, timeToBlockExpire}`, models "count plus
  block". A weighted sliding window produces a fractional count that only fits there rounded, and
  `blockDuration` is a concept this design does not want.

**Chosen: own implementation** over the `RateLimitStore` port the constitution names. What would
have been reused is unusable; what remains is a guard, an interceptor and a decorator. In exchange
the window arithmetic stays in a pure domain module, testable without a framework, and the design
gains no new dependency.

### Caller identity

- **Hybrid per route, with a route-group dimension** — **chosen**. A protected route counts by
  `accountId` from the already verified token; a public route counts by client IP *and* the route
  group it belongs to, because the six public routes have nothing in common but their public-ness.
- **IP everywhere** — one rule, simple to explain, but clients behind a shared NAT share a bucket
  and an attacker rotating IPs escapes. It also discards a stronger identity that is available for
  free on protected routes.
- **`accountId` everywhere** — leaves `/auth/login` and `/auth/register` unprotected, which are
  exactly the routes password guessing targets and exactly where no `accountId` exists.
- **One IP bucket for all public routes** — an earlier shape of this design, and wrong. A corporate
  NAT with thirty clients doing a routine token refresh every fifteen minutes reaches thirty
  requests a minute from one address, which a 10/60s shared bucket rejects — an office locked out of
  `/auth/refresh` with zero abuse present. Credential attempts and token renewals have different
  legitimate rates and need different limits.
- **A bucket per individual route** — maximum granularity, six limits to justify and keep tuned.
  Rejected as configuration for its own sake.

### Counting authentication failures

Considered at length and **dropped**, after two rounds of trying to make it work.

The gap is real: `JwtAuthGuard` rejects an invalid token with 401 before any throttle downstream of
it runs, so an attacker hammering a protected route with garbage tokens burns Lambda invocations
and signature verifications uncounted. Three implementations were examined:

- **Increment from `ProblemDetailsFilter` on a 401.** Unimplementable here. Nest's
  `ExceptionsHandler` calls a filter's `catch()` without awaiting it, and `catch()` returns `void`;
  a DynamoDB write started there is a floating promise, and Lambda freezes the microtask queue when
  the response returns. The counter would land somewhere between zero and the request count,
  non-deterministically. Awaiting it instead puts a full store round-trip on the latency of every
  401 and still leaves the read side non-atomic — a pre-auth guard that reads a counter written
  later and elsewhere is check-then-act across a process boundary, so a concurrent burst all reads
  the same stale value and all passes. The filter also has only an `ArgumentsHost`, with no
  `getHandler()`, so it cannot derive the same key the reader uses without reimplementing the
  client-IP policy and the route grouping independently.
- **Increment on every 401.** Worse than useless: of the four 401 rows in `PROBLEM_ROWS`, only
  `INVALID_ACCESS_TOKEN` comes from token verification. `INVALID_CREDENTIALS` and
  `INVALID_REFRESH_TOKEN` are ordinary sign-in failures, so a user who mistypes a password twenty
  times would be locked out of every protected route afterwards, with a valid token in hand.
- **An atomic per-IP ceiling on every protected request, pre-auth.** Correct and race-free, and
  the only version that works — at the price of a second write on every protected request forever,
  including 003's paginated catalog listing, which is a read endpoint.

**Chosen: drop it, and name the residue.** Defending a signature verification with a DynamoDB write
costs more than the attack does; verifying a garbage token is one signature check against a cached
key. Invalid-token floods are therefore uncounted at the application layer and bounded by the same
infrastructure layer already named as the boundary for volumetric abuse. The spec states this as a
known limit rather than leaving it implied.

### Store-failure posture

- **Degrade rather than fail hard** — **chosen**. Throttling is resource control, not authorization;
  turning a counter-table blip into a total outage converts a partial incident into a full one, and
  the north-star metric explicitly discounts clients throttled into failure.
- **Fail-closed everywhere** — guarantees no limit is ever exceeded, at the price of `/auth/login`
  going dark when the counter table does. Treats a resource control as an authorization decision.
- **Fail-closed on public routes only** — preserves the attacker's highest-value target, but
  asymmetric semantics need explaining and testing in both modes, and login outage is the most
  visible failure symptom available.
- **Classify store failures finely and answer 429 to some of them** — tried across two revisions and
  abandoned. The reasoning and the wreckage are under "Store errors", because the two intermediate
  positions were each worse than either endpoint.

### Rejected requests and the counter

The counter is incremented before the decision is made, so a rejected request also counts. Kept,
because a caller who keeps retrying should not get a free probe per rejection. But the naive form
is a denial-of-service primitive against innocent third parties: with an unbounded counter, one
abuser on a CGNAT egress address pins the weighted estimate arbitrarily far above the limit at a
cost of one packet per rejection, and everyone behind that address is locked out for as long as the
abuser cares to continue.

**Chosen: a saturation ceiling, enforced in the write condition and honoured at evaluation.** The
policy weights `min(current, cap)` and `min(previous, cap)` with `cap = limit ×
THROTTLE_COUNTER_SATURATION_FACTOR` (default 2), which bounds recovery for everyone sharing the
address to under one window after the abuse stops — at factor 2 the estimate falls below the limit
once the current window is half elapsed — rather than leaving it unbounded. The increment is
additionally conditioned on `current_count < :cap`, so once a caller is far over the ceiling the
conditional fails and no data is written. That bounds the stored value. It does **not** make the
abusive request free: DynamoDB charges write capacity for a conditional write that fails, so the
over-cap path still costs one unit, the same as an admitted request. The benefit is a bounded stored
counter, not a cost asymmetry, and an earlier revision claiming otherwise was wrong.

### Response shape

- **`RateLimit-*` headers on every response** (IETF draft naming) would let a well-behaved client
  self-regulate before being rejected, which is the only variant that reduces abusive traffic
  rather than merely refusing it.
- **Headers only on the 429** — **chosen** by the user. Simpler, and keeps the guard off the
  success path's response object. The cost is accepted knowingly: a client discovers the limit
  only by hitting it. The decision is cheap to reverse, since adding headers to 200 responses
  later is additive rather than breaking.

## Open Decisions

- **Trusted `X-Forwarded-For` derivation.** The principle is closed and sharper than it was: the
  ALB *appends* the real peer to whatever the client already sent, so the trustworthy entry is the
  **right-most**, and the common idioms are all the bypass. `req.ip` under
  `@codegenie/serverless-express` is synthesized; Express's `trust proxy: true` resolves to the
  left-most untrusted entry; `xff.split(',')[0]` is the same bug written by hand. `main.ts` sets no
  `trust proxy` today, so nothing in the repo currently makes any of these safe. The exact
  mechanism — `trust proxy` with a numeric hop count versus reading the header directly, and how it
  behaves under `serverless-express` — must be verified against the installed Express and adapter
  versions at `plan-writer` through `source-driven-development`. Recalling this from memory is how
  the bypass gets shipped, and the same primitive lets an attacker pin an innocent address into a
  lockout bucket. Whatever the mechanism turns out to be, it must live in a shared bootstrap step
  applied by `main.ts`, `lambda.ts` **and** the e2e app builder — otherwise a unit test on the
  client-IP policy asserts whichever header index the implementer chose while never exercising the
  app-level setting that decides whether the address is forgeable at all.
- **Whether one `UpdateExpression` may read an attribute it also writes.** The promote wants
  `SET previous_count = current_count, current_count = :one`. DynamoDB evaluates operands against
  the pre-update item, which would make this correct and atomic, but "two actions on the same path"
  is a documented rejection and it is unclear whether an operand read counts as an action. Verify
  against the installed SDK and DynamoDB Local at `plan-writer`, not from memory. If it is rejected,
  the fallback writes the value read back from `ALL_OLD`, which can lose a concurrent increment
  (a lagging instance may `ADD` to `current_count` between the read and the promote, and the
  condition on `window_start` does not protect it) and so needs the promote condition tightened to
  cover `current_count` as well.
- **Fallback ceiling value.** `THROTTLE_LOCAL_FALLBACK_LIMIT` has no principled default yet; it
  depends on expected concurrency, which is unknown until the Terraform for the Lambda exists. It
  ships with a conservative default so a partial config deploy cannot fail bootstrap, and is
  treated as an operational knob, not a contract. Confirm during `clarify`.
- **The uncounted invalid-token flood.** Dropped deliberately and deferred to the WAF layer.
  Revisit if the Terraform lands without a rate-based rule, or if 003 makes protected-route abuse
  cheap enough to matter.

## Outline of the solution

### Boundary

Throttling is a new bounded context, `src/throttling/`, laid out domain-first per the constitution:
`domain/` (the window value object, the policy that weights and saturates it, the decision type,
and the `RateLimitStore` port), `application/` (the use case that composes store and policy),
`infrastructure/` (the DynamoDB adapter and the instance-local fallback limiter), and
`presentation/` (the guard, the interceptor, the client-IP policy, the exemption decorator, the
typed error).

The weighting arithmetic lives in the domain and reads the injected `Clock`, so every window
behavior is unit-testable without a framework, without network, and without sleeping.

### Guards and placement

Two entry points, and neither depends on provider registration order — which matters, because
`JwtAuthGuard` is a global `APP_GUARD` and the relative order of two `APP_GUARD` providers declared
in different modules is an implicit property that an unrelated import reshuffle can silently invert.

- **`ThrottleGuard`** handles IP-keyed routes. It runs only where `JwtAuthGuard` returns
  immediately, so its position among the guards is not load-bearing.
- **`AccountThrottleInterceptor`** handles account-keyed routes. It is an interceptor rather than a
  guard because Nest runs every guard to completion before any interceptor, so "after
  authentication" is guaranteed by the framework's phase order. (Interceptors have an implicit
  ordering among themselves too; the phase boundary is what makes this safe, not an absence of
  ordering — an earlier revision's justification overstated it.) It reads `request.authClaims`, runs
  increment-and-decide, and rejects before calling `next.handle()`.

  The consequence is accepted and worth naming: by the time the interceptor rejects, the request has
  already paid signature verification and, on a cold key cache, an SSM round trip. The account
  throttle shapes traffic without shedding that load. Shedding it would mean throttling before
  authentication, which needs an IP-keyed pre-auth counter — considered and dropped above for
  costing a second write on every protected request.

A route is throttled by default; exemption is explicit, enumerated, and applied with a dedicated
`@NoThrottle()` decorator carrying **its own metadata key** — never inferred from `@Public()`, which
would silently exempt `register`, `login`, `refresh` and the JWKS route along with the two that
should be. `/health` is exempt and non-negotiable: its own file documents that a 429 is not a 2xx
and so would make the ALB deregister the target, and all ALB nodes in an availability zone share a
source subnet. The OpenAPI document route is exempt as a static asset. `/.well-known/jwks.json` is
not exempt but sits in its own route group with a limit set for cache-miss fan-in, not for humans.

One hole in "throttled by default" is structural, and stated rather than fixed: Nest's router raises
`NotFoundException` for an unmatched path before any guard or interceptor runs, so a flood of
nonexistent paths is counted nowhere. Each such request is cheap to serve — no store access, no
verification — and belongs to the same volumetric class already delegated to the WAF.

### Algorithm and storage

One item per (identity, scope, route group), holding `window_start`, `current_count`,
`previous_count`, and a TTL attribute. Keys are built in `src/shared/persistence/table-keys.ts` — a
context never invents its own key grammar — under a partition prefix of the throttling context's
own, **never** `USER#<accountId>`. Sharing that partition would put an account's request flood on
the same per-partition-key write budget as its own login and refresh-token rotation, so abuse would
degrade the victim's authentication. The scope is a closed union (`ip`, `account`).

IPv4 identities are the address. IPv6 identities are the **/64 prefix**, canonically rendered: a
single subscriber routinely holds 2^64 addresses, so keying the full address is both a bypass and
an unbounded item generator.

The common path is one `UpdateItem`, conditioned on
`(attribute_not_exists(PK) OR window_start = :currentStart) AND (attribute_not_exists(current_count)
OR current_count < :cap)`, returning `ALL_NEW`. That single condition covers a first-ever request,
an increment inside the live window, and the saturation ceiling.

On `ConditionalCheckFailedException` the request carries `ReturnValuesOnConditionCheckFailure:
ALL_OLD`, so the rejected write hands back the stored item rather than only the fact of failure —
without it the adapter would need a third round trip and a read-modify-write race to learn which
clause it lost to, and the two failure causes would be indistinguishable. From the returned item:

- **`current_count >= cap` in the live window** — the caller is over the saturation ceiling.
  Reject. (The failed conditional is still charged; see the operation count below.)
- Otherwise the window rolled over. Compute how many windows elapsed between the stored
  `window_start` and the caller's:
  - **exactly one** — promote `current_count` into `previous_count`.
  - **two or more** — set `previous_count` to **zero**. Promoting unconditionally was the design's
    worst arithmetic bug: a caller who sent 500 requests, was throttled, went away for forty minutes
    and came back would have those 500 promoted at a weight near 1.0 and be rejected on their first
    request after a completely idle window. TTL does not save this — DynamoDB TTL deletion is
    best-effort within roughly 48 hours, so the stale item is still there.
  - **zero or negative, within one window** — the stored window is at or slightly ahead of the
    caller's, which is clock skew between Lambda instances at a boundary. Do not promote; adopt the
    stored window as current and increment against it. Promoting here would move a live count into
    `previous` and reset `current`, wiping the live window.
  - **further ahead than one window** — not skew, and adopting it is an unbounded forward ratchet.
    An instance whose clock runs five minutes fast pins `window_start` into the future; every
    correctly-clocked instance then computes a negative elapsed count, adopts that future window,
    and keeps incrementing one `current_count` straight through five real windows with no promote
    and no reset, so a caller at a third of the limit in every real window is rejected anyway. TTL
    does not rescue it, because the TTL is derived from the adopted window; and once that pinned
    counter reaches the cap, every later request is refused as over-cap for minutes. Beyond the
    one-window tolerance the stored item is treated as unusable and reset to a fresh window with
    `previous_count` zero, conditioned on the stored start so the reset is single-shot.

The promote is a second `UpdateItem` conditioned on `window_start = :storedStart`, which is what
makes it single-shot: of several invocations racing to roll the same window over, exactly one
succeeds; the losers re-enter the branch and increment against the window that won.

The honest operation count is therefore **one charged write in the common case and three at a
rollover** — the conditional increment that fails, the promote, and the increment that follows it —
not the "one, two" an earlier revision claimed. DynamoDB charges capacity for a conditional write
that fails, and the resulting exception carries no `ConsumedCapacity`, which is why the obvious way
to measure this understates it (see Verification).

**Every conditional failure re-enters the same branch with fresh `ALL_OLD`.** An earlier revision
allowed a single blind retry, and it broke under straddling clocks: two instances in different
windows both lose their promote to a third, the blind retry re-issues the original increment against
a window that has already moved, and the request falls through to the failure path — losing an
increment and raising a store-outage alarm against a perfectly healthy store. The loop is bounded at
a small attempt count instead, and exhaustion degrades exactly like a store failure, described
below. It is **not** waved through: an earlier revision admitted an exhausted request and logged it
on a counter deliberately excluded from the outage alarm, which turned contention into a silent
bypass with the worst possible shape, since contention on a single item is produced by precisely the
flood being throttled.

The AWS SDK's default retry strategy is disabled for this client. `ADD current_count :one` is not
idempotent, so an SDK retry after a lost response double-counts, inflating the count exactly when
load is high enough to cause timeouts. With retries off, a timeout is unambiguously "unknown
outcome" and degrades.

Timeouts are budgeted **per request, not per call**. A single request can make several store calls,
so a per-call timeout multiplies under an outage: each invocation stalls for the sum, Lambda
concurrency climbs, and requests hit the ALB idle timeout and return 502 — the outage the fail-open
posture exists to prevent, arrived at by a different road. The use case carries one deadline for all
of its store work and degrades the moment it is exceeded, whatever call is in flight.

The in-flight call is **aborted**, not abandoned. Racing a timer against the promise and walking
away leaves a live promise with no handler; when it later rejects — a late conditional failure, a
socket error, a 5xx — that is an unhandled rejection, and Node's default terminates the process,
killing every concurrent invocation in the container. The command carries an `AbortSignal` driven by
the deadline, and any promise the deadline outruns still gets a terminal handler attached, so the
mechanism added to satisfy the fail-open posture cannot become the outage it was meant to prevent.

One loss is accepted rather than solved: a deadline that expires between a landed promote and its
follow-up increment loses that increment, and the item is left internally consistent so no later
request detects it. Under a store slow enough to trip the deadline this recurs at window boundaries.
The alternative is to block until the rollover completes, which is the latency behavior the deadline
exists to prevent.

The decision weights the saturated previous count by the fraction of the previous window still
covered by the current window's elapsed time, adds the saturated current count, and compares against
the limit.

A TTL attribute expires each item **two** windows past its `window_start`. One window is wrong: the
item would become deletable exactly when the next window opens, which is the window in which
`previous_count` is the entire defence against the boundary burst, and a deleted item is
indistinguishable from a first-ever request — the count restarts at one with no previous, which is
the 2× burst the algorithm was chosen to prevent. TTL is a cost control, never a correctness
mechanism, and correctness here depends on the item being *retained*, which the elapsed-window
arithmetic cannot supply once there is nothing left to read.

### Store errors

The adapter classifies rather than catching broadly, but the classification is far coarser than two
earlier revisions', because the fine ones were unsound.

| Class | Examples | Handling |
|---|---|---|
| Protocol | `ConditionalCheckFailedException` | Rollover / over-cap path above. Never an error. |
| Degraded | contention, backpressure, timeout, 5xx, network error | Local ceiling applies. Logged. |

Two distinctions were tried and removed. The first was "backpressure against *this* key means the
caller floods, so answer 429; throttling spread across keys means the table is ramping, so fail
open", decided from an instance-local tally of recent throttle-class errors. That heuristic cannot
work. A cold instance's tally is empty, so the first `ThrottlingException` it sees is one of one for
that key and trivially "dominates", making 429 the default verdict for a caller nowhere near the
limit — during an on-demand ramp, which is both the event the heuristic was meant to distinguish and
the moment the fleet is fullest of cold instances. A minimum-sample threshold makes the branch dead
code on instances that serve a handful of requests each. An instance serving a fraction of the
traffic cannot separate "this key is hot fleet-wide" from "I happened to serve this key", and no
amount of local state changes that. The second was the separate "contended" class described above.

Both now degrade to the same place the outage path already had: **the instance-local ceiling
applies, and the request is metered rather than waved through**. This is an honest statement of what
is knowable — when the store cannot give a global count, a coarse per-instance ceiling is the only
count there is — and it keeps bookkeeping from turning a would-succeed request into a 429.

An unrecognized error class is treated as degraded and logged with its name.

**A throw from anywhere else in the throttling path is caught and the request admitted.** The table
governs the adapter; it says nothing about a `TypeError` in the weighting arithmetic over a
malformed stored item, a bad `window_start` type from the document client, or a throw from the
client-IP policy, the key builder or the local limiter. `ProblemDetailsFilter` is `@Catch()` with a
`SERVICE_UNAVAILABLE` default mapping, and an interceptor that throws before `next.handle()` reaches
it — so without a wrapper, a bug in the limiter turns a request that was going to return 200 into a
503. Both entry points wrap their whole throttling path in a fail-open boundary that logs and
proceeds. Resource control never decides a request by failing.

### Degraded mode

Degraded mode covers everything in the table's second row — an outage, contention, and backpressure
alike. The request proceeds, the event is logged as structured JSON with an error counter suitable
for alarming, and the instance-local limiter applies as a coarse ceiling. Under sustained contention
that ceiling is the only limit in force.

- It applies **only** in degraded mode. Applying it always would reject callers who are under the
  global limit. It therefore starts cold at the instant an outage begins, and the first burst of an
  outage is unmetered. That is accepted: it is a ceiling, not a limit.
- Expiry is lazy, evaluated on read. A `setInterval` sweep would not fire on a frozen process.
- Entries are capped, and when the cap is reached the limiter **admits** rather than rejects. An
  earlier revision rejected unknown identities on a full cache to close an eviction bypass; that
  cure was worse than the disease. IPv6 identities are /64 prefixes, so every residential subscriber
  is a distinct one and the cache fills within seconds of an outage beginning — cache-full is the
  *steady state* of degraded mode, not an edge, and rejecting there turns a counter-table outage
  into a total one for every caller the instance has not seen.
- The consequence is stated rather than papered over: an attacker rotating source addresses evicts
  their own entry and escapes the fallback. This is a best-effort ceiling for ordinary callers
  during an outage, not a defence against a deliberate attacker; a deliberate attacker during a
  store outage is a WAF problem, consistent with the boundary drawn in "Understanding".
- The ceiling is documented as degraded, never as equivalent. With N warm instances the effective
  limit is N × the local ceiling, and N tends to *rise* during a store outage as requests slow and
  concurrency grows — the fallback is weakest precisely when it is most needed.

### Errors and the shared taxonomy

A rejection answers 429 with `Retry-After` and a `problem+json` body carrying a new closed-set code
`RATE_LIMIT_EXCEEDED`. No rate-limit headers are emitted on successful responses.

`Retry-After` needs stating, because a weighted sliding window has no window edge at which the
caller becomes eligible and a wrong value is worse than none — a compliant client retries, is
rejected again, and its compliant retry increments the counter. Three properties fix the derivation,
and each comes from a defect an earlier revision shipped:

- **It is solved against the saturation cap, not against the counts observed at rejection.** The
  counter keeps growing after the 429 is sent — the caller's own retries, or anyone else behind the
  same address or account — so any value derived from the snapshot is stale before it arrives. At
  limit 10 and cap 20, a snapshot-derived answer of "the rest of this window" puts the obedient
  client's retry exactly where `previous` has since reached 20 at weight 1.0, and it is rejected.
  Assuming the worst case the cap permits makes the value conservative by construction: it can be
  longer than strictly necessary, never shorter.
- **It is solved for admission after the increment, not before it.** Admission is decided on the
  post-increment count, so the smallest instant at which the estimate merely *equals* the limit is
  still a rejection for the request that asks. The inversion targets strict admission with the
  retry's own increment included.
- **It spans the window boundary when it has to.** When the current count alone already meets the
  limit, no instant inside this window qualifies, and the answer is the remainder of the current
  window **plus** the time the inversion yields once that count has been promoted into `previous`.
  Returning only the remainder was provably always short — at the start of the next window the
  promoted count is at or above the limit and the weight is 1.0.

The emitted value is the ceiling of that, clamped to at least one second and at most three windows.
The clamp sits above the maximum the correct derivation can produce, so it bounds a pathological
value without ever silently hiding a short one.

This forces a refactor the feature cannot avoid. `PROBLEM_CODES` and the exception filter currently
live in `src/auth/presentation/problem-details.filter.ts`, but they stop being an auth concern the
moment a second context emits a code. They move to `src/shared/presentation/`, and
`AuthExceptionFilter` is renamed `ProblemDetailsFilter`. The OpenAPI document's `code` enum is
generated from that same array, so the published contract cannot drift from what the filter emits.
The generated document also gains the 429 responses. The filter performs no I/O — see "Counting
authentication failures" for why that is a constraint rather than an omission.

### Configuration

Per route group and scope: `THROTTLE_CREDENTIALS_LIMIT` (10) over
`THROTTLE_CREDENTIALS_WINDOW_SECONDS` (60) for `/auth/register` and `/auth/login`;
`THROTTLE_REFRESH_LIMIT` (60) over the same window for `/auth/refresh`; `THROTTLE_JWKS_LIMIT` (120)
for the key set; and `THROTTLE_AUTHENTICATED_LIMIT` (100) over
`THROTTLE_AUTHENTICATED_WINDOW_SECONDS` (60) for account-keyed protected routes. Ten sign-in
attempts per minute per IP is generous for a human and useless for an attacker; sixty refreshes
accommodates an office behind one NAT; one hundred requests per minute per account accommodates a
client paging the catalog without permitting bulk scraping. Degraded mode adds
`THROTTLE_LOCAL_FALLBACK_LIMIT` and `THROTTLE_LOCAL_CACHE_MAX_ENTRIES`; the saturation ceiling is
`THROTTLE_COUNTER_SATURATION_FACTOR` (2); the store budget is
`THROTTLE_STORE_DEADLINE_MILLISECONDS`.

**Every one of them carries a default.** `environment.schema.ts` makes each field required unless
wrapped in `positiveIntegerWithDefault`, `parseAppConfig` throws synchronously, and `lambda.ts`
turns a bootstrap throw into a blanket 503 — so a partially applied throttle config would take the
whole service down. They are also added to `.env.example`, which otherwise breaks every existing
local and e2e run the moment the schema grows.

### Verification

The plan is written against the properties, not against the code. Several steps exist in their
current form only because an earlier version of them could not have failed on a broken
implementation — three rounds of review kept finding tests that agreed with the design and passed
over the behavior.

- **Unit** — the weighting arithmetic and its saturation; the elapsed-window branch, all four cases
  (one window, many windows, a stored window slightly ahead, a stored window beyond the skew
  tolerance and therefore reset); the over-cap branch; the `Retry-After` inversion, asserted by
  *simulating the retry at the returned instant against a counter that has since grown to the cap*
  rather than by asserting the number, so neither the stale-snapshot nor the off-by-one-increment
  version can pass; eviction, the entry cap and the admit-when-full rule in the local limiter;
  client-IP derivation against a forged `X-Forwarded-For` and IPv6 /64 folding; the interceptor's
  and the guard's key selection per route kind; the store-error classification; and the fail-open
  boundary, driven by a limiter that throws a plain `TypeError`, asserting the request still
  succeeds rather than becoming a 503.
- **Integration**, against local DynamoDB — window rollover through the real conditional protocol;
  the boundary case a fixed window gets wrong, exercised *across a rollover* by advancing the
  injected `Clock`, since a correct weighting function on top of a broken promote still admits the
  burst; a promote race driven by independent store clients with independent `Clock` readings and
  independent fallback limiters, asserting no increment is lost and that the degraded-path log line
  was never emitted — an observable, not an inspection of the limiter's internals; a rollover under
  straddling clocks, and one under a clock far enough ahead to trigger the reset branch, which is
  what the ratchet needed and the single-process happy path never produces; the TTL attribute
  asserted by reading its value, not by waiting for a deletion DynamoDB performs on its own
  schedule.
- **Operation counting.** `ReturnConsumedCapacity` on successful responses cannot do this: DynamoDB
  charges a conditional write that fails, and the resulting exception carries no `ConsumedCapacity`,
  so an assertion built from successes alone measures one and two, agrees with the wrong claim, and
  passes on the real behavior. The count is asserted at the adapter's call site — how many
  `UpdateItem` commands were issued, successful or not — against one in the common case, three at a
  rollover, one over the cap.
- **The deadline is asserted as a total, not per call.** A stub that delays once past the budget
  passes identically on a per-call timeout, which is the defect. The stub delays just under the
  budget on each of the three calls a rollover makes, and the assertion is that the whole request
  still finishes inside the budget, succeeds, and leaves no unhandled rejection behind.
- **End-to-end** — a 429 after the limit on `/auth/login` with the `problem+json` shape, the code
  and `Retry-After`; then, having captured that value, *continuing to send until the counter reaches
  the saturation cap* before retrying at the captured instant, and asserting admission — without the
  extra traffic the snapshot-derived value and the correct one coincide and the test proves nothing;
  `/auth/refresh` still admitted while `/auth/login` is throttled, proving the route groups are
  separate buckets and that exemption is not keyed off `@Public()`; `/health` staying 200 under a
  flood.
- **A "known e2e gap" claimed here through three drafts, and it was not real.** This bullet used to
  say the per-account bucket could only be covered one layer down, because a successful login needs
  real AWS SSM and there is no Parameter Store emulator. `analyze` checked it against the suite
  instead of against `CLAUDE.md`'s prose: that note is about running the app by hand.
  `test/e2e/auth/support/build-test-app.ts` overrides both key providers with an in-memory RS256
  pair, and `login.e2e-spec.ts:42` and `me.e2e-spec.ts:58` already assert a successful login and an
  authenticated call on it. The account-scoped path is covered end to end like everything else. Kept
  here rather than deleted because three adversarial cycles read past the claim without testing it —
  each one accepted a limitation that a single grep disproved.

## Reconciled defects

Three adversarial cycles — the skill's full budget — producing twenty-one findings, then sixteen,
then fifteen. Every blocker was reproduced against this repository or against the installed
framework source before being accepted. Each round broke the previous round's repairs, which is why
the record is kept: several rules above look arbitrary until you know which failure they answer.

**Cycle 1, folded.** Guard ordering and an unreachable auth-failure bucket; backpressure inverting
the fail-open posture; a missing store-error taxonomy; an unwritable promote and its `ALL_OLD`
requirement; a missing multi-window reset; a throttled health check; one shared bucket across all
public routes. Also right-most `X-Forwarded-For`, a dedicated partition prefix, clock skew, IPv6
/64, the `Retry-After` derivation, the local-limiter semantics, disabled SDK retries, defaults for
every new variable, and four verification steps that could not have failed.

**Cycle 2, folded** — including two of cycle 1's own repairs. The filter-based auth-failure write,
unimplementable because Nest does not await an exception filter and Lambda freezes the microtask
queue, which took the whole auth-failure bucket down with it; that same bucket incrementing on
password-typo 401s; the reject-when-full cache rule, a cure worse than the disease; a blind single
retry deadlocking into a false outage alarm under straddling clocks; a short `Retry-After` in the
saturated branch; per-call rather than per-request timeouts; guard ordering left to module
resolution, dissolved by making the account throttle an interceptor; a `@NoThrottle()` metadata key
that must not be `@Public()`'s.

**Cycle 3, folded** — again including cycle 2's repairs. The `contended` class failing open and
excluded from the outage alarm, which turned contention produced by a flood into a silent bypass for
that flood; the instance-local hot-key heuristic, unsound at cold start and unsound in principle on
a fleet where any one instance sees a fraction of the traffic; `Retry-After` derived from a snapshot
the caller's own retries then invalidate, and solved for equality rather than for admission after
the increment; the skew branch as an unbounded forward ratchet, where one fast clock pins the window
into the future and stops rollover for everybody; an expired deadline abandoning a live promise,
whose later rejection is an unhandled rejection that kills the container and every invocation in it.
Plus: conditional writes that fail are charged, so the cost is one and three rather than one and two
and the over-cap path is not free; a one-window TTL that deletes `previous_count` exactly when it is
the only defence against the boundary burst; an unclassified throw reaching a `@Catch()` filter
whose default mapping is 503; the `trust proxy` setting sitting in entry points no e2e test boots;
and unmatched paths that 404 before any guard runs.

**Pushed back on.** Cycle 2 argued that mapping backpressure to 429 breaks the rule that bookkeeping
must not change the status of a request that would have succeeded, using a caller at 12 of 100
requests as its example. That scenario does not hold — throttling on a partition key implies traffic
to that key, and a caller at 12 requests did not produce it — but it exposed a real gap underneath,
since a table-level ramp raises the same error class for every key. The first answer was a hot-key
heuristic, which cycle 3 then destroyed on its own terms; the surviving answer is to stop trying to
tell the cases apart and degrade both to the local ceiling. Cycle 2 also read the unbounded stored
counter as a contract violation; item count is what that contract bounds, not the numeric value, but
the finding produced a better fix than the one it asked for. Cycle 3 read the interceptor's position
as a defect because a 429 arrives after signature verification; that is inherent to needing a
verified `accountId`, and is now stated as an accepted cost rather than corrected — though its
justification was rewritten, since the phase boundary between guards and interceptors is what makes
the choice safe and "no ordering dependency" was not true.

**Trade-offs, not defects**, resolved with the user and recorded where they were made: counting
rejected requests (kept, bounded by saturation); dropping the pre-auth bucket rather than paying a
second write on every protected request, which makes the invalid-token flood a declared limit
deferred to the WAF; and the fact that throttling a read endpoint costs a write, which makes the
throttle table the highest-write table in the system once 003's catalog listing lands, and is the
price of a limit that holds across instances.

**Where the loop stopped.** The skill bounds doubt at three cycles, and this design used all three.
Stopping is not a claim that nothing is left: it is that the residue changed character. Cycles 1 and
2 found decisions that were wrong in the design; cycle 3's survivors are implementation obligations
with named tests attached — abort the in-flight command, bound the skew tolerance, set TTL two
windows out, wrap the entry points, count operations at the call site. Those belong to `plan-writer`
and `tasks-writer`, enforced through the verification contract, not to more brainstorming. Two
questions genuinely remain open and are listed above with the phase that must answer them: the
`X-Forwarded-For` mechanism, and whether one `UpdateExpression` may read an attribute it also
writes.
