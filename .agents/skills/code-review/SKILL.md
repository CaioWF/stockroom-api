---
name: code-review
description: Use after implement-and-evaluate confirms acceptance criteria and gates are green, for a final pre-merge review against the constitution and the checklist template.
---

# code-review

This is one lens orchestrated by `review-and-simplify` (dispatched in parallel alongside `security-review` as part of the mandatory pre-commit step) — it is also usable standalone for an ad-hoc review.

When: implement-and-evaluate has finished — all `tasks.md` boxes checked, all `Acceptance Criteria` passing, gates green — and the feature is otherwise ready to propose for commit.

Template: `.specify/templates/checklist-template.md`.

Output: the checklist filled out against the actual diff, reported inline (and optionally saved alongside the feature's specs if the user wants a persistent record) — plus a list of any findings that must be fixed before merge.

## No citation, no blocker

A finding may only block the merge if you can quote the rule it breaks — a line of the constitution, an `AC-N` from the spec, a checklist item, or a gate that actually fails. Everything else is a suggestion: report it, label it as such, and let the author decide.

This is what keeps review anchored to the project's agreed rules instead of the reviewer's taste, and it gives the author something concrete to argue with — a quoted rule can be discussed, changed, or shown not to apply; "I'd have written this differently" cannot. If you believe a rule is missing, say so and propose it for the constitution; do not enforce it retroactively as if it were already there.

Steps:
1. Resolve the active feature from `.specify/state` (fallback: newest dir under `specs/`).
2. Read `.specify/memory/constitution.md` (principles, code patterns, SDD process) and hold the diff against it — flag any violation of a stated principle or code pattern. **Cite the rule that was broken**: quote the constitution text (or the spec's `AC-N`) verbatim, with its section heading, next to the finding.
3. Read `.specify/templates/checklist-template.md` and walk every item (`Tests`, `Quality Gates`, `Documentation`, `Code Review`, `Deploy`) against the actual state of the repo — do not assume an item is satisfied just because gates passed; verify (e.g. check for stray `console.log`/debug statements, confirm spec.md reflects the final implementation).
4. Report each checklist item as done/not-done with evidence, plus any constitution violations found. Split findings in two: **blocking** — each carrying its citation from step 2 — and **suggestions** — everything else you believe but cannot cite.
5. Make no code edits — this skill reviews, it does not fix. If a finding is blocking, hand it back to implement-and-evaluate (or fix-runner directly for a small gate-level fix) rather than patching it here.
6. Only once the checklist is clean and no constitution violations remain should you propose the commit message(s) to the user and wait for approval — per the project's commit-at-milestone convention, do not commit yourself.

Next: human review and approval, then commit (proposed by you, executed only after explicit approval).
