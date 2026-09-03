# Tasks — Authentication

## Implementation Checklist

> Every task that delivers an acceptance criterion cites the corresponding `AC-N` from the spec.
> Scopes are declared honestly: the plan chose a **horizontal layer** axis, so most of these tasks
> share `src/auth/**` and therefore serialize. Only Tasks 3 and 4 are genuinely file-disjoint.

- [ ] Task 1: Project skeleton — strict TypeScript, framework, test runner, lint, local DynamoDB compose file [scope: package.json, tsconfig*.json, .eslintrc*, .prettierrc*, jest.config*, docker-compose.yml, .env.example]
- [ ] Task 2: Typed configuration — one schema for every environment variable, parsed once [scope: src/shared/config/**, test/unit/shared/config/**]
- [ ] Task 3: Shared persistence kernel — document client provider and the key grammar [scope: src/shared/persistence/**, test/unit/shared/persistence/**]
- [ ] Task 4: Shared observability — allow-list logger and correlation-id resolver (AC-24, AC-25) [scope: src/shared/observability/**, test/unit/shared/observability/**]
- [ ] Task 5: Domain value objects — email, password, digest, refresh credential (AC-3, AC-20) [scope: src/auth/domain/**, test/unit/auth/domain/**]
- [ ] Task 6: Domain entities, rotation outcome union, typed errors, and the eight ports [scope: src/auth/domain/**, test/unit/auth/domain/**]
- [ ] Task 7: In-memory fakes — a real implementation of every port [scope: test/fakes/**]
- [ ] Task 8: Register and authenticate use cases (AC-1, AC-2, AC-3, AC-5, AC-6) [scope: src/auth/application/**, test/unit/auth/application/**]
- [ ] Task 9: Rotate refresh token use case — all five outcome branches (AC-14, AC-15, AC-16, AC-18, AC-19) [scope: src/auth/application/**, test/unit/auth/application/**]
- [ ] Task 10: Crypto adapters — argon2id hasher, RS256 signer, UUIDv7 generator, system clock, dev key script [scope: src/auth/infrastructure/crypto/**, scripts/generate-dev-keys.ts, test/unit/auth/infrastructure/crypto/**]
- [ ] Task 11: Signing-key and verification-key-set providers, lazily memoized [scope: src/auth/infrastructure/keys/**, test/unit/auth/infrastructure/keys/**]
- [ ] Task 12: DynamoDB repositories, mappers, and the table bootstrap script (AC-4, AC-7, AC-17, AC-21) [scope: src/auth/infrastructure/dynamo/**, scripts/create-table.ts, test/integration/**]
- [ ] Task 13: Presentation — schemas, controllers, global guard, problem-details filter (AC-8, AC-9, AC-10, AC-11, AC-12, AC-20, AC-27) [scope: src/auth/presentation/**, src/auth/auth.module.ts, src/app.module.ts, test/e2e/auth/**]
- [ ] Task 14: Liveness and key-set routes (AC-13, AC-22) [scope: src/health/**, src/auth/presentation/jwks.controller.ts, src/app.module.ts, test/e2e/**]
- [ ] Task 15: Generated OpenAPI document served publicly (AC-26) [scope: src/app.module.ts, src/auth/presentation/**, test/e2e/contract/**]
- [ ] Task 16: Transport — lazy in-handler bootstrap and the response envelope (AC-23) [scope: src/lambda.ts, src/main.ts, test/fixtures/**, test/e2e/transport/**]
- [ ] Task 17: End-to-end suite — the full lifecycle plus every rejection path (AC-1 … AC-27) [scope: test/e2e/**]
- [ ] Task 18: Clean-clone setup documentation, verified by following it [scope: README.md, docs/**]

## Subtasks

### Task 1
- [ ] `tsconfig.json` with `strict` and `noUncheckedIndexedAccess` enabled.
- [ ] Framework scaffold, test runner, lint and format configuration, and every npm script the
      verification contract names: `test:unit`, `test:integration`, `test:e2e`, `lint`, `build`,
      `db:create-table`, `keys:generate`. The last two are wired to the scripts Tasks 10 and 12
      produce; the contract's `Environment` invokes them by name, so a missing script breaks
      verification before a single test runs.
- [ ] `docker-compose.yml` running local DynamoDB on a fixed port, with the service named
      `dynamodb` — the contract's `start` command addresses it by that name.
- [ ] `.env.example` listing every variable Task 2 will parse — names only, no values.
- [ ] `.gitignore` covering the generated development key pair and any local `.env`.

### Task 2
- [ ] One schema covering table name, endpoint and region, issuer, audience, the three lifetimes,
      and both key-parameter names.
- [ ] Fail fast and loudly at startup on a missing or malformed variable — never fall back to a
      silent default for a security-relevant value.
- [ ] Unit test: a valid environment parses; each malformed case is rejected with the offending
      variable named.

### Task 3
- [ ] Document client provider, constructed once per container, honouring the local endpoint when
      configured.
- [ ] `table-keys.ts` — the only place a key is built: account, email lock, refresh token.
- [ ] Unit test: each key builder produces the documented shape, and a normalized address maps to
      exactly one lock key.

### Task 4
- [ ] Trace-header grammar check with a generated fallback (AC-24).
- [ ] Allow-list logger: only named fields are emitted, everything else withheld (AC-25).
- [ ] Unit test: a malformed trace header is ignored in favour of a generated id; a payload
      containing a password, a token, and an authorization header emits none of them.

### Task 5
- [ ] `EmailAddress` — trim, NFC, locale-invariant lowercasing of the whole address, length bound.
- [ ] `RawPassword` — NFC, then 12..128 measured after normalization (AC-3).
- [ ] `PasswordDigest` — an opaque wrapper that never renders its contents in a string conversion.
- [ ] `RefreshTokenCredential` — parse three base64url segments, two UUIDv7-shaped, one of the
      exact secret length; reject anything else here rather than downstream (AC-20).
- [ ] Unit tests for each, including the case- and whitespace-equivalence that AC-2 depends on.

### Task 6
- [ ] `Account` aggregate carrying id, email, digest, and revocation generation.
- [ ] `RefreshToken` entity carrying both ids, digest, generation, session start, expiry,
      retirement timestamp, and successor.
- [ ] `rotation-outcome.ts` — the five-member discriminated union.
- [ ] Typed errors, one per failure the contract can express.
- [ ] The eight port interfaces, with no implementation.

### Task 7
- [ ] In-memory user and refresh-token repositories that enforce the same invariants as the real
      adapters, including uniqueness and conditional retirement.
- [ ] Controllable clock, deterministic id generator, and pass-through hasher and signer.
- [ ] These are fakes, not mocks: no test asserts on a call, only on observable state.

### Task 8
- [ ] `RegisterAccount`, test-first: success, duplicate address, password outside policy
      (AC-1, AC-2, AC-3).
- [ ] `AuthenticateAccount`, test-first: success returning both tokens and both lifetimes in
      seconds, and one indistinguishable rejection for wrong password and unknown address
      (AC-5, AC-6).
- [ ] Assert the rejection bodies are byte-identical, not merely both `401`.

### Task 9
- [ ] Happy rotation: successor issued, presented token retired (AC-14).
- [ ] Benign replay: successor is the live tip → refuse alone, emit the anomaly event (AC-15).
- [ ] Reuse detected: successor already rotated → increment generation, refuse (AC-16).
- [ ] Expired token and session past the ceiling → refuse, including when the stored item is past
      expiry but not yet collected (AC-18).
- [ ] Successor lifetime clamped to the session ceiling (AC-19).
- [ ] Every branch driven by the injected clock; no test waits.

### Task 10
- [ ] argon2id hasher at the OWASP parameters recorded in the plan.
- [ ] RS256 signer emitting `kid` as the RFC 7638 thumbprint, plus subject, issuer, audience,
      expiry.
- [ ] Refresh-secret digest: SHA-256 of the secret, and a constant-time comparison used wherever a
      presented secret is checked against a stored digest (FR15). Not argon2 — the secret is 256
      random bits, so a slow hash would burn CPU with nothing to protect.
- [ ] UUIDv7 generator, hand-written per RFC 9562 behind the `IdGenerator` port, with the layout
      asserted by unit tests — the standard library only offers v4.
- [ ] System clock adapter.
- [ ] `scripts/generate-dev-keys.ts` writing a development pair outside version control.
- [ ] Unit test: a digest verifies against its own password and fails against another; a signed
      token carries the expected claims and a thumbprint-derived `kid`.

### Task 11
- [ ] Signing-key provider — one private key, fetched lazily on first use, memoized per container.
- [ ] Verification-key-set provider — every trusted public key, same laziness.
- [ ] Unit test: the underlying fetch happens once across repeated calls, and not at construction.

### Task 12
- [ ] `user.mapper.ts` and `refresh-token.mapper.ts` — the only two files naming a storage
      attribute.
- [ ] `UserRepository`: registration as one transaction with the lock conditioned on absence;
      cancellation reasons inspected positionally so a duplicate becomes a typed error and a
      transaction conflict is retried (AC-4).
- [ ] Both sign-in reads strongly consistent (AC-7).
- [ ] `RefreshTokenRepository`: rotation as one transaction — condition check on the account's
      generation, conditional retirement, successor write (AC-17).
- [ ] A credential naming one account with another's token id resolves to nothing (AC-21).
- [ ] `scripts/create-table.ts`, idempotent, enabling expiry on the `ttl` attribute.
- [ ] Integration tests for the two concurrency properties, against local DynamoDB.

### Task 13
- [ ] Request schemas parsed at the boundary; nothing cast through.
- [ ] Controllers for register, login, refresh, and caller identity (AC-8).
- [ ] Global guard, default deny, with the public list holding exactly the six public routes
      (AC-9, AC-12).
- [ ] Verification pins the algorithm, requires a known `kid`, and checks issuer, audience, and
      expiry (AC-10, AC-11).
- [ ] Problem-details filter — the only place a status code is chosen, rendering the closed code
      set (AC-20, AC-27).
- [ ] Emit the anomaly event when the refresh controller renders a benign-replay outcome. The use
      case returns the classification; the edge logs it, so no logger reaches the application layer.

### Task 14
- [ ] Liveness route touching neither storage nor the signing key (AC-22).
- [ ] Key-set route serving every trusted key with an explicit cache lifetime (AC-13).

### Task 15
- [ ] Contract generated from the same schemas that validate requests.
- [ ] Served at a public route, with the error codes published as a closed set (AC-26).

### Task 16
- [ ] Nothing but pure module loading at module scope.
- [ ] Application promise created on first invocation inside the wrapped handler.
- [ ] Any escape, including a bootstrap failure, answered as a well-formed envelope with `503`
      (AC-23).
- [ ] A fixture of a real single-value load-balancer event, and a test that forces initialization
      to fail.

### Task 17
- [ ] Full lifecycle: register → sign in → guarded call → refresh → guarded call.
- [ ] Every rejection path, including the algorithm-confusion attempt.
- [ ] Assert every error body is a problem document whose code is a member of the closed set.

### Task 18
- [ ] A runbook that takes a clean clone to a running application and a passing suite.
- [ ] Follow it on a clean clone and fix whatever it fails to mention.

## Blockers

- None internal. This feature is first and nothing blocks it.
- Three obligations are handed forward to `specs/004-cloud-infrastructure` and are the reason a
  green local suite is not yet proof of a working deployment: the balancer must route `/auth/*`,
  `/.well-known/*`, `/health`, and the contract path; the target's header-handling mode must be
  set explicitly rather than inherited; and the deployment artifact must be installed for the
  runtime's own platform, because the password hash pulls in a native binary that resolves at
  install time.
- The auth routes ship with no rate control. `specs/002-request-throttling` closes that and was
  moved ahead of the catalog for this reason.

## Notes

- **Test runner.** The plan said "test runner" without naming one; recorded here as a decision
  rather than left to a coin-flip at implementation time: use the runner the framework's own
  scaffold ships with, since it integrates with the framework's testing module out of the box and
  adding a different one would be a dependency the laziness ladder does not justify.
- **The scopes are honest, not optimistic.** Tasks 5 and 6 share `src/auth/domain/**`, Tasks 8 and
  9 share `src/auth/application/**`, and Tasks 13, 14, and 15 all touch `src/app.module.ts`. They
  serialize, and that is correct — declaring them disjoint to win parallelism would clobber.
  Tasks 3 and 4 are the only genuinely disjoint pair.
- **TDD is not optional.** Every task above that produces behaviour writes the failing test first.
  Tasks 8, 9, and 12 are where this matters most, because their branches are the feature.
- **Two properties cannot be proven locally** and are enforced by review rather than by a test:
  storage-level expiry timing, and that a strongly-consistent read is actually requested. The plan
  names the two places consistency is required so a reviewer can find them.
- **Never assert on a mock.** Task 7 exists so the unit suites have real port implementations to
  run against.
