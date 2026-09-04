# Authentication — Verification Contract

> Everything needed to verify this feature, in one place. The spec is the authoritative statement
> of each criterion; each section below references `AC-N` with a short label and names the proof,
> the command, and the observable. `status:` is filled by `evaluator`, not at authoring time.

## Environment

- **start**: `docker compose up -d dynamodb` — local DynamoDB on the port fixed in
  `docker-compose.yml`. Then `npm run db:create-table` to create the single table idempotently.
- **env**: copy `.env.example` to `.env`. It names every variable the configuration schema parses:
  the table name, the storage endpoint and region, the token issuer and audience, the three
  lifetimes (access, refresh, session ceiling), and both key-parameter names. No value in the
  example file is a real secret.
- **fixtures**: `npm run keys:generate` writes a development key pair outside version control.
  There is no seed file: the end-to-end suites create the accounts they need through the public
  routes, because a fixture that bypassed registration would not exercise the path being verified,
  and the integration suites drive the repositories directly with data they write themselves.
- **credentials**: `N/A` — every suite registers the account it needs and discards it.
- **teardown**: `docker compose down -v` drops the local table and its data. Within a single run
  the suites use distinct generated addresses, so no reset is required between tests.

## AC-1 — Registration returns the account, not a token

- **proof**: `test/e2e/auth/register.e2e-spec.ts`
- **command**: `npm run test:e2e -- register`
- **observable**: `201` carrying the account id and the normalized email; the body contains no
  token and no password material.
- **status**: PASS (evaluator, 2026-09-04)

## AC-2 — Duplicate address, case- and whitespace-insensitive

- **proof**: `test/e2e/auth/register.e2e-spec.ts`
- **command**: `npm run test:e2e -- register`
- **observable**: the second registration answers `409` with code `EMAIL_ALREADY_REGISTERED`, and
  storage still holds one account.
- **status**: PASS (evaluator, 2026-09-04)

## AC-3 — Password length policy

- **proof**: `test/unit/auth/domain/raw-password.spec.ts` and `test/e2e/auth/register.e2e-spec.ts`
- **command**: `npm run test:unit -- raw-password && npm run test:e2e -- register`
- **observable**: 11 and 129 characters are both refused with `422` and code
  `PASSWORD_LENGTH_INVALID`; no account is created.
- **status**: PASS (evaluator, 2026-09-04)

## AC-4 — Concurrent registration of one address

- **proof**: `test/integration/user-repository.int-spec.ts`
- **command**: `npm run test:integration -- user-repository`
- **observable**: of two simultaneous registrations one succeeds and one is refused as a
  duplicate; the table holds exactly one account item and one email-lock item.
- **status**: PASS (evaluator, 2026-09-04)

## AC-5 — Sign-in returns both tokens and both lifetimes

- **proof**: `test/e2e/auth/login.e2e-spec.ts`
- **command**: `npm run test:e2e -- login`
- **observable**: `200` with an access token, a refresh token, and both remaining lifetimes as
  integer seconds.
- **status**: PASS (evaluator, 2026-09-04)

## AC-6 — One indistinguishable rejection

- **proof**: `test/e2e/auth/login.e2e-spec.ts`
- **command**: `npm run test:e2e -- login`
- **observable**: wrong password and unknown address produce byte-identical bodies, both `401`
  with code `INVALID_CREDENTIALS`.
- **status**: PASS (evaluator, 2026-09-04)

## AC-7 — Sign-in reads are strongly consistent

- **proof**: code review — `src/auth/infrastructure/dynamo/user.repository.ts` (`ConsistentRead:
  true` on both `findByEmail` and `findById`)
- **command**: N/A — review-enforced per plan.md's "How to Validate": local DynamoDB always serves
  consistent reads regardless of the flag, so no integration test can distinguish a correctly set
  flag from a removed one; a test here would pass either way, which is false confidence rather than
  proof.
- **observable**: both read paths sign-in depends on pass `ConsistentRead: true` to DynamoDB.
- **status**: PASS (evaluator, 2026-09-04)

## AC-8 — Caller identity on a guarded route

