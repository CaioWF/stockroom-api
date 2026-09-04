---
type: state
title: Project state
description: Between-session work-state tracking the current active feature, recent decisions, blockers, and deferred ideas.
---

# STATE — Living project memory

> Working memory **between sessions** (humans and agents). It's **volatile**: updated all
> the time. Different from an **ADR** (a durable, immutable decision — see `docs/architecture/adr/`).
> Structural decision → ADR; work state → here. Update when **pausing/ending**; read when
> **resuming**. Use the `handoff` skill. Injected into context at the start of each session.

**Last updated:** 2026-09-04 by Claude (Sonnet 5)

## In progress / next step

- Active feature: `specs/001-authentication/` — implement phase, branch `001-authentication`.
- `tasks.md` has 18 tasks; **ALL 18 ARE IMPLEMENTED AND REVIEWED CLEAN.** Two additional
  follow-up fixes (AC-21 missing test + AC-7 documentation bug; `create-table.ts` TTL race) were
  found and are also implemented and reviewed clean. Tasks 1-5 are committed (`c4728a3`,
  `5d69f6f`). Everything else (Tasks 6-18 + both fixes) is implemented, all reviewed Approved,
  but **NOT YET committed** — sitting in the working tree at git-tree snapshot
  `fdd81009b345d2612c4cfddd852ab8df1dd32063`. Full ledger with every tree SHA, brief, report, and
  reviewer verdict: `.git/sdd/001-authentication/progress.md` (untracked, outside the working
  tree).
- **Local DynamoDB is running** (`docker compose up -d`) — left up intentionally.
- **`review-and-simplify` step 1 (the 7 parallel lenses) is DONE.** All findings aggregated in
  the ledger. Two decisions were put to the human and answered: (a) add a 7th closed-set error
  code `INVALID_ACCESS_TOKEN` rather than leave guard rejections conflated with
  `INVALID_CREDENTIALS` — touches `spec.md`'s FR24; (b) type the ~7 raw `throw new Error('string')`
  sites properly rather than just marking them `SPEC_DEVIATION`.
- **Fix 1 of 4 (filter + error taxonomy) is CLOSED — reviewed Approved with 1 Important + 1 Minor
  finding, both resolved.** Tree `982b8f3...` (implemented) reviewed against base `68ccdcc...`.
  Findings 2/3/4 (message leak, `INVALID_ACCESS_TOKEN`, typed errors) verified fully closed by the
  reviewer independently (narrow `tsc` + 2 targeted e2e suites). Finding 1 (404 bypass for
  unmatched routes) was functionally correct but silently diverged `AC-27`/`contract.md`'s "every
  rejection is a problem document with closed-set code" promise — the fix's own new test asserts
  the opposite. Per explicit user decision, resolved by amending (not just `SPEC_DEVIATION`-only)
  `spec.md`'s AC-27 and `contract.md`'s AC-27 proof to carve out the unmatched-route case
  explicitly, plus adding the deferred `SPEC_DEVIATION` comment on `environment.schema.ts`'s raw
  throw. All doc/comment-only, no behavior change, `tsc` clean after. New tree
  `9e8f1328d0a27dc61a75d2b13370a31c73d39e17`. Full detail in the ledger's latest entries.
