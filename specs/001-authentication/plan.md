---
status: approved
---

# Authentication — Plan

## Architecture

**Two entry points, one application.** `src/main.ts` starts an HTTP server for local development.
`src/lambda.ts` is the function handler: it translates a load-balancer event into a framework
request and the framework response back into the balancer's envelope. Nothing but pure module
loading runs at module scope — the application is a promise created on first invocation *inside*
the wrapped handler, so an initialization failure is catchable and answers `503` in a well-formed
envelope instead of letting the balancer substitute an opaque `502` (`FR27`, `AC-23`).

**Bounded context first.** `src/auth/` holds the whole feature in four inward-pointing layers.
`src/shared/` holds three cross-cutting modules that later features reuse: `persistence`
(document client and key grammar), `observability` (logger, correlation id), and `config`
(environment parsed once into a typed object).

**Layers inside `src/auth/`:**

- **domain** — `Account` aggregate; `EmailAddress`, `RawPassword`, `PasswordDigest`,
  `RefreshTokenCredential` value objects; `RefreshToken` entity; typed errors; and eight ports:
  `UserRepository`, `RefreshTokenRepository`, `PasswordHasher`, `AccessTokenSigner`,
  `SigningKeyProvider`, `VerificationKeySetProvider`, `Clock`, `IdGenerator`. No framework, no
  AWS, no HTTP.
- **application** — four use cases: `RegisterAccount`, `AuthenticateAccount`, `RotateRefreshToken`,
  `DescribeCaller`. They depend only on ports.
- **infrastructure** — the adapters, and the only place importing `@aws-sdk/*`: two DynamoDB
  repositories plus **this context's** item↔domain mappers, the argon2id hasher, the RS256 signer,
  and the Parameter Store key providers.
- **presentation** — controllers, request schemas parsed at the boundary, the global guard, the
  exception filter that renders problem documents, and the OpenAPI decorators.

**Data flow, register.** Controller parses the body into `EmailAddress` + `RawPassword` →
`RegisterAccount` mints a UUIDv7, hashes the password, and asks `UserRepository.create` → the
repository writes the account item and the email-lock item in one `TransactWriteItems`, the lock
conditioned on absence → a conditional-check failure on the lock becomes
`EmailAlreadyRegisteredError`, a transaction conflict is retried with backoff, anything else
becomes a typed infrastructure error → controller answers `201` with id and normalized email, no
tokens (`FR1`, `FR4`, `AC-1`, `AC-2`, `AC-4`).

**Data flow, sign in.** Controller parses credentials → `AuthenticateAccount` resolves the address
through the email lock and reads the account, **both strongly consistent**, verifies the digest,
mints an access token through `AccessTokenSigner` and a refresh token through `IdGenerator` plus
random bytes → `RefreshTokenRepository.issue` stores only the SHA-256 digest → response carries
both tokens and both remaining lifetimes in seconds (`FR6`, `AC-5`, `AC-7`).

**Data flow, refresh.** The wire string is parsed into a `RefreshTokenCredential` at the boundary
*before* any key is built — three base64url segments, two of them UUIDv7-shaped, the third the
exact length for 256 bits (`FR14`, `AC-20`). One strongly-consistent `GetItem` locates the item;
its stored generation feeds a single `TransactWriteItems` carrying a `ConditionCheck` on the
account's generation, a conditional `Update` retiring the presented token, and a `Put` of the
successor (`FR16`). Rotation therefore needs no separate account read. A retired token takes the
replay branch: one extra read of its successor decides between a benign replay (refuse alone,
record an anomaly) and a proven second chain (increment the generation, refusing every outstanding
token) (`FR18`, `FR19`, `AC-15`, `AC-16`, `AC-17`).

**Data flow, guarded route.** The global guard resolves the token's `kid` against
`VerificationKeySetProvider`, verifies with RS256 pinned, checks issuer, audience, and expiry, and
attaches the caller. `@Public()` marks exactly six routes as exempt; everything else is denied by
default (`FR11`, `FR12`, `AC-9` through `AC-12`).