- **proof**: `test/e2e/auth/me.e2e-spec.ts`
- **command**: `npm run test:e2e -- me`
- **observable**: `200` carrying the signed-in account's id and email, with the storage client
  asserted to have issued no request while serving it — both values come from the token.
- **status**: PASS (evaluator, 2026-09-04)

## AC-9 — Guarded route without a credential

- **proof**: `test/e2e/auth/me.e2e-spec.ts`
- **command**: `npm run test:e2e -- me`
- **observable**: `401`.
- **status**: PASS (evaluator, 2026-09-04)

## AC-10 — Algorithm confusion is refused

- **proof**: `test/e2e/auth/guard.e2e-spec.ts`
- **command**: `npm run test:e2e -- guard`
- **observable**: a token signed HS256 using the published public key as the secret is refused
  with `401` — the verifier accepts only the pinned algorithm.
- **status**: PASS (evaluator, 2026-09-04)

## AC-11 — Unknown key id and expired token

- **proof**: `test/e2e/auth/guard.e2e-spec.ts`
- **command**: `npm run test:e2e -- guard`
- **observable**: both are refused with `401`.
- **status**: PASS (evaluator, 2026-09-04)

## AC-12 — Default deny

- **proof**: `test/e2e/auth/guard.e2e-spec.ts` (a route absent from the public list is refused
  without a credential) and `test/unit/auth/presentation/public-route-allowlist.spec.ts` (the
  public list is asserted to hold exactly the six documented routes, by reflecting `@Public()`'s
  metadata off every controller — a review-and-simplify finding: the six-route count was
  previously stamped PASS against a claim `guard.e2e-spec.ts` explicitly did not test).
- **command**: `npm run test:e2e -- guard && npm run test:unit -- public-route-allowlist`
- **observable**: a route absent from the public list is refused without a credential, and the
  public list is asserted to hold exactly the six documented routes.
- **status**: PASS (evaluator, 2026-09-04; re-verified after review-and-simplify)

## AC-13 — Published key set

- **proof**: `test/e2e/jwks.e2e-spec.ts`
- **command**: `npm run test:e2e -- jwks`
- **observable**: `200` without authentication, every trusted key present, each key id equal to
  its thumbprint, and an explicit cache lifetime header.
- **status**: PASS (evaluator, 2026-09-04)

## AC-14 — Rotation issues a successor and retires the presented token

- **proof**: `test/unit/auth/application/rotate-refresh-token.usecase.spec.ts` and
  `test/e2e/auth/refresh.e2e-spec.ts`
- **command**: `npm run test:unit -- rotate && npm run test:e2e -- refresh`
- **observable**: `200` with a new pair; presenting the original again no longer yields a pair.
- **status**: PASS (evaluator, 2026-09-04)

## AC-15 — Benign replay refuses without revoking

- **proof**: `test/unit/auth/application/rotate-refresh-token.usecase.spec.ts`
- **command**: `npm run test:unit -- rotate`
- **observable**: replaying a retired token whose successor is still the live tip answers `401`,
  the successor keeps working, and an anomaly event is emitted.
- **status**: PASS (evaluator, 2026-09-04)

## AC-16 — Proven second chain revokes everything

- **proof**: `test/unit/auth/application/rotate-refresh-token.usecase.spec.ts`
- **command**: `npm run test:unit -- rotate`
- **observable**: replaying a retired token whose successor has itself rotated answers `401`, and
  every outstanding token for the account is refused afterwards, including the live tip.
- **status**: PASS (evaluator, 2026-09-04)

## AC-17 — Concurrent rotation of one token

- **proof**: `test/integration/refresh-token-repository.int-spec.ts`
- **command**: `npm run test:integration -- refresh-token-repository`
- **observable**: of two simultaneous presentations exactly one receives a successor; no second
  live chain exists in the table.
- **status**: PASS (evaluator, 2026-09-04)

## AC-18 — Expiry and the session ceiling

- **proof**: `test/unit/auth/application/rotate-refresh-token.usecase.spec.ts`
- **command**: `npm run test:unit -- rotate`
- **observable**: both are refused with `401`, including when the stored item is past its expiry
  but has not been collected — expiry is decided against the injected clock, not by storage.
