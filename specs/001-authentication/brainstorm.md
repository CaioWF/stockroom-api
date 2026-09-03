---
status: draft
feature: 001-authentication
date: 2026-09-02
---

# Authentication — Brainstorm

> The approved design + the reasoning trail that produced it. Upstream of `spec.md`/`plan.md`:
> this is where the **why this shape** lives (exploration, trade-offs, what was left open); the
> *what* and the *how* live in the spec and plan templates. No code — contracts and intent, not
> function bodies. Scale each section to the complexity; keep sections short for simple features.

## Understanding

- Stockroom needs an account system: a caller signs up, signs in, receives a short-lived token,
  and renews it without signing in again. This feature also delivers the guard that every
  protected route in later features hangs off.
- Feature order across the project: `001` authentication, `002` request throttling, `003` product
  catalog, `004` cloud infrastructure, `005` catalog console. Throttling was moved ahead of the
  catalog during review — the auth routes are the ones that most need a limiter, and building the
  catalog first would leave them unprotected for two features.
- Assumptions made where the request was ambiguous:
  - **An account is a merchant.** One account owns one catalog. There is no organization entity,
    no membership, no roles. Multi-user merchants are the first thing to add later, not now.
  - **The API is consumed by developers**, so error responses explain the failure rather than
    staying deliberately vague.
  - Token lifetimes are configuration, not domain rules: 15 minutes for access, 7 days for
    refresh, 30 days as the absolute session ceiling, all overridable per environment.
  - The password policy is part of this feature's contract, not a detail deferred to
    implementation: 12 to 128 characters measured after NFC normalization, no composition rules.

## Investigation

- Read `.specify/memory/product.md` and `.specify/memory/constitution.md` (both already in
  context from SessionStart). The product brief fixes the north-star as *weekly active
  integrations* — a client that cannot sign in does not count, which makes this feature the
  precondition for the metric existing at all. The constitution fixes what the design may not
  violate: the AWS SDK confined to `infrastructure/`, `Clock` injected, allow-list authorization,
  strict TypeScript, OpenAPI generated from the code, structured logs with a correlation id, and
  TDD as the definition of done.
- Read `.specify/templates/brainstorm-template.md` for this document's shape.
- **Two adversarial review cycles ran against earlier drafts of this design, returning 23 and 26
  findings.** The reconciliation is folded into the sections below, and corrections that changed
  the design's shape are called out where they land. Two constitutional amendments came out of the
  first cycle: the AWS-SDK boundary is any `infrastructure/` directory rather than a single
  top-level `infra/`, and `src/shared/persistence/` is named as the shared kernel — narrowed in the
  second cycle, below, because owning domain mappers would have inverted the dependency rule.
- The second cycle removed more than it added. A first draft had an account lockout and a
  constant-time dummy hash on sign-in; both are gone, and the reasoning is in Open Decisions. A
  30-second grace window on token rotation is gone too, replaced by a test that needs no clock.

**Platform facts established before the modelling decisions, several of them corrections:**

- DynamoDB has no uniqueness constraint on a non-key attribute. A secondary index accepts
  duplicates silently, so email uniqueness has to be enforced by a conditional write on a key.
- `GetItem` is eventually consistent by default, and a `TransactWriteItems` commit is guaranteed
  visible only to a strongly-consistent read. Every read whose staleness would be a correctness
  bug — not merely a slow update — has to ask for consistency explicitly.
- `TransactWriteItems` idempotency requires the retry to present the same `ClientRequestToken`
  **and** parameter-identical input. A registration retry mints a new id and a new password salt,
  so it can never be parameter-identical; the mechanism does not apply here.
- `TransactionCanceledException` reports failures positionally in `CancellationReasons`, and the
  reason codes include `TransactionConflict` (a concurrent transaction touched the same item —
  retry) alongside `ConditionalCheckFailed` (the real duplicate). `TransactWriteItems` caps at
  100 items.
- **TTL guarantees nothing about timing.** Expired items are typically deleted within a few days,
  and an expired-but-undeleted item is still returned by `GetItem`, `Query`, and `Scan`. Expiry
  has to be enforced in the use case against the clock; TTL is storage hygiene only. DynamoDB
  Local's TTL scanner is not the production one and offers no timing contract.
- DynamoDB Local serves every read strongly consistent regardless of the flag, so no local test
  can prove that a `ConsistentRead` is present where the design requires one.
