# Project Constitution

## Principles

- **The read path is the product.** Sign-in, pagination, and throttling are not plumbing around
  the feature — they are the feature. Correctness there outranks breadth everywhere else: a
  catalog endpoint that pages wrong or leaks under load is a broken product, however many fields
  the product record has.
- **The contract is public and written down.** Every HTTP surface has an OpenAPI description
  generated from the code that serves it, so the document cannot drift from the implementation.
  A change that breaks a client is a new version, never a silent edit.
- **Idle costs nothing.** Compute and storage are pay-per-use. Any always-on component has to
  earn its standing cost in an ADR — today the load balancer is the single one, and it is there
  to keep a path open for services that are not Lambda.
- **The repository is the whole system.** Infrastructure is Terraform, the local environment is
  Docker, and both are reproducible from a clean clone. Nothing that matters is configured by
  hand in a console, because nothing configured by hand survives review.
- **Secure by default, and by allow-list.** Short-lived tokens, hashed passwords, no secret in
  git. Every authorization decision names what is permitted and rejects the rest.
- **Done means proven.** A behavior with no failing-test-first has not been built, and a claim
  with no command output behind it has not been verified.

## Code Standards

- **TypeScript is strict; `any` is banned.** `strict: true`, `noUncheckedIndexedAccess: true`.
  Untrusted input enters as `unknown` and is parsed at the trust boundary into a typed value —
  never cast through.

  ```ts
  // wrong — a cast is a lie the compiler cannot check
  const body = req.body as LoginRequest;

  // right — parse at the boundary, then the type is earned
  const body: LoginRequest = loginRequestSchema.parse(req.body);
  ```

- **Authorization allow-lists.** Checks on `role`, `source`, `type`, `origin`, or similar name the
  permitted value; unknown values are denied by default. Prefer an enum over a string literal.

  ```ts
  // wrong — blacklist (new values pass through silently)
  if (caller.role === 'revoked') throw new ForbiddenException();

  // right — whitelist (new values are blocked by default)
  if (!ALLOWED_ROLES.has(caller.role)) throw new ForbiddenException();
  ```

- **The AWS SDK does not leave `infra/`.** Domain and application code depend on a port
  (`ProductRepository`, `RateLimitStore`, `Clock`); only an adapter imports `@aws-sdk/*`. A grep
  for `@aws-sdk` outside `infra/` is a review failure.

- **Naming crosses the persistence boundary once.** `camelCase` in code, the single-table
  attribute names (`PK`, `SK`, `GSI1PK`, and `snake_case` payload attributes) only inside the
  repository adapter that maps them. A DynamoDB attribute name never appears in a use case.

- **Errors are typed and mapped at the edge.** The domain throws its own error classes; the HTTP
  layer is the only place that knows a status code. No `throw new Error('string')`, no raw AWS
  error escaping an adapter.

- **Size limits.** Functions 4–20 lines, files under 400. A function past 20 lines is asking to be
  two functions with names.

- **Logs are structured JSON with a correlation id**, and never contain a token, a password, a
  password hash, or an `Authorization` header value. User-facing output is plain text.

- **Comments say why.** The code already says what. A workaround cites the issue or commit SHA
  that explains it.

## Architecture Principles

> Non-negotiables distilled from the concept layer (`architecture` skill). Depth and rationale
> live in the guides; here only the rules the agent must always follow.

- **Dependency rule:** dependencies point inward. The domain (entities, business rules) does
  NOT import framework, I/O, database, HTTP, or infra details. Infra depends on the domain, never the reverse.
- **Pure domain:** business logic stays testable without spinning up a framework/network/database.
  Side effects stay at the edges (adapters/infra).
- **Aggregate boundary (DDD):** mutations go through the aggregate root; invariants are guaranteed
  there. Do not alter internal entities from outside the root.
- **Test behavior, not implementation:** tests verify inputs/outputs/observable effects, never
  mocks or internal details (see the `test-driven-development` skill).
- **Minimum viable:** climb the laziness ladder (does it need to exist? → reuse → stdlib → native
  → installed dep → one-liner → minimum) before adding a dep, abstraction, or feature. Never at
  the expense of trust-boundary validation, data loss, security, or a11y (see the `minimalism.md`
  guide).
- **The transport is an adapter.** The load-balancer event shape reaching the function is an infra
  detail, confined to the handler that translates it into the framework's request. Swapping the
  entry point must not touch a use case or a domain entity.
- **One module owns the table.** Single-table design is a persistence decision; key construction
  and item mapping live in one place. No other module builds a key.
- **Time and randomness are injected.** Token expiry and rate-limit windows depend on a `Clock`
  port, so their behavior is testable without waiting.

## SDD Process

- **Phase 1 — Investigation & Spec.** `brainstorming` (with `doubt-driven-development` as the
  adversarial gate) → `prd-writer` → `spec-writer` → `clarify` → `plan-writer` → `tasks-writer` →
  `analyze`. Acceptance criteria are tagged `AC-N` in the spec and each one is cited by the task
  that delivers it. `spec.md` and `plan.md` both reach `status: approved` before any code is
  written; the phase-gate hook enforces it and is never disabled or worked around.
- **Phase 2 — Implementation.** `implement-and-evaluate` drives `implement-feature` → `evaluator`
  → `fix-runner` until every `AC-N` in `contract.md` is satisfied and `.specify/gates/run-gates.sh`
  is green. TDD is not optional: a failing test first, minimal code to pass, then refactor, per
  behavior. Tests assert observable behavior and never assert on a mock. A knowing divergence from
  the approved spec is marked with a `SPEC_DEVIATION` comment that says why.
- **Phase 3 — Review & Validation.** `review-and-simplify` is mandatory before any commit is
  proposed: the `code-review` and `security-review` lenses in parallel, then a behavior-preserving
  `simplify` pass. Feedback is processed through `receiving-code-review` — verified before
  implemented, and argued with when it is wrong.
- **Phase 4 — Merge & Deploy.** Changes accumulate and are committed at the end of a feature or
  milestone, never per task or per TDD cycle, and only after explicit approval of the proposed
  message. `finishing-a-development-branch` presents the integration options and cleans up the
  worktree. Terraform changes ship as `plan` output reviewed before `apply`; no infrastructure
  reaches an account without that diff being read.
