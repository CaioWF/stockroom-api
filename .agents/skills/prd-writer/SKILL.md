---
name: prd-writer
description: Use after brainstorming settles on a feature idea to write the Product Requirements Document for a new feature into specs/<feature>/prd.md from the PRD template, creating the feature's spec folder and marking it active.
---

# prd-writer

When: a feature idea has been shaped (e.g. via brainstorming) and is ready to be written down before any spec/code work starts.

Template: `.specify/templates/prd-template.md`.

Output: `specs/<feature>/prd.md`, where `<feature>` is `NNN-kebab-case-name`.

Steps:
1. Read the product brief `.specify/memory/product.md` first (it is also injected at SessionStart). It carries the project's product context — user, problem, north-star. Reference it; do NOT re-derive or repeat it in the PRD. If the brief is absent (project skipped `product-writer`), note that and capture only what this feature needs, but prefer writing the brief first.
2. Determine the next ordinal `NNN`: list existing `specs/*` directories, take the highest leading number, zero-pad the increment to 3 digits (first feature is `001`).
3. Choose a short kebab-case name for the feature; create `specs/NNN-name/`.
4. Copy `.specify/templates/prd-template.md` to `specs/NNN-name/prd.md`.
5. Fill each section that exists in the template:
   - `Problem` — the problem/opportunity specific to THIS feature, connected to the product's central problem (from `product.md`) without repeating it.
   - `Hypothesis` — the solution hypothesis and why it should work.
   - `User/Context` — inherit the target user from the product brief; record only what this feature adds or narrows.
   - `Success Metric` — measurable KPI/OKR for success.
   - `Dependencies & Interfaces` — the feature's seams, stated at product level (the
     technical contract belongs in `plan.md`):
     - **Consumes** — every input the feature needs to work: data, endpoints, events,
       features it reads from. Name the origin, not just the thing.
     - **Exposes** — what the feature newly offers others: endpoints, events, data,
       screens. If nothing is exposed, write "none" — an empty seam is a real answer.
     - **Dependencies** — coupled features/systems with direction: link sibling features
       as `specs/NNN-name` and say which blocks which. A feature that cannot ship before
       another must say so here, not discover it at plan time.
   - `Out of Scope` — what this phase explicitly excludes.
6. Write `NNN-name` (single line, no trailing content) to `.specify/state` so it becomes the active feature for subsequent skills.

Next: spec-writer.
