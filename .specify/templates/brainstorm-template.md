---
status: draft
feature: NNN-name
date: YYYY-MM-DD
---

# [Feature] — Brainstorm

> The approved design + the reasoning trail that produced it. Upstream of `spec.md`/`plan.md`:
> this is where the **why this shape** lives (exploration, trade-offs, what was left open); the
> *what* and the *how* live in the spec and plan templates. No code — contracts and intent, not
> function bodies. Scale each section to the complexity; keep sections short for simple features.

## Understanding

- [Request restated in 1-2 sentences.]
- [Assumptions made where there was ambiguity.]

## Investigation

- [Files/docs read and what was extracted: patterns, conventions, integration points.]
- [Constraints from the existing codebase (reuse `docs/codebase-map.md` when available).]
- [If nothing was read, justify why.]

## Approaches considered

- [Approach A — summary + trade-off.]
- [Approach B — summary + trade-off.]
- [**Chosen: X** — why it won.]

> `deep` mode: this section receives the 2-3 approaches distilled by the critic pass of framed
> divergence (novelty/viability/fit score, pruned traps), not inline anchored options.

## Open Decisions

> Points that need resolution, with an explicit handoff to `clarify`. Distinguish from what is
> already **closed** (that goes into the Outline with the why). If there are none, write "None".

- [Point 1: A vs B — I recommend A because X. Confirm?]

## Outline of the solution

- [The approved design: architecture, components, data flow, error handling, tests — scaled to
  the complexity. No code.]