**Integration with existing systems.** None — this is the first feature and there is no prior
code. The seams it opens are consumed later: the guard and caller identity by
`specs/002-request-throttling` and `specs/003-product-catalog`, the key grammar by
`specs/003-product-catalog`, the liveness route and the four path prefixes by
`specs/004-cloud-infrastructure`.

## File Structure

```
src/
  main.ts                                   local HTTP server
  lambda.ts                                 ALB event <-> framework request, lazy bootstrap
  app.module.ts                             composition root

  shared/
    config/
      environment.schema.ts                 zod schema for every env var
      configuration.module.ts
    observability/
      correlation-id.ts                     trace-header grammar + fallback generator
      structured-logger.ts                  allow-list JSON logger
      observability.module.ts
    persistence/
      dynamo-client.provider.ts             document client, one per container
      table-keys.ts                         the key grammar — the only place keys are built
      persistence.module.ts

  auth/
    domain/
      account.ts                            aggregate: id, email, digest, generation
      email-address.ts                      trim, NFC, lowercase, length
      raw-password.ts                       12..128 after NFC
      password-digest.ts
      refresh-token.ts                      entity: ids, digest, generation, session start, expiries
      refresh-token-credential.ts           parsed wire token
      rotation-outcome.ts                   discriminated union of the five refresh results
      errors.ts
      ports/
        user-repository.ts
        refresh-token-repository.ts
        password-hasher.ts
        access-token-signer.ts
        signing-key-provider.ts
        verification-key-set-provider.ts
        clock.ts
        id-generator.ts
    application/
      register-account.usecase.ts
      authenticate-account.usecase.ts
      rotate-refresh-token.usecase.ts
      describe-caller.usecase.ts
    infrastructure/
      dynamo/
        user.repository.ts
        user.mapper.ts
        refresh-token.repository.ts
        refresh-token.mapper.ts
      crypto/
        argon2-password-hasher.ts
        rs256-access-token-signer.ts
        uuid-v7-generator.ts
        system-clock.ts
      keys/
        parameter-store-signing-key.provider.ts
        parameter-store-verification-key-set.provider.ts
    presentation/
      auth.controller.ts
      jwks.controller.ts
      dto/
        register-request.schema.ts
        login-request.schema.ts
        refresh-request.schema.ts
      jwt-auth.guard.ts
      public.decorator.ts
      problem-details.filter.ts             RFC 9457 rendering, the only place status codes live
    auth.module.ts

  health/
    health.controller.ts
    health.module.ts

test/
  unit/                                     domain + use cases, in-memory fakes
  integration/                              against local DynamoDB
  e2e/                                      every route through the framework
  fixtures/
    alb-event.fixture.ts                    a real single-value load-balancer event
  fakes/                                    real port implementations, never mocks

scripts/
  create-table.ts                           idempotent local table bootstrap
  generate-dev-keys.ts                      RS256 pair for local use, outside version control

docker-compose.yml                          local DynamoDB
```

## Technical Decisions

**Decomposition axis — horizontal layer, and why not slices.** `002` onward will slice
vertically, but this feature is one coupled module: every layer converges on `auth.module.ts` and
`app.module.ts`, and the domain, the adapters, and the controllers are the same unit of work seen
from three sides. Splitting it into "parallel slices" would declare a disjointness that does not
exist and clobber under concurrent execution. The order below is therefore a dependency chain, and
tasks serialize. The one genuinely disjoint piece — `src/shared/persistence/` and
`src/shared/observability/` — is built first precisely because everything else depends on it.

**No pattern to replicate.** There is no existing feature, module, or convention in the tree to
match; the repository holds documentation only. Every structural choice here is therefore
established rather than inherited, which is why the layering follows the constitution's
architecture principles literally instead of an in-repo precedent.