- The load balancer has **two** event shapes, selected by the `lambda.multi_value_headers.enabled`
  target-group attribute; the response must match the shape the request arrived in.
- The load balancer does **not** URL-decode query string values, unlike other AWS HTTP front ends.
  This lands on `003`'s base64 cursor, which contains `+`, `/`, `=`.
- If the function throws, times out, or returns a shape the load balancer cannot parse, the
  balancer substitutes a generic `502` with an HTML body. Work performed in **module scope** runs
  during the initialization phase, before the handler is entered, so a `try`/`catch` around the
  handler body cannot see it. Timeouts and out-of-memory kills are not catchable at all.
- The balancer adds `X-Amzn-Trace-Id` only when the request does not already carry one; a
  client-supplied value is forwarded unchanged.
- Health checks on a `lambda` target group are disabled by default, but enabling them makes the
  balancer invoke the function against a configured path; with no such route the target is marked
  unhealthy and the whole target group serves `503`.
- Secrets Manager carries a standing charge per secret per month; SSM Parameter Store SecureString
  (standard tier) does the same job here at no standing cost. The constitution requires an ADR for
  any always-on cost, and names the load balancer as the only one.
- Native modules resolve their binary through platform-specific packages selected at **install**
  time, not build time. Installing on one platform and running on another fails at a cold start
  with a module-resolution error, which the balancer renders as an opaque `502`.
- RFC 8265's `OpaqueString` profile specifies Unicode Normalization Form **C** for passwords. NFKC
  is a compatibility mapping that folds distinct characters together and destroys entropy the user
  believed they had.
- DynamoDB pagination is cursor-native (`LastEvaluatedKey` / `ExclusiveStartKey`) and costs
  O(page), never O(offset). Recorded here because it constrains `003`, not this feature.

## Approaches considered

**Persistence engine**

- **A — PostgreSQL.** `UNIQUE (email)` for free, strong consistency by default, cheap `COUNT`,
  and no transaction choreography for registration.
- **B — DynamoDB.** Every one of those becomes explicit work: a lock item in a conditional
  transaction, `ConsistentRead` where it matters, no cheap total count, TTL semantics to respect.
- **Chosen: B.** The costs are real and itemized above, but each is a decision the design has to
  make and defend rather than inherit, and the per-key access this product needs (resolve an
  address, read an account, page a catalog inside one partition) is the shape DynamoDB is
  efficient at. The absent total count is answered in an ADR rather than emulated.

**Where the accounts come from**

- **A — Sign-in only, users seeded.** Smallest surface: one route, a seed script, trivial local
  setup. Never exercises an authenticated write path and leaves the product unable to onboard.
- **B — Sign-up and sign-in.** Two routes. Adds input validation, a password policy, and a
  uniqueness rule — all of them behaviour worth testing.
- **C — Invite-gated sign-up.** Realistic for B2B, but a business rule nobody asked for. Cut.
- **Chosen: B.** The product cannot be integrated against if accounts can only be created by
  someone with database access, and the uniqueness rule is the most interesting piece of
  persistence logic in the feature.

**Token lifecycle**

- **A — Access token only, short-lived, stateless.** No session state, no extra storage. No real
  sign-out, and a client is forced back through sign-in every fifteen minutes.
- **B — Short access token plus rotating refresh token.** Refresh tokens are persisted hashed with
  a native TTL. Rotation makes one class of theft detectable and gives revocation something to act
  on. Costs one more route, one more item type, and rotation rules that have to be right.
- **C — Long-lived access token.** Simple and wrong: a 24-hour window with no revocation
  contradicts the constitution's short-lived-token principle. Discarded.
- **Chosen: B**, with its limits written down rather than assumed away — see *Rotation and what
  reuse detection does not catch*.

**Token signing**

- **A — HS256 with a shared secret.** Fewest moving parts and no per-operation cost. Any service
  that needs to *verify* a token must hold the secret that *issues* them, and can therefore forge.
- **B — RS256 with a key pair and a published JWKS document.** The private key signs and stays
  with this service; anything else fetches the public key and can verify without being able to
  issue.
- **Chosen: B.** The deployment puts a load balancer in front precisely so a second target group
  can coexist with the function — the strangler-fig path out of a legacy service. In that shape a
  neighbouring service has to validate tokens issued here, and asymmetric signing is what makes
  that safe. JWKS is a published standard (RFC 7517) rather than a house convention.