- **Fix 2 of 4 (login timing side-channel) is CLOSED — reviewed Approved (2 Low notes, neither
  blocking).** `authenticate-account.usecase.ts`'s unknown-email path now calls
  `passwordHasher.verify` against a hardcoded dummy argon2id digest (cost params matching
  `Argon2PasswordHasher`'s own constants exactly) before rejecting, so both rejection branches pay
  comparable argon2 cost. Implemented via TDD (spy call-count, red 0 -> green 1). Reviewer
  independently verified the core premise empirically against the real `@node-rs/argon2` library.
  Tree `bdde3247b4c577611e65b8998f006f036318e94c`. Full detail in the ledger.
- **Fix 3 of 4 (RSA key import memoization) is CLOSED — reviewed Approved (1 Low note, this
  update resolves it).** `Rs256AccessTokenSigner` caches the imported signing `CryptoKey`
  (`cachedKey` field, same `??=`-before-any-await pattern the key providers already use).
  `JwtAuthGuard` caches imported verification `CryptoKey`s in a `Map<string, Promise<CryptoKey>>`
  keyed by `kid` (not a single field — rotation can hold 2 trusted keys). Implemented via TDD (2
  new tests spying on `importPKCS8`/`importSPKI` call counts). Reviewer confirmed both
  memoizations are race-safe — the guard's cache check is fully synchronous with zero race window,
  stronger than a merely "harmless double import." Tree `ee66d7f617e23b4be3326f04a3cb006bfcea46f0`.
  Full detail in the ledger.
- **Fix 4 of 4 (contract.md AC-N stamping) is CLOSED.** `evaluator` ran, re-verified all 27 ACs
  genuinely against the real suite/code (not copied from checkboxes) — all PASS, plus the
  Full-Suite Check. Cross-check against `spec.md` found zero gaps/stale/drift. One proof
  line-reference corrected (AC-27). No code/test edits — only `contract.md`'s own status/proof
  fields, per the skill's constraint. Tree `e229621430ffd361f59be0958f3e9d5e5776b39a`.
- **ALL FOUR REVIEW-AND-SIMPLIFY FIXES CLOSED. Every AC verified PASS. Full 7-lens
  review-and-simplify pass then ran over the whole milestone diff (`5d69f6f..e229621`) — the
  MANDATORY pre-commit gate.** Found 5 real Important findings across 3 lenses (code-review x2,
  security-review x1+1Minor, api-contract x2+3Minor) — all 5 fixed (execute() size, missing
  SPEC_DEVIATION markers, residual login-timing side-channel in `user.repository.ts`, missing
  `application/problem+json` content-type, AC-12 contract/test drift). One Important
  (key-rotation-cache TTL) legitimately DEFERRED — `spec.md`'s own Out of Scope section says
  performing a key rotation isn't part of this feature. All 5 fixes independently re-verified by
  re-dispatching the 3 lenses that raised them; zero new findings, including mutation-testing
  verification. Tree `c3115ce8619f804310cc8ae1d69d14d2c16a9807`. Full suite green: unit 151/151,
  integration 4/4, e2e 33/33, gates green. **REVIEW-AND-SIMPLIFY step 1 (all lenses) is CLEAN.**
- **`simplify` ran: zero changes needed** — every file already within the CLAUDE.md/constitution
  style bar after 3 review rounds this session. Baseline re-confirmed green (unit 151/151,
  integration 4/4, e2e 33/33, gates green). Tree unchanged, `c3115ce8619f804310cc8ae1d69d14d2c16a9807`.
- **REVIEW-AND-SIMPLIFY COMPLETE. Milestone ready for commit.**
- **Next concrete step:** propose the milestone commit message(s) to the human and wait for
  explicit approval (Tasks 1-5 already committed as `c4728a3`/`5d69f6f`; this covers Tasks 6-18 +
  all review-and-simplify work).

## Recent decisions

- 2026-09-02/03: see prior entries in `.git/sdd/001-authentication/progress.md` and this file's
  git history — product brief, constitution, spec/plan/tasks all approved; Tasks 1-13 implemented
  across the prior session (full detail in the ledger, not repeated here).
- 2026-09-04, Task 14 (liveness + JWKS routes, AC-13/AC-22): both routes `@Public()`, health
  route has zero constructor dependencies so AC-22 holds by construction. Review found one
  Important finding — a circular import between `jwks.controller.ts` and `auth.module.ts` worked
  around with `forwardRef`, functionally correct but avoidable — fixed by extracting the DI token
  to its own file (`verification-key-set-provider.token.ts`) with `auth.module.ts` re-exporting
  it for backward compatibility. Re-review confirmed clean.
- 2026-09-04, Tasks 15/16 (OpenAPI contract route + Lambda transport, AC-26/AC-23): **dispatched
  as a parallel batch with `isolation: "worktree"` — this failed.** Both worktrees were created at
  the last real commit (`5d69f6f`), which predates ALL of Tasks 6-14's uncommitted work, since
  this project commits only at milestone boundaries. Task 15's implementer correctly reported
  BLOCKED. Task 16's implementer didn't hit a hard blocker but silently worked against an empty
  `AppModule` stub, producing a weaker test than intended. Controller merged Task 16's changes by
  hand (files + a manually-reconciled `package.json`, real `npm install`), found and fixed one
  real integration bug the stale worktree had hidden (missing `set-test-environment` import,
  surfaced only once running against the real `AppModule`), re-verified the full suite, then had
  it reviewed clean against the real merged tree. **Decision, still in effect: no more
  `isolation: "worktree"` dispatch-parallel on this feature until the first real commit lands.**
  Task 15 was then redispatched solo, directly in the main worktree — implemented and reviewed
  clean (OpenAPI via `@asteasolutions/zod-to-openapi`, error-code enum shared at the source level
  with `problem-details.filter.ts` via an exported `PROBLEM_CODES` const, so no drift risk).
- 2026-09-04, Task 17 (e2e suite — full lifecycle + AC-27's missing proof file): added
  `test/e2e/contract/problem-details.e2e-spec.ts` and `test/e2e/contract/lifecycle.e2e-spec.ts`
  (register → login → guarded call → refresh → guarded call with the new token). TDD caught a
  real flake (asserting old-token !== new-token, false when both land in the same wall-clock
  second since `iat` is second-truncated with no `jti`) — fixed by asserting identity equality
  instead. Its completeness check found the AC-7/AC-21 gap resolved below.
- 2026-09-04, Task 18 (setup docs): `README.md` written and actually verified by following it
  twice on independent clean-clone snapshots (`git stash create` + `git archive`, since HEAD
  trails 17+ uncommitted tasks — a plain clone/worktree-at-HEAD would have missed all of them).
  Found and fixed 3 real runbook gaps (`.env` never auto-loaded; two AWS credential vars needed
  beyond `.env.example`; a docker port-collision failure mode) and documented, without
  overclaiming, that the local dev server's `/auth/login`/`/.well-known/jwks.json` genuinely need
  real AWS SSM credentials (no local Parameter Store emulator exists), while the full test suite
  needs none. Its investigation found the `create-table.ts` TTL-race gap resolved below.
- 2026-09-04, **both gaps found by Tasks 17/18 were fixed**, per explicit human decision to close
  them before the final review rather than defer:
  - AC-21 (cross-account refresh credential resolves to nothing) had no real test despite
    `contract.md` claiming one — added a genuine, non-vacuous integration test to
    `refresh-token-repository.int-spec.ts` exercising the exact repository call
    `rotate-refresh-token.usecase.ts` makes on the real request path.
  - AC-7 (strongly-consistent sign-in reads) turned out to be a **documentation bug, not a
    missing test** — `plan.md`'s own "How to Validate" section explicitly says read consistency
    cannot be meaningfully integration-tested against local DynamoDB (it always serves consistent
    reads regardless of the flag) and is a review-enforced property instead. Fixed `contract.md`'s
    AC-7 entry to point at the real proof (`ConsistentRead: true`, already present in
    `user.repository.ts`) rather than fabricating a test that would prove nothing. Also fixed 5
    filename typos in `contract.md` (AC-14/15/16/18/19).
  - `create-table.ts`'s TTL-enable race: the file's own header comment named
    `ValidationException` as the exception to catch, but investigation found this SDK version
    doesn't actually export that class — the real shape is a generic `DynamoDBServiceException`
    with `name: 'ValidationException'`. Fix narrows the catch to `instanceof` + `name` + a message
    substring (deliberately not just `name`, which is also used for real unrelated validation
    failures). New `test/unit/scripts/create-table.spec.ts` (3 tests) exercises the real
    branching logic through the public `ensureTableExists` function. One implementer dispatch for
    this fix died to a session rate limit after finishing all real work but before writing its
    report — the controller verified the diff directly, ran the full suite, fixed 3 minor
    prettier issues, and wrote the report itself before dispatching review.
  - All three reviewed Approved, no Critical/Important findings on any.

## Blockers

None. No known open gaps as of this update.

## Deferred ideas / technical backlog

- Sign-out, password reset, email verification, account deletion, email change — out of scope
  for `001-authentication` (see `spec.md`'s Out of Scope section).
- The `docker-compose.yml` DynamoDB Local image is pinned to `:latest` rather than a fixed tag —
  low-priority, not blocking (Task 18's README already documents the local setup working as-is).
- Full list of Minor findings carried across every task and fix this session (not blocking, all
  with exact file:line references): see `.git/sdd/001-authentication/progress.md` in full — too
  long to duplicate here without drifting out of sync. Point the `review-and-simplify` lenses at
  that file.

## Loose todos

- [ ] Run `review-and-simplify` (code-review + security-review + simplify) over the full
  milestone diff — mandatory, has not run yet.
- [ ] After review-and-simplify: propose the milestone commit(s) and wait for approval.
- [ ] `learn-session` should route the dispatch-parallel-worktree-staleness trap (this session's
  biggest process finding — `isolation: "worktree"` silently uses a stale base when the feature
  hasn't committed yet) into `docs/gotchas.md`, so a future feature that also hasn't committed
  doesn't rediscover it the hard way.