**Naming, per the naming lens.** `camelCase` identifiers, `PascalCase` types, `SCREAMING_SNAKE`
for environment variables and module-level constants, `kebab-case.ts` files. The wire is
`camelCase` JSON throughout (`accessToken`, `expiresIn`, `refreshExpiresIn`); storage attributes
are `snake_case` (`password_hash`, `created_at`, `token_generation`). One name per concept across
layers — `accountId` never becomes `uid` or `id` in transit.

**Type design, per the TypeScript lens.** `strict: true` plus `noUncheckedIndexedAccess`. Every
external input — request bodies, environment, storage items, the load-balancer event — enters as
`unknown` and is parsed by a schema into a typed value; nothing is cast through. The refresh
outcome is a discriminated union rather than a cluster of booleans, with five members: rotated,
unknown, expired, benign replay, reuse detected. That union is what makes `AC-14` through `AC-18`
five separate, exhaustively-checked branches instead of nested conditionals, and the compiler
refuses a sixth state that nobody handled.

**The anomaly event leaves through the outcome, not through a port.** `AC-15` requires a benign
replay to be recorded, and the obvious move — injecting a logger into the use case — would put
infrastructure inside the application layer. Instead the discriminated union *is* the record: the
use case returns `{ kind: 'benign-replay' }` and the presentation layer emits the event when it
renders that member. No ninth port, no logger below the edge, and the unit test asserts on the
returned value rather than on a spy. This was a gap the cross-check caught: the union already
existed, but nothing said who logs.

**UUIDv7 is not in the standard library.** `crypto.randomUUID()` yields v4 only, so `FR10` costs
something the laziness ladder requires answering rather than skipping. Version 7 is roughly fifteen
lines — 48 bits of big-endian milliseconds, the version and variant nibbles, the rest random from
`crypto.randomBytes` — and it lives behind the existing `IdGenerator` port with the RFC 9562 layout
asserted by unit tests. That is one small tested file against a dependency whose entire surface is
one function, so the ladder stops at "write it". If the hand-rolled version ever proves fiddly, the
fallback is the smallest published implementation, and the port makes that a one-file swap.

**The caller's email is a token claim, never an authorization input.** `GET /auth/me` reads both
id and email from the token, so a guarded route costs no storage read and the verification path
stays genuinely stateless — the reason for choosing a signed token in the first place. The cost is
staleness: a later email change increments the same generation counter replay detection uses,
killing every refresh token, but an access token already issued keeps the old claim until it
expires. That is bounded at one access-token lifetime and is a display inconsistency rather than a
security defect **only while nothing authorizes on the claim** — which is why the spec states the
prohibition instead of leaving it to a future author's judgement.

**Allow-lists, per the constitution.** Three of them, all mechanical rather than advisory: the
guard's public-route list (default deny), the token verifier's pinned algorithm list — which is
what stops the published key being replayed as an HMAC secret (`AC-10`) — and the logger's emitted
field list (`FR28`, `AC-25`).

**Password hashing.** argon2id via `@node-rs/argon2` at OWASP parameters (19 MiB, two iterations,
one lane). The packaging risk belongs to the artifact, not the package: the deployment bundle must
be installed for the function's own platform and architecture — an install performed on a
developer machine resolves the wrong native binary and fails only at a cold start, invisible
locally. Recorded here as a constraint `specs/004-cloud-infrastructure` must honour, together with
the 1769 MB sizing that gives the hash a full vCPU.

**Signing keys.** Two ports, because the signer needs one private key while both the guard and the
key-set route need the *set* of trusted public keys — during a rotation that is more than one.
Both adapters read Parameter Store secure strings, memoized per container and fetched **lazily on
first use**, never at bootstrap, so a Parameter Store problem cannot fail a health check and take
the whole target group down with it (`FR25`, `AC-22`).

**Blocking dependency, stated as such.** Nothing blocks this feature. It hands three obligations
forward to `specs/004-cloud-infrastructure`: route `/auth/*`, `/.well-known/*`, `/health`, and the
contract path; set the target's header-handling mode explicitly rather than inheriting the default;
and build the artifact for the runtime's platform. Any of the three left undone makes a passing
local test suite meaningless in a deployed environment.

