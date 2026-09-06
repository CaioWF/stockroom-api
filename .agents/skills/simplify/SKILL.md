---
name: simplify
description: Behavior-preserving cleanup pass over recently-changed code. Invoked by review-and-simplify after the review lenses, before a commit is proposed.
---

# simplify

When: invoked by `review-and-simplify` after the review lenses are clean, before any commit is proposed. MANDATORY step in that orchestration — not a standalone judgment call to skip.

Scope: ONLY the recently-changed code — the feature's diff. Never the whole repo unless the human explicitly asks for a broader pass.

## Core rule

**Preserve functionality EXACTLY — change how the code reads, never what it does.** This is a readability pass, not a refactor of behavior. If a change you're considering could alter an observable input/output, a side effect, or an edge case, it does not belong here.

Apply the project's `CLAUDE.md` code style (function length, naming, no `any`, comment-WHY-not-WHAT) while doing this pass.

## What to improve

- Reduce nesting and duplication.
- Clearer, more specific names (no `data`/`handler`/`Manager`-style placeholders).
- Remove redundant abstractions and obvious comments (comments that restate the code).
- Consolidate related logic that's scattered for no reason.
- Avoid nested ternaries — prefer `if`/`else` or `switch`.
- Clarity over brevity: explicit beats clever or compact.

## What NOT to do

Do not over-simplify:
- Don't merge separate concerns into one function/module just to shrink line count.
- Don't remove an abstraction that's earning its keep (even if it could technically be inlined).
- Don't prioritize fewer lines over readability — a slightly longer, clearer version wins.

## Process

1. Read the feature's diff (tree-snapshot diff or working tree).
2. Apply the improvements above to the changed code only.
3. **Re-run `.specify/gates/run-gates.sh` and the project's tests.** Confirm everything is STILL green and output is pristine — this is the proof that behavior was preserved, not just an assumption.
4. **If anything breaks, or output is not pristine, revert the simplification** — the diff goes back to its pre-simplify state. A simplification that breaks a gate or test was not behavior-preserving; it doesn't get a second attempt in this pass, it gets reverted.

This skill edits code, then verifies. It is not a blocking review — `code-review` and `security-review` are the read-only lenses; this is the one step in the chain that's allowed to touch the diff.

Next: if simplify changed non-trivial logic shape (not just naming/formatting), `review-and-simplify` re-runs the relevant lens before the pre-commit gate.
