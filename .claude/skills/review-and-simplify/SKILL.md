---
name: review-and-simplify
description: MANDATORY pre-commit orchestrator — fans out review lenses (code-review, security-review) in parallel, then runs a behavior-preserving simplify pass, before any commit is proposed.
---

# review-and-simplify

When: after `implement-and-evaluate` reports all tasks done, all `Acceptance Criteria` met, and gates green — before any commit is proposed. **This is a MANDATORY pre-commit step. A commit MUST NOT be proposed without it having run and come back clean.** Skipping it is not allowed, regardless of how small or "obviously fine" the diff looks.

Output: an aggregated findings report (by severity) from all lenses, a simplified diff with gates confirmed green, and — only once both are clean — a proposed commit message awaiting human approval.

## Steps

1. **Resolve scope.** Resolve the active feature from `.specify/state` (fallback: newest dir under `specs/`). Determine the diff to review: the feature's tree-snapshot diff (`git diff BASE_TREE HEAD_TREE`, per the no-commit-rule snapshotting in `subagent-driven-development`) or, if no snapshots were taken, the working tree diff.

2. **Resolve the lens set from the registry.** Read `.specify/review-lenses.txt` — one skill name per line, ignoring blank lines and `#` comments. That file is the source of truth for which lenses run. Core seeds it with the stack-agnostic lenses:
   - `code-review` — quality against the constitution and `checklist-template.md`.
   - `security-review` — the security checklist (secrets, allow-list authz, injection, SSRF, crypto, supply-chain).

   Packs append stack-specific lenses to the same file without touching this orchestration — e.g. the `ui-review` pack appends `perf-review` + `a11y-review`, and the `api-review` pack appends `api-contract` + `migration-safety`. If the registry is missing (older install), fall back to the two agnostic lenses above.

   **Dispatch every listed lens IN PARALLEL.** Follow `dispatching-parallel-agents` — issue all lens dispatches in the same response so they run concurrently, not sequentially. Each lens is read-only and returns findings by severity (Critical/Important/Minor) with `file:line`.

3. **Aggregate findings.** Any Critical or Important finding from either lens MUST be fixed: hand it back to `fix-runner` (small, localized fix) or `implement-and-evaluate` (larger scope), then re-dispatch the lens that raised it to confirm the fix. Do not proceed to step 4 with open Critical/Important findings. Minor findings are logged for the human, not blocking.

4. **Run `simplify`** on the changed code. It edits for readability only (behavior preserved exactly), then re-runs `.specify/gates/run-gates.sh` and the project's tests itself to confirm everything is still green. If `simplify` reports it had to revert, treat the diff as unchanged and proceed.

5. **If `simplify` changed non-trivial logic shape** (restructured control flow, extracted/merged functions — not just renames or formatting), re-run the lens whose territory that touches (typically `code-review`; `security-review` too if the touched code was security-relevant) before proceeding.

6. **Pre-commit GATE.** Only once: all lenses are clean (no open Critical/Important), `simplify` has run, and gates/tests are green — propose the commit message(s) to the human and WAIT for explicit approval. Per the repo's commit-at-milestone convention, do not commit yourself; subagents never commit either.

## Hard rules

- Skipping this step, or proposing a commit without having run it to a clean state, is not allowed.
- The lenses run in parallel, not sequentially — that's the point of dispatching both in one response.
- `simplify` runs only after the lenses are clean, never before (no point cleaning up code that's about to be sent back for a Critical fix).
- Do not commit. This orchestrator's job ends at proposing the commit message and waiting for approval.

Next: human approval, then commit (executed only after explicit approval — never by this skill or any subagent it dispatches).