- **status**: PASS (evaluator, 2026-09-04)

## AC-19 — Successor never outlives the ceiling

- **proof**: `test/unit/auth/application/rotate-refresh-token.usecase.spec.ts`
- **command**: `npm run test:unit -- rotate`
- **observable**: rotating close to the ceiling produces a successor whose expiry equals the
  ceiling rather than a full refresh lifetime beyond it.
- **status**: PASS (evaluator, 2026-09-04)

## AC-20 — Malformed refresh credential

- **proof**: `test/unit/auth/domain/refresh-token-credential.spec.ts` and
  `test/e2e/auth/refresh.e2e-spec.ts`
- **command**: `npm run test:unit -- refresh-token-credential && npm run test:e2e -- refresh`
- **observable**: wrong segment count, a malformed id segment, and an oversized secret each answer
  `401` with code `INVALID_REFRESH_TOKEN`; no storage-engine error text appears in the response or
  the logs.
- **status**: PASS (evaluator, 2026-09-04)

## AC-21 — Cross-account credential resolves to nothing

- **proof**: `test/integration/refresh-token-repository.int-spec.ts`
- **command**: `npm run test:integration -- refresh-token-repository`
- **observable**: a credential naming one account with another's token id answers `401` and
  returns no data from either account.
- **status**: PASS (evaluator, 2026-09-04)

## AC-22 — Liveness touches nothing

- **proof**: `test/e2e/health.e2e-spec.ts`
- **command**: `npm run test:e2e -- health`
- **observable**: `200`, with the storage client asserted to have issued no request and the
  parameter-store fetch behind both key providers asserted never to have been called — the
  assertion is on the underlying fetch, not on the provider method, because memoization would hide
  a call made by an earlier test in the same process.
- **status**: PASS (evaluator, 2026-09-04)

## AC-23 — Initialization failure answers a valid envelope

- **proof**: `test/e2e/transport/lambda-handler.e2e-spec.ts`
- **command**: `npm run test:e2e -- lambda-handler`
- **observable**: with bootstrap forced to fail, the handler returns a well-formed load-balancer
  envelope with status `503` instead of throwing.
- **status**: PASS (evaluator, 2026-09-04)

## AC-24 — Correlation id is not attacker-chosen

- **proof**: `test/unit/shared/observability/correlation-id.spec.ts`
- **command**: `npm run test:unit -- correlation-id`
- **observable**: a trace header failing the grammar is discarded and a generated id is emitted
  instead; a conforming one is preserved.
- **status**: PASS (evaluator, 2026-09-04)

## AC-25 — Logs carry no credential

- **proof**: `test/unit/shared/observability/structured-logger.spec.ts`
- **command**: `npm run test:unit -- structured-logger`
- **observable**: given a payload containing a password, both tokens, an authorization header, and
  a password digest, the emitted line contains none of them — only allow-listed fields appear.
- **status**: PASS (evaluator, 2026-09-04)

## AC-26 — The contract is public and complete

- **proof**: `test/e2e/contract/openapi.e2e-spec.ts`
- **command**: `npm run test:e2e -- openapi`
- **observable**: fetched without a credential; every route in the spec is present, and the error
  codes are published as a closed set.
- **status**: PASS (evaluator, 2026-09-04)

## AC-27 — Every rejection is a problem document

- **proof**: `test/e2e/contract/problem-details.e2e-spec.ts`
- **command**: `npm run test:e2e -- problem-details`
- **observable**: each rejection path handled by an application route returns a problem document
  whose code is a member of the closed set and whose status field matches the HTTP status line.
  An unmatched-route request (`NotFoundException`, no application route exists) is carved out of
  this contract — `problem-details.filter.ts` lets it bypass the closed-code mapping, so it
  returns Nest's own 404 shape instead; `PROBLEM_CODES` explicitly excludes it, asserted by
  `test/e2e/contract/problem-details.e2e-spec.ts:174-182`.
- **status**: PASS (evaluator, 2026-09-04)

## Full-Suite Check

- **command**: `.specify/gates/run-gates.sh`
- **status**: PASS (evaluator, 2026-09-04)
