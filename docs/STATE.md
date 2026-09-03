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

**Last updated:** 2026-09-03 by Claude (Sonnet 5)

## In progress / next step

- Active feature: `specs/001-authentication/` — implement phase, branch `001-authentication`.
- `spec.md` and `plan.md` are both `status: approved`. `tasks.md` has 18 tasks, `contract.md`
  has 27 `AC-N` proof rows, all still `PENDING` (no task has reached full verification yet).
- Implementation runs via `subagent-driven-development` in `dispatch-parallel` mode, using
  git tree snapshots (`write-tree`), not commits, as the per-task review baseline. The ledger
  at `.git/sdd/001-authentication/progress.md` (untracked, outside the working tree) has the
  full detail — tree SHAs, per-task briefs, reports, diff packages, and reviewer verdicts.
- **Next concrete step:** re-run the task reviewers for Task 4 (shared observability) and
  Task 5 (domain value objects). Both were implemented and merged into tree
  `b8217a55df0092a64e8663f519a6f3a0af2ad801`, but their review dispatches failed mid-run on an
  API rate limit (session reset 2pm America/Fortaleza), not on any defect. Diff packages
  already exist at `.git/sdd/001-authentication/task-4-diff.md` and `task-5-diff.md` — a
  fresh reviewer dispatch can reuse them without rebuilding.
- Known items the Task 4/5 reviewers must specifically check (not yet adjudicated):
  - **T4** — the log field allow-list was the implementer's own invention (the brief only
    named forbidden fields); confirm it is genuinely an allow-list, not a denylist.
    `resolveCorrelationId` preserves the whole trace header verbatim rather than only the
    `Root=` segment — check this against `AC-24`'s intent in `spec.md`.
  - **T5** — `npm run lint` has 5 real, uncorrected errors in
    `test/unit/auth/domain/password-digest.spec.ts` around line 47:
    `restrict-template-expressions`, `no-unsafe-assignment`, `no-unsafe-call`,
    `no-require-imports`, `no-unsafe-member-access`. Almost certainly a
    `require('node:util').inspect(...)` leak-check written the wrong way — needs a fix
    (`import` instead of `require`, remove the `any`). This is a real finding, not noise.
    Minor-only items: email max length of 254 (implementer's defensible judgment call, not
    spec-mandated) and `PasswordDigest.expose()` naming (Task 6, not yet written, should
    confirm its port names match).
- After both reviews close (fix pass if needed, re-review to confirm): stage and commit the
  whole batch as one commit (Tasks 2-5 landed together as one tree), then continue the
  `subagent-driven-development` loop at Batch 3 (Task 6 — domain entities, rotation outcome
  union, typed errors, the eight port interfaces; solo, `src/auth/domain/**`, Sonnet).
- Remaining batches after that, per the plan already fixed in `tasks.md`:
  `B5=[T8,T12]` (Opus on T12) → `B6=[T9]` (Opus) → `B7=[T13]` (Opus) → `B8=[T14]` →
  `B9=[T15,T16]` (Opus on T16) → `B10=[T17,T18]`.

## Recent decisions

- 2026-09-02: Product brief and constitution written (`.specify/memory/`). Product = Stockroom,
  a hosted product-catalog API. Constitution fixes strict TypeScript, allow-list authorization,
  the AWS SDK confined to any `infrastructure/` directory (amended from a single top-level
  `infra/` during the feature's design), and `src/shared/persistence/` as a declared shared
  kernel owning the table's key grammar only (narrowed from also owning item mappers, after a
  cross-document `analyze` pass caught that it would invert the dependency rule).
- 2026-09-02: Feature order fixed as `001-authentication → 002-request-throttling →
  003-product-catalog → 004-cloud-infrastructure → 005-catalog-console` — throttling moved
  ahead of the catalog because the auth routes ship with no rate control.
- 2026-09-02: `specs/001-authentication/brainstorm.md` went through two adversarial review
  cycles (23 then 26 findings) before the design settled. Key corrections: refresh-token
  rotation as one `TransactWriteItems` (account-generation `ConditionCheck` + conditional
  retirement + successor `Put`), reuse detection by successor-chain comparison rather than a
  time window, RS256 + JWKS with the algorithm pinned in the guard, lazy in-handler Lambda
  bootstrap (nothing at module scope) so a cold-start failure still answers `503`.
- 2026-09-03: `clarify` and a cross-document `analyze` pass tightened `spec.md`: RFC 9457
  problem-document error contract with a closed `code` enum, registration returns no token,
  `GET /auth/me` reads only the token (no storage call) with the email as an informational
  claim never used for authorization, UUIDv7 hand-written behind `IdGenerator` (stdlib only
  has v4), the anomaly event emitted from presentation rather than via a ninth port.
- 2026-09-03: Started implementation on branch `001-authentication` (was `main`; a fresh
  branch was chosen explicitly per `subagent-driven-development`'s hard rule against starting
  on the default branch). Model routing: Opus only on Tasks 9, 10, 12, 13, 16 (rotation logic,
  crypto/UUIDv7, DynamoDB transactions, the guard, the Lambda transport); Sonnet elsewhere.
- 2026-09-03: Learned mid-session that `isolation: "worktree"` cuts a worktree from the last
  **commit**, which is incompatible with this project's no-commit-per-task convention (tree
  snapshots only) unless each batch's scaffold is committed before the next parallel batch
  dispatches. Task 1's scaffold was committed (`chore: scaffold the application`) specifically
  to unblock Batch 2's four parallel worktrees after their first attempt found an empty tree.
- 2026-09-03: Discovered the `rtk` hook transparently rewrites bare `git` commands and
  truncates large `git diff` output with an embedded `[N more lines]` marker — including
  through the documented `rtk proxy` debug escape hatch, which does not actually bypass it for
  a full (non-`--stat`) diff. Workaround in use: call `/usr/bin/git` by absolute path when
  building a reviewer's diff package. Filed as product feedback; not a project decision.

## Blockers

- [ ] Task 4 and Task 5 code review — blocked on the API session rate limit resetting (2pm
  America/Fortaleza per the error message), not on any defect in the code itself. Since
  2026-09-03.

## Deferred ideas / technical backlog

- Sign-out, password reset, email verification, account deletion, email change — all explicitly
  out of scope for `001-authentication` (see `spec.md`'s Out of Scope section for the reasoning
  behind each). Revisit each as its own feature once `005-catalog-console` needs it.
- The `docker-compose.yml` DynamoDB Local image is pinned to `:latest` rather than a fixed tag
  (Minor finding from Task 1's review, carried to the final whole-branch review) — fix before
  `Task 18`'s clean-clone verification, since reproducibility is exactly what that task checks.

## Loose todos

- [ ] Re-dispatch Task 4 and Task 5 reviewers (diff packages already built, see above).
- [ ] Apply the Task 5 lint fix (`password-digest.spec.ts`) once its review confirms the finding.
- [ ] Commit the Task 2-5 batch once both reviews are clean.
- [ ] Continue `subagent-driven-development` at Task 6, then the remaining batches through
  Task 18, per `tasks.md`.
- [ ] After all 18 tasks: final whole-branch review, then `review-and-simplify`
  (code-review + security-review lenses + simplify pass) before any commit is proposed as
  the feature's final state — per the constitution, this is mandatory and has not run yet.
