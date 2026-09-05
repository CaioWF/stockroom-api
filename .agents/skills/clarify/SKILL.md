---
name: clarify
description: Use after spec-writer to surface ambiguities or gaps in the active feature's spec.md as explicit questions, then update the spec in place once answered.
---

# clarify

When: right after spec-writer produces a draft spec, before plan-writer starts architecting against it. Re-run any time the spec is reopened and feels ambiguous.

Template: none — this skill operates on the existing spec, it does not fill a fresh template.

Output: `specs/<active-feature>/spec.md` (edited in place; same file, no new file created).

This is the phase that interrogates. An ambiguity that survives clarify is inherited by
`plan-writer` as an assumption, and by the implementation as a bug — so the bar is a spec
with no branch left open, not a spec with the obvious questions asked.

Steps:
1. Resolve the active feature from `.specify/state` (fallback: newest dir under `specs/`).
2. Read `specs/<active-feature>/spec.md` in full, plus its `prd.md` and `brainstorm.md` when present.
3. **Fact-check before asking.** Anything the repo can answer — existing code, schema, config,
   the PRD, the brainstorm, an installed library's real behavior — you resolve by reading, not
   by asking. A question the codebase already answers spends the user's attention on your
   homework. Ask only what needs their judgment or knowledge you cannot obtain yourself.
4. **Scan prior art before asking — then refuse to be anchored by it.** Look at how comparable
   products, libraries, or standards already solve this: which knobs they expose, which edge
   cases they handle, where their users complain. Timebox it and cite what you found; separate
   what you observed from what you inferred. Two uses, in this order:
   - **Sharpen the questions.** Prior art reveals the decision points and failure modes you would
     otherwise not know to ask about. Turn each into a question, not into a decision.
   - **Reserve a creative branch.** At least one question must probe deliberately *not* following
     the convention — what our context makes possible that the incumbents cannot do. If every
     source converges on one shape, that is a reason to ask why, never a reason to adopt it.
   Hard rules: prior art is **input to a question, never an answer**; never present "X does it
   this way" as the resolution; never let the scan narrow the option set before the user has seen
   it. Proportional — skip the scan when the feature has no external analog (internal plumbing,
   a refactor, a repo-specific rule) and say you skipped it.
5. For each section (`User Stories`, `Functional Requirements`, `Acceptance Criteria`, `Out of Scope`), list concrete ambiguities, missing edge cases, or contradictions as numbered questions.
6. **Order by dependency, not by section.** One answer often dissolves or reshapes three later
   questions — ask that one first. Walk the decision tree branch by branch instead of dumping a
   flat list that mixes a load-bearing choice with cosmetic detail.
7. **Carry a recommendation into every question.** State the option you would pick and why, so
   the user confirms or overrides instead of drafting an answer from scratch. The decision stays
   theirs — never proceed on an unanswered recommendation.
8. Ask **load-bearing questions one at a time** — an answer that reshapes the rest earns its own
   round-trip. Batch the independent ones; do not drip-feed trivia.
9. Once answered, edit `spec.md` directly to resolve each ambiguity — tighten requirements, add missing acceptance criteria, or move newly-excluded items into "Out of Scope".
10. **Do not hand off with a branch left open.** If an ambiguity survives — unanswered, or
   answered "decide later" — write it into the spec explicitly (an open decision, or moved to
   `Out of Scope`). `plan-writer` must never inherit an ambiguity silently.
11. Leave the frontmatter `status` untouched (still `draft`) unless the human explicitly approves it elsewhere.

Interview discipline in steps 3 and 6–8 adapted from [`mattpocock/skills`](https://github.com/mattpocock/skills) `grilling` (MIT).

Next: plan-writer.