- **The choice carries an obligation.** Publishing the verification key makes algorithm confusion
  exploitable: a verifier that does not pin `RS256` will accept a token signed `HS256` using the
  published public key as the HMAC secret — a complete forgery path. Pinning the algorithm is what
  makes option B safe, not a hardening extra.

**Password hashing**

- The constitution's laziness ladder puts stdlib before an installed dependency, so `crypto.scrypt`
  has to be answered rather than skipped. It is memory-hard and OWASP-listed — but listed as the
  alternative *when argon2id is unavailable*, and argon2id is the first recommendation. Argon2id
  is available without a source build, so the ladder does not stop there.
- **Chosen: argon2id via `@node-rs/argon2`.**
- The packaging risk belongs to the **artifact, not the package**. Choosing a library with
  prebuilt binaries does not help, because the binary is selected at install time: installing on a
  developer's machine and running on Lambda produces a module-resolution failure at a cold start,
  invisible locally and invisible in CI if CI shares the developer's platform. The rule is
  therefore that the deployment artifact is installed and built for the function's own platform
  and architecture — in an Amazon Linux 2023 container, or with the install pinned to
  `linux`/`x64`/`glibc` — and `004` asserts the binary is present in the artifact it ships.
- Argon2id is memory-hard and CPU-bound, and Lambda allocates a full vCPU only at 1769 MB, so the
  function is sized at **1769 MB**. An earlier draft said 1024 MB, which contradicted its own
  rationale by leaving the hash on roughly half a core. `004` confirms the number by measurement.
- Refresh tokens are hashed with **SHA-256, not argon2**. A slow hash defends a low-entropy
  secret; a 256-bit random value has nothing to brute force.

## Open Decisions

- **Email enumeration — accepted, and revisited in `002`.** `POST /auth/register` returns `409` on
  a duplicate, which confirms an address is registered. An earlier draft tried to close the
  matching oracle on sign-in with a dummy hash on the miss path; that is removed. The reasoning:
  any public registration endpoint that reports duplicates leaks the same fact for one
  unauthenticated request, so the sign-in defence spent an argon2 execution per miss — and part of
  the function's memory sizing — to close a door whose neighbour stands open. Half a defence is
  worse than none, because it costs and does not protect. `002` revisits whether per-source
  throttling alone is enough, or whether registration needs a challenge.
- **Sign-in timing.** With enumeration accepted, the timing difference between an unknown address
  and a wrong password leaks nothing the `409` does not already give away, so no equalization is
  attempted. Recorded so that a future reviewer sees a decision rather than an oversight. Note for
  `002`: the two paths differ by a DynamoDB round trip, so any later attempt to close this needs a
  fixed response floor, not equal work.
- **No account lockout in `001`.** An earlier draft locked an account for fifteen minutes after
  five consecutive failures. Removed: with enumeration accepted, any stranger could lock any
  merchant out permanently at roughly one request every three minutes, and this feature ships no
  sign-out, no unlock route, and no mail path — recovery would mean an operator editing the table
  by hand. A five-strike counter also does not stop credential stuffing, which spends one attempt
  per account across many accounts. The real control is per-source throttling, which is `002`, now
  the next feature precisely because of this.
- **Access-token revocation.** Not possible before expiry by design; only refresh tokens are
  revocable. A hard kill-switch means a deny-list checked on every request, which trades away the
  stateless verification this design is built on. Deferred, and its consequence for reuse
  detection is stated in the outline rather than left implicit.
- **Sign-out.** Out of scope for `001`. The account owner has no way to end a session early; the
  only revocation trigger is reuse detection. Named so the gap is a decision. Candidate for `005`.
- **`lambda.multi_value_headers.enabled` — closed at `false`.** The adapter is written for the
  single-value event shape; nothing here returns duplicate headers. `004` must set the attribute
  explicitly rather than relying on the default, and a fixture of a real event pins the shape.
- **Load-balancer path rules — a `001` decision recorded as a `004` constraint.** The rule set must
  route `/auth/*`, `/.well-known/*`, `/health`, and the OpenAPI document's path. A single
  `/auth/*` rule would 404 the JWKS document at the balancer and collapse the asymmetric-signing
  rationale.

## Outline of the solution

**Public surface**