**Observability, per the observability lens.** The questions an operator will ask at 3am, named
before any signal is added:

1. *Is someone replaying tokens?* — a structured anomaly event on every benign replay and every
   reuse detection, carrying the account id and the outcome, never a token.
2. *Are sign-ins failing, and which class of failure?* — request rate, error rate, and duration by
   route and by outcome code. Labels are bounded to route and code; an account id is never a
   metric label.
3. *Did the function fail to start?* — an initialization-failure event emitted from the handler's
   wrapper before the `503` is returned.
4. *Where is the latency, in the hash or in storage?* — duration histograms around the hash call
   and around each storage call, reported at p95/p99, never as a mean.

Correlation ids come from the inbound trace header only when it matches the expected grammar,
because the balancer forwards a client-supplied value unchanged and an unauthenticated caller must
not choose the id every log line is grouped by (`AC-24`).

## Data Layer Contract

This plan adds one table, so the section applies — but the engine is DynamoDB, which changes what
several of these rows mean.

- **Code↔schema mapping.** `camelCase` in code ↔ `snake_case` item attributes, with `PK`/`SK`
  uppercase by convention. The mapping lives in exactly two files —
  `src/auth/infrastructure/dynamo/user.mapper.ts` and `refresh-token.mapper.ts` — and nowhere
  else; a use case never names a storage attribute. Key *construction* is separate and lives in
  `src/shared/persistence/table-keys.ts`, the single owner of the key grammar per the
  constitution's shared-kernel rule.

- **Table and items.** One table, name from configuration. Partition key `PK` (String), sort key
  `SK` (String). Three item shapes:

  | Item | `PK` | `SK` | Attributes |
  | --- | --- | --- | --- |
  | Account | `USER#<uuidv7>` | `PROFILE` | `email`, `password_hash`, `created_at`, `token_generation` |
  | Email lock | `EMAIL#<normalized>` | `EMAIL` | `user_id` |
  | Refresh token | `USER#<uuidv7>` | `REFRESH#<uuidv7>` | `token_hash`, `token_generation`, `session_started_at`, `expires_at`, `rotated_at`, `replaced_by`, `ttl` |

  Timestamps are ISO-8601 strings except `ttl`, which is a Number of Unix epoch **seconds**
  because that is the only form the engine's expiry accepts. `ttl` is written once at issue and
  never mutated — shortening it at rotation would collect the tombstone that replay detection
  reads.

- **Constraints.** The engine offers none beyond key uniqueness, so the invariants are enforced by
  conditional writes: email uniqueness by a not-exists condition on the lock item inside the
  registration transaction, single-use rotation by a not-exists condition on the retired token's
  `rotated_at`, and revocation ordering by a condition check comparing the account's
  `token_generation` to the value carried on the token being rotated.

- **Indexes.** None. Every access path is a direct key lookup: the email lock resolves an address
  to an account id, and both the account and each refresh token are addressed by key. No table
  scan is reachable from any route. A secondary index was rejected for email uniqueness
  specifically because an index accepts duplicates silently.

- **RLS.** `N/A` — DynamoDB has no row-level security. The equivalent scoping is structural: an
  account's id is the partition key of everything it owns, and a refresh credential naming one
  account with another's token id simply addresses an item that does not exist (`AC-21`).
  Authorization stays in the application, allow-listed, per the constitution.

- **Migration.** `N/A` for this feature — the table is created, not altered. Locally it is created
  by `scripts/create-table.ts`; the production definition is owed by
  `specs/004-cloud-infrastructure`, which must also enable expiry on the `ttl` attribute. Expiry is
  a table setting rather than an item attribute, so a definition that omits it passes every local
  test while refresh tokens accumulate forever.

## Implementation Order

1. **Project skeleton.** TypeScript with the strict flags, the framework, the test runner, the
   lint and format configuration, and `docker-compose.yml` with local DynamoDB. No feature code.
