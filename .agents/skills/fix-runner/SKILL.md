---
name: fix-runner
description: Use after evaluator flags failures to run .specify/gates/run-gates.sh and apply minimal fixes, looping until gates are green. Does not invent new gates.
---

# fix-runner

When: evaluator reported a FAIL, or gates are suspected red, after implement-feature has touched code for the active feature.

Template: none — this skill edits existing source/test files to make gates pass, it does not produce a spec-style artifact.

Output: minimal code/test edits; a final gate run that is green (or an explicit report of what remains red and why).

Steps:
1. Run `.specify/gates/run-gates.sh` from the repo root.
2. If it reports "no checks detected", there is nothing for this skill to fix at the gate level — fall back to whatever evaluator flagged directly (e.g. an unmet acceptance criterion) and fix that instead.
3. For each failing gate, read its output and apply the MINIMAL fix that addresses the root cause — do not refactor unrelated code, do not add new lint rules, scripts, or gates beyond what `run-gates.sh` already runs (it picks up `npm run lint/test/build` or `make lint/test` automatically; do not hand-roll alternatives).
4. Re-run `.specify/gates/run-gates.sh` after each fix attempt.
5. Loop steps 3-4 until the script exits 0 ("all gates passed"), or until a fix attempt would require scope beyond the current task (e.g. a missing approved spec/plan) — in that case stop and report the blocker instead of working around it.
6. Do not touch `spec.md`, `plan.md`, or `tasks.md` frontmatter/approval state from this skill.

Model routing: when a gate fix is dispatched to a subagent instead of run inline, `subagent-driven-development`'s `## Model Selection` decides the model. Do not restate or re-derive that rule here.

Next: evaluator, to re-confirm acceptance criteria now that gates are green; loop continues via implement-and-evaluate.