| Route | Access | Behaviour |
| --- | --- | --- |
| `POST /auth/register` | public | Email and password create an account. Rejects a duplicate address and a password outside policy. |
| `POST /auth/login` | public | Credentials return an access token, a refresh token, and both expiries. |
| `POST /auth/refresh` | public | A refresh token returns a fresh pair and permanently retires the one presented. |
| `GET /auth/me` | guarded | Returns the caller's id and email, resolved from the token's subject. |
| `GET /.well-known/jwks.json` | public | The public key set, so a separate service can verify without being able to issue. |
| `GET /health` | public | Liveness only. Touches nothing downstream. |
| `GET /openapi.json` | public | The generated contract. |

`GET /auth/me` exists because the guard is otherwise untestable: with no protected route in this
feature, the only available test would instantiate the guard and assert against a fabricated
execution context, which is testing implementation and is what the constitution forbids. One
controller method turns the guard into an observable acceptance criterion and gives the end-to-end
suite a real register → sign in → call → refresh → call cycle. `GET /health` exists because the
balancer's health check needs a target, and it deliberately checks nothing downstream — a health
check that fans out turns a dependency blip into a target-group-wide outage.

Out of scope: sign-out, password reset, email verification, account deletion, email change,
products, throttling, Terraform, front end.

**The guard**

Global, with an explicit `@Public()` allow-list holding exactly the six public routes above. The
default is guarded, so a route added in `003` cannot ship unprotected by omission — the
constitution's allow-list rule applied to routing. Verification pins `algorithms: ['RS256']`,
requires a `kid` present in the trusted key set, and validates issuer, audience, and expiry.

**Structure**

Bounded context first, technical layer second. Inside `src/auth/`, dependencies point inward:

- `domain/` — the `User` aggregate, the `Email` and `Password` value objects, the `RefreshToken`
  entity and the `RefreshTokenCredential` value object that a wire token parses into, typed
  errors, and the ports: user repository, refresh-token repository, password hasher, token signer,
  signing-key provider, verification-key-set provider, clock, id generator. No framework, no AWS,
  no HTTP.
- `application/` — the use cases (register, authenticate, rotate refresh token, describe caller).
- `infrastructure/` — the adapters: the DynamoDB repositories **and this context's item↔domain
  mappers**, the argon2id hasher, the RS256 signer, the Parameter Store key providers. The only
  place importing `@aws-sdk/*`.
- `presentation/` — controllers, request schemas parsed at the boundary, the guard, the exception
  filter, and the OpenAPI decorators.

`src/shared/persistence/` is the shared kernel and owns only what is genuinely domain-free: the
document client and the key grammar, at the string and attribute level. It does **not** own
mappers. An earlier draft gave it the item↔domain mapping for every item type, which would have
forced it to import `RefreshToken` from `src/auth/domain` and, by `003`, `Product` too — a module
every context depends on that in turn depends on every context, inverting the dependency rule the
constitution states. Each context maps its own items and composes the shared key grammar.

Two entry points sit above the modules: a local HTTP server, and a function handler translating
the balancer event into a framework request and back into its response envelope. **Nothing but
pure module loading happens at module scope.** The framework application is a promise created on
the first invocation, inside the wrapped handler, and reused afterwards — so a bootstrap failure
is catchable and returns a well-formed envelope instead of the balancer's opaque `502`. An earlier
draft memoized at module scope and claimed the wrapper caught "any escape"; initialization-phase
work runs before the handler is entered, so it caught precisely the failures most likely to
happen. Timeouts and out-of-memory kills remain uncatchable and are handled by the timeout budget,
not by the wrapper.

**Persistence — one table, three item types**

| Item | Partition key | Sort key | Payload |
| --- | --- | --- | --- |
| Account | `USER#<userId>` | `PROFILE` | `email`, `password_hash`, `created_at`, `token_generation` |
| Email lock | `EMAIL#<email_normalized>` | `EMAIL` | `user_id` |
| Refresh token | `USER#<userId>` | `REFRESH#<tokenId>` | `token_hash`, `token_generation`, `session_started_at`, `expires_at`, `rotated_at`, `replaced_by`, `ttl` |

The email lock is a key, not an index, because a secondary index would accept a duplicate address
without complaint. Registration writes the account and the lock in one transaction, the lock
conditioned on its key not already existing. The adapter inspects `CancellationReasons`
positionally and translates the outcome into a typed domain error: a conditional-check failure on
the lock is a duplicate address, a transaction conflict is retried with backoff, anything else is
a typed infrastructure error. No raw AWS error escapes the adapter. There is no idempotency token:
a retried registration mints a new id and a new salt, so it can never be parameter-identical and
`TransactWriteItems` idempotency would raise a mismatch rather than replay the result. A duplicate
seen on a retry is reported as the `409` it is.

