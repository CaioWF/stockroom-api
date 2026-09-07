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

**Last updated:** 2026-09-06 by caiowf

## In progress / next step

- **Feature 005 `terraform-aws-infrastructure` is finished and fully verified, but deliberately
  NOT committed.** It exists only in the working tree. `spec.md` and `plan.md` carry
  `status: approved`, all 10 tasks are checked, and every one of the 20 acceptance criteria is
  stamped `PASS` in `specs/005-terraform-aws-infrastructure/contract.md`.
- **Next concrete step, and the only thing gating this feature:** run the deploy runbook in
  `README.md` against a real AWS account — build the artifact, apply, write the key material, curl
  the endpoint. If it works, commit feature 005 and push it. If it cannot be validated, the
  decision already taken is to drop it rather than publish unproven infrastructure.
- Everything else is done: `npm run infra:check` exits 0 with no AWS credentials and plans 20
  resources; `.specify/gates/run-gates.sh` is green; the three suites pass unchanged (290 unit,
  16 integration, 58 e2e), which is the evidence the feature touched no application code.

## Recent decisions

- **`main` was published to a new public repository**, `https://github.com/CaioWF/stockroom-api`.
  20 commits, 434 files, HEAD `bbeca6f`. `origin` is configured with upstream tracking. History was
  scanned for secrets before pushing and is clean — the only `BEGIN PRIVATE KEY` hit is
  `test/unit/auth/infrastructure/keys/file-system-key-providers.spec.ts:13`, which generates a pair
  at runtime with `generateKeyPairSync`.
- **The agent tooling (`.claude/`, `.agents/`, `CLAUDE.md`, `AGENTS.md`) went public deliberately**,
  as evidence of process for the challenge's "structured AI use" criterion.
- **Feature 005 was held back from that push** and left uncommitted, at the user's instruction.
- **Amazon Cognito was considered and rejected** as a replacement for the project's own
  authentication. Recorded in ADR-0008 (uncommitted): it would delete feature 001, gut 002's
  credential-route throttling, moot ADR-0006, and end the suite's ability to run offline.
- **ALB over API Gateway / Function URL**, with its idle cost accepted — ADR-0008, which is the ADR
  the constitution's "Idle costs nothing" principle had been owed since feature 001.
- **SSM parameters use write-only arguments and `prevent_destroy`.** Two separate hazards, found by
  two independent review passes: a plain `value` leaks the RS256 private key into state on refresh,
  and recreation overwrites the operator's real key with the placeholder. Spec FR18 and FR18a.
- **The `SPEC_DEVIATION` in `scripts/infra-check.sh` was closed by amending the spec, not the code.**
  Codex was right that `init -backend=false` cannot work alongside a declared backend; FR22 and FR23
  were internally inconsistent and now carry FR23a. No open `SPEC_DEVIATION` remains in this feature.

## Blockers

- **No AWS account.** Feature 005 has never been applied and cannot be here. Every acceptance
  criterion is proven against `fmt`/`validate`/`plan`; nothing proves the stack works in AWS. The
  runbook is documentation, not a verified procedure. This is the blocker that decides whether 005
  ships at all.
- **Feature 005's work is unversioned and one careless command from gone.** Six *tracked* files are
  modified with no copy anywhere: `README.md`, `package.json`, `.gitignore`, `docs/STATE.md`,
  `docs/index.md`, `docs/architecture/adr/index.md`. A `git checkout .` or `git clean -fd` destroys
  those along with the untracked `terraform/`, `scripts/infra-check.sh`,
  `docs/architecture/adr/0008-alb-lambda-transport.md`, and
  `specs/005-terraform-aws-infrastructure/`. `git stash -u -m "005 infra"` is the cheap insurance
  if the pause runs long.
- `CODEX_HANDOFF_INFRA.md` and `CODEX_HANDOFF_FRONTEND.md` **no longer exist on disk.** Both were
  present during the session that wrote this file — the infra one was authored in it — and both
  were gone by the end, removed by something outside this session's commands. Neither was ever
  committed, so there is no copy to restore from; the infra handoff can be regenerated from
  `specs/005-terraform-aws-infrastructure/` if it is wanted. `example-requests.http` (0 bytes)
  survived in the same directory.
- `.deploy-keys/` may still sit at the repository root holding one empty file — a leftover from
  verifying a `.gitignore` rule, which the destructive-command guard would not let me remove. It is
  gitignored and harmless; delete it by hand if it bothers you.

## Deferred ideas / todos

- **Automated assertions over `terraform show -json`.** Rejected during `clarify` in favour of a
  human reading the plan and stamping `contract.md`. The consequence is written into the spec: AC-3
  through AC-15 are point-in-time verdicts, not regression tests, so an edit that removes the health
  check or widens the IAM policy is caught by review or not at all. Reconsider once the stack is
  applied for real and starts changing.
- **`npm run infra:check` is deliberately not a pre-commit gate** (FR25), because `terraform init`
  needs network access and would block every commit in the repository. Revisit if the provider cache
  proves reliable enough offline.
- **CI/CD, multi-environment, custom domain and DNS, WAF, alarms and dashboards** are all explicit
  `Out of Scope` in feature 005's spec. Each is a candidate feature; none is started.
- **Bootstrapping the remote state bucket** stays a documented prerequisite the stack cannot create
  for itself.
- **Front-end** — `CODEX_HANDOFF_FRONTEND.md` briefs a React/Vite client in a separate repository.
  Not started, and the challenge lists it as a plus rather than a requirement.