2. **Shared configuration.** The environment schema and its module — token lifetimes, table name,
   issuer, audience, parameter names — parsed once into a typed object.
3. **Shared persistence.** The document client provider and `table-keys.ts`. Built before anything
   that stores, because it is the one piece two later features also consume.
4. **Shared observability.** The allow-list logger and the correlation-id resolver, including the
   trace-header grammar (`AC-24`, `AC-25`).
5. **Domain value objects.** `EmailAddress`, `RawPassword`, `PasswordDigest`,
   `RefreshTokenCredential` — normalization, bounds, and parsing, all pure (`FR2`, `FR3`, `FR14`).
6. **Domain entities and the outcome union.** `Account`, `RefreshToken`, `rotation-outcome.ts`,
   typed errors, and the eight port interfaces.
7. **In-memory fakes.** Real implementations of every port, used by the unit suites. Written here
   so that steps 8 and 9 can be developed and tested without any adapter existing.
8. **Register and authenticate use cases**, test-first against the fakes (`AC-1` … `AC-7`).
9. **Rotate use case**, test-first, covering all five branches of the outcome union
   (`AC-14` … `AC-19`).
10. **Crypto adapters.** argon2id hasher, RS256 signer, UUIDv7 generator, system clock, and
    `scripts/generate-dev-keys.ts`.
11. **Key providers.** The two Parameter Store adapters, lazily memoized.
12. **DynamoDB repositories and mappers**, plus `scripts/create-table.ts`, with integration tests
    covering the uniqueness transaction and the conditional rotation under concurrency
    (`AC-4`, `AC-17`).
13. **Presentation.** Request schemas, controllers, the global guard with its public list, and the
    problem-details filter with the closed code set (`FR24`, `AC-27`).
14. **Health and the key-set route** (`AC-13`, `AC-22`).
15. **The contract.** OpenAPI generated from the same schemas, served publicly (`AC-26`).
16. **Transport.** `lambda.ts` with the lazy in-handler bootstrap and the envelope wrapper, plus
    the load-balancer event fixture and the initialization-failure test (`AC-23`).
17. **End-to-end suite.** The full register → sign in → call → refresh → call cycle, plus every
    rejection path.
18. **Setup documentation.** A clean-clone runbook, verified by following it.

## How to Validate

**Unit tests** cover the domain and the use cases through in-memory fakes — real port
implementations, never mocks, so assertions land on observable results rather than on which method
was called. The clock is injected, so access expiry, refresh expiry, and the absolute session
ceiling are exercised by moving time rather than by waiting. This is where the five rotation
branches are pinned, because each is a pure decision over stored state and elapsed time.

**Integration tests** run against local DynamoDB and are reserved for what only the real engine can
prove: that concurrent registration of one address yields exactly one account, and that concurrent
rotation of one token yields exactly one successor. Two properties are deliberately *not* asserted
here. Storage-level expiry, because the local scanner offers no timing contract and the assertion
would flake — the behaviour that matters, that a stale item is still refused, is a clock-driven
unit test. And read consistency, because local DynamoDB serves every read strongly consistent, so
a test would pass with the consistency flag removed. Both are recorded as review-enforced
properties, with the two places consistency is required named in this plan so a reviewer can find
them.

**End-to-end tests** drive every route through the framework, including each rejection path and
the algorithm-confusion attempt, and assert that every error body is a problem document whose code
belongs to the closed set. A fixture of a real load-balancer event asserts the handler returns a
valid envelope, including when the application fails to initialize — a case the lazy in-handler
bootstrap makes reachable.

**Quality checklist.** `.specify/gates/run-gates.sh` green. No `any`. No `@aws-sdk` import outside
an `infrastructure/` directory. No storage attribute name outside the two mapper files. No key
built outside `table-keys.ts`. Every `AC-N` cited by a task and by a test. Setup instructions
verified by following them on a clean clone.