Normalization lives in the `Email` value object — trim, NFC, locale-invariant case folding, length
bound — and both the register and the sign-in path construct the value object before a repository
sees it. The repository never normalizes; if it did, the two paths could diverge and one address
would produce two accounts. NFC rather than NFKC, so two genuinely distinct addresses are not
folded onto one lock and permanently denied to the second party.

Sign-in resolves the address through the lock and then reads the account, both with
`ConsistentRead`, because a transaction's commit is only guaranteed visible to a strong read and
register-then-sign-in is the first thing every client does.

No `version` attribute ships in `001`. An earlier draft placed one for a future email change and
account deletion, but every profile write in this feature would have left it untouched, producing
a field that looks like an optimistic-concurrency guard and is not one. When those operations
arrive they introduce the attribute together with the writes that maintain it.

**Refresh tokens and rotation**

The wire token is `<userId>.<tokenId>.<secret>` in base64url, where the secret is 256 random bits.
It is parsed at the trust boundary into a typed credential before anything else happens: exactly
three segments, each matching the id generator's charset and length, the secret of the expected
size. Only then is a key built. Both id segments are attacker-controlled, and an unbounded one
would exceed DynamoDB's 2048-byte partition-key limit and throw a validation error from inside an
adapter on an unauthenticated route. Presenting one account's `tokenId` under another account's
`userId` simply addresses an item that does not exist, so the key itself binds the pair.

Only `sha256(secret)` is stored, compared in constant time. The first two segments are what make
the lookup a direct, strongly-consistent `GetItem` — an earlier draft stored the digest alone,
which left no way to locate the item from the token at all.

Rotation is a single `TransactWriteItems` of three items:

1. a `ConditionCheck` on the account asserting `token_generation` still equals the generation
   recorded **on the token being rotated**,
2. a conditional `Update` on that token setting `rotated_at` and `replaced_by`, conditioned on
   `attribute_not_exists(rotated_at)`,
3. a `Put` of the successor, stamped with the same generation and with
   `expires_at = min(now + refreshTtl, session_started_at + sessionCeiling)`.

Reading the old token supplies the generation, so no separate profile read is needed and the
refresh path costs one strongly-consistent `GetItem` plus one transaction. An earlier draft ran
the three writes independently: a partial failure retired the old token without persisting the
new one, silently ending a session in a way the client could not distinguish from theft, and
nothing tied the write back to the generation that had been read, so a revocation landing
mid-rotation still handed out a fifteen-minute access token to whoever triggered it.

**Reuse detection, and what it does not catch**

Presenting an already-rotated token is not by itself evidence of theft — a double-submitting
client, a retry after a lost response, or a second browser tab restored from the same stored token
all produce it. The discriminator is the successor chain, not elapsed time: if the token's
`replaced_by` successor is still the live, unrotated tip, this is a benign replay, rejected on its
own with a structured warning and nothing else touched. If the successor has itself been rotated,
two chains are alive from one token, which is the signal — and revocation follows.

An earlier draft used a 30-second grace window instead. It was wrong in both directions: wide
enough to blind detection for thirty seconds after every rotation, and narrow enough that two
dashboard tabs refreshing two minutes apart would wipe every session on the account. A window that
is simultaneously too wide and too narrow is the wrong discriminator, not the wrong constant. The
successor test also needs no clock, which removes a failure mode where two containers disagreeing
by milliseconds produce a negative elapsed time and fall through to revocation.

**The limitation, stated rather than assumed away.** This catches the attacker who replays *after*
the legitimate client rotates. It does not catch the attacker who rotates *first*: their successor
is the live tip, so the victim's next presentation reads as a benign replay, the victim signs in
again and notices nothing, and the stolen chain continues. That is inherent to refresh rotation
and is acknowledged as such in the IETF's OAuth security guidance; the successor test does not fix
it, and claiming otherwise would be the more dangerous error. What bounds it here is the 30-day
session ceiling, and what makes it observable is that every graced replay is logged as an anomaly.

Revocation is a generation counter: every refresh token records the `token_generation` it was
minted under, and revoking is a single atomic increment on the account, after which the
`ConditionCheck` in step 1 fails for every outstanding token. A `Query` plus N deletes would be
neither atomic — a rotation racing the sweep writes a token the query never saw, precisely when an
attacker is active — nor bounded, since a transaction caps at 100 items.

