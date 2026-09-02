---
name: evaluator
description: Use after implement-feature to score the current implementation against the active feature's spec.md Acceptance Criteria, following specs/<feature>/contract.md and recording each verdict in it. Read-only on code — the contract's status lines are the only thing it writes.
---

# evaluator

When: right after implement-feature finishes a task (or a batch of tasks), before deciding whether to loop back for fixes or move on. Re-run any time the implementation changes.

Template: `.specify/templates/contract-template.md` — the evaluator does not create the contract (`tasks-writer` does), it consumes it and fills its `status:` lines.

Output: a pass/fail list reported inline to the user (one line per `Acceptance Criteria` scenario) **plus** the updated `status:` fields in `specs/<active-feature>/contract.md` — so the verdict survives the session instead of scrolling away.

Steps:
1. Resolve the active feature from `.specify/state` (fallback: newest dir under `specs/`).
2. Read `specs/<active-feature>/contract.md` — it is your checklist: per `AC-N`, the declared `proof`, `command`, and `observable`. Run the `Environment` setup first if the proofs need it. Do not re-derive the verification plan from scratch; that is the work the contract exists to avoid repeating on every loop iteration.
   - No `contract.md` (feature authored before contracts existed, or one was never written)? Fall back to reading `specs/<active-feature>/spec.md` `Acceptance Criteria` directly and say so in the report — then recommend `tasks-writer` fill the contract, but do not author it yourself mid-loop.
3. Cross-check the contract against `specs/<active-feature>/spec.md` — a verification doc that silently falls out of sync with the spec is worse than none, because its PASS lines start lying:
   - Every `AC-N` in the spec must have a section in the contract. Report any AC the contract is missing (a real gap — an unverified criterion) and evaluate it from the spec for this run.
   - A contract section for an `AC-N` the spec no longer has is **stale** — report it; do not evaluate or re-stamp it.
   - Re-read each criterion's actual statement in the spec and check it still matches the contract's label and declared `proof`. If the criterion was rewritten so the declared proof no longer proves it, report **contract drift** and leave the old verdict alone — never stamp PASS against a proof for a criterion that changed underneath it.
4. For each `AC-N`, run the declared `command` and judge against the declared `observable`. Inspect code and tests as needed — never conclude PASS from `tasks.md` checkboxes, or from the contract's previous `status:`, alone. A `proof` that does not exist yet, or a `command` that errors out, is a FAIL with that as the reason.
5. Emit one line per scenario: `PASS`, `FAIL`, or `UNVERIFIED` plus a short reason. `UNVERIFIED` is for a criterion you could not actually run — `proof: manual`, no proof declared, or an environment you cannot bring up. Say so plainly; a criterion nobody ran is a standing risk, and reporting it as passing is the one failure mode that makes this whole artifact worthless.
6. Write the results back into `contract.md`:
   - `status:` → `PASS (evaluator, YYYY-MM-DD)`, `FAIL (evaluator, YYYY-MM-DD) — <short reason>`, or `UNVERIFIED (evaluator, YYYY-MM-DD) — <why it could not be run>`.
   - Sharpen `proof:` where you can: replace the intended path with the real `path:LINE` of the test that actually covers it.
   - Correct a `command:` that is factually wrong (renamed script, wrong flag) and note the correction in your report.
   - Change nothing else — not the AC labels, not `Environment`, not `observable`. Those are author-time decisions; if one is wrong, report it instead of rewriting it.
7. Make no code, test, or other doc edits — `contract.md` is the only file this skill writes. If you spot a fix, describe it instead of applying it.
8. Summarize: overall status is "met" only if every scenario is PASS — `UNVERIFIED` does not count as met. Otherwise "not met", with the failing list plus any stale/drifted sections found in step 3.

Next: fix-runner if any scenario fails or gates are red; otherwise hand control back to implement-and-evaluate to continue with the next task or proceed to code-review.
