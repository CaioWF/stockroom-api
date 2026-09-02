---
name: doubt-driven-development
description: Use before a non-trivial decision stands — an architecture choice under uncertainty, branching logic, a cross-module contract, an unverifiable claim, or any change with irreversible blast radius. Invoke when you feel confident about a decision that has not been independently checked, and before committing non-trivial code or asserting a non-obvious fact.
---

# doubt-driven-development

## Overview

A confident answer is not a correct one. This skill materializes a **fresh-context adversarial reviewer** whose job is to *disprove* a decision before it stands — catching a wrong direction while course-correction is still cheap. The reviewer never sees your reasoning, only the artifact and its contract, so it cannot rubber-stamp your conclusion.

Adapted from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) `doubt-driven-development` (MIT, © 2025 Addy Osmani).

## When to use

Apply to a decision that:
- introduces branching logic, or crosses a module boundary,
- asserts a property you cannot directly verify,
- depends on hidden or assumed context,
- has irreversible blast radius (schema change, public contract, data migration).

Natural touchpoints in the keel chain: before flipping `spec.md`/`plan.md` to `status: approved`, when `analyze` surfaces a non-obvious design call, and inside `review-and-simplify` before a commit is proposed.

**Do NOT use** for trivial, reversible, or mechanical changes (renames, formatting, one-line config) — doubt has a cost; spend it where being wrong is expensive.

## The technique — CLAIM → EXTRACT → DOUBT → RECONCILE → STOP

1. **CLAIM** — State the decision compactly and why it matters. One or two sentences. This is for *you*; it does not go to the reviewer.

2. **EXTRACT** — Isolate the artifact (the code, the interface, the spec section) plus its contract (inputs, outputs, invariants, constraints). Strip your reasoning and your conclusion. What remains is what a reviewer needs to judge the thing on its own merits.

3. **DOUBT** — Dispatch a **fresh-context subagent** (`Explore` or `general-purpose`, or the `dispatching-parallel-agents` path) with an adversarial brief: *"Here is an artifact and its contract. Find where it is wrong, unsafe, or fails its contract. Do not assume it is correct."* **Do NOT pass the CLAIM** — handing the reviewer your conclusion biases it toward agreement. Cross-model review (an external CLI) is optional, must be explicitly offered each cycle, and requires user authorization; in a non-interactive run, skip it and say so.

4. **RECONCILE** — Classify each finding:
   - **contract misread** — the reviewer misunderstood the contract → tighten the EXTRACT, not the code.
   - **actionable** — a real defect or gap → fix it.
   - **trade-off** — a legitimate tension → record the decision (ADR / `Technical Decisions`) and move on.
   - **noise** — irrelevant → discard.

5. **STOP** — Bounded at **3 cycles**. Stop earlier when findings are trivial or the user overrides. Three unresolved cycles means escalate to the human, not grind further.

## Red Flags

- **Doubt theater** — across cycles that surfaced substantive findings, *zero* were actionable. You are validating, not doubting. Sharpen the adversarial brief or question whether you extracted the real contract.
- **Leaking the CLAIM** — the reviewer agrees enthusiastically. Check whether you handed it your conclusion.
- **Doubting the trivial** — burning a cycle on a reversible one-liner. Skip it.
- **Grinding past 3 cycles** — the decision is genuinely uncertain; that is a signal to escalate, not to spawn a fourth reviewer.