Revocation does not reach access tokens. Reuse detection therefore takes effect **within one
access-token lifetime**, and that is what makes fifteen minutes a security parameter bounding
attacker dwell time rather than a UX preference.

`session_started_at` is carried across rotations and refuses to rotate past a 30-day ceiling.
`ttl` is a Number, Unix epoch seconds, set once at issue to the token's original expiry and never
mutated: shortening it at rotation would collect the tombstone that reuse detection reads.
Expiry is enforced in the use case against the injected clock, because an expired item is still
returned until DynamoDB gets around to deleting it.

**Cost per operation**, stated so `002` and `003` can reason about it: registration is one
transaction; sign-in is two strongly-consistent reads plus one write; refresh is one
strongly-consistent read plus one transaction, and one extra read only on the replay path.

**Signing keys**

Two ports, because the signer and the verifier need different things: `SigningKeyProvider` yields
the one private key, `VerificationKeySetProvider` yields every public key still trusted — which
during a rotation is more than one, and is what both the guard's `kid` lookup and the JWKS
document consume. An earlier draft had a single provider and so had no mechanism behind its own
rotation procedure.

Both read SSM Parameter Store SecureStrings, fetched once per container, **lazily on first use
rather than at bootstrap**, so a Parameter Store outage cannot fail a health check and take the
target group down with it. A key in an environment variable is readable by anyone who can describe
the function and lands in infrastructure state, so it is rejected outright. Secrets Manager is
rejected for a different reason: it carries a standing monthly charge, and the constitution allows
exactly one always-on cost — the load balancer — with anything further owing an ADR. Parameter
Store costs nothing standing, so none is owed.

`kid` is the RFC 7638 thumbprint of the key, derived rather than maintained. The JWKS document
carries `Cache-Control: public, max-age=300` so consumers have a knowable cache horizon.

Rotation runs in this order: publish the new key alongside the old, wait out the maximum consumer
cache age, *then* switch signing, keep the old key published until the last token it signed has
expired, and only then drop it. Signing before publishing would make every consumer holding a
cached document reject valid tokens for the length of its cache.

**Errors, logging, and the contract**

Domain errors carry their own types and the exception filter is the only component that knows a
status code. Logging redacts by **allow-list**: only named fields are emitted and everything else
is withheld, because a deny-list is what the constitution forbids everywhere else and because an
earlier draft's list named `refresh_token` while the wire body carries `refreshToken` — a case
mismatch that would have printed a live credential in cleartext. The correlation id comes from the
balancer's trace header only when it matches the trace-id grammar, and is generated otherwise: the
balancer forwards a client-supplied value unchanged, so an unauthenticated caller would otherwise
choose the id every log line is grouped by. The OpenAPI document is generated from the boundary
schemas and served by the application at a route that is in the public allow-list and in the
balancer's path rules — a contract nobody can fetch is not public.

**Tests**

Domain and use cases are covered by unit tests driven through in-memory fakes — real
implementations of the ports, not mocks, so assertions land on observable behaviour rather than on
call bookkeeping. The clock is injected, so token expiry, the session ceiling, and the successor
chain's outcomes are exercised without waiting.

Integration tests run against a local DynamoDB and cover what only the real engine can prove: the
uniqueness transaction under concurrent registration, and the conditional rotation under
concurrent refresh. Two things are deliberately **not** tested there. TTL deletion: the local
scanner offers no timing contract, and the behaviour that matters — an expired token is rejected —
is a clock-driven unit test. And read consistency: DynamoDB Local serves every read strongly
consistent, so a test would pass with `ConsistentRead` removed. Both are recorded as properties
enforced by review, with the two places consistency is required named explicitly so a reviewer can
find them.

Route-level tests exercise every route end to end through the framework, including each rejection
path, plus a fixture of a real load-balancer event asserting the handler returns a valid response
envelope — including when the application fails to initialize, which the lazy in-handler bootstrap
makes reachable.

**Local environment**

A compose file brings up local DynamoDB, an idempotent script creates the table, and a development
key pair is generated outside version control. `004` introduces the Terraform definition of the
same table and owes a drift check comparing the full table description — key schema, attribute
definitions, billing mode, and above all whether TTL is enabled and on which attribute. TTL is a
table setting rather than an item attribute, so a Terraform definition that omits it passes every
local test while refresh tokens accumulate forever in production.
