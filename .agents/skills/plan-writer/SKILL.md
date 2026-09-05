---
name: plan-writer
description: Use after the spec is clarified to write the technical plan for the active feature into specs/<feature>/plan.md from the plan template, with status:draft frontmatter.
---

# plan-writer

When: spec exists and has been through clarify; before breaking work into tasks.

Template: `.specify/templates/plan-template.md`.

Output: `specs/<active-feature>/plan.md`.

Steps:
1. Resolve the active feature from `.specify/state` (fallback: newest dir under `specs/`).
2. Read `specs/<active-feature>/spec.md` to ground the plan in the approved requirements, plus `prd.md`'s `Dependencies & Interfaces` — that section states the feature's seams at product level (`Consumes` / `Exposes` / `Dependencies`) and hands the **technical** contract to this plan. Every declared input needs a source in `Architecture`, every declared output a concrete interface, and a dependency that blocks shipping belongs in `Technical Decisions`. Seams that stop at the PRD are how a later feature ends up contradicting this one.
2a. Ground the plan in the real tree: read `docs/codebase-map.md` for the structural map (boundaries, entry points, where this kind of feature goes). If it is absent or stale, run the `codebase-map` skill first, then read it — so `Architecture` / `File Structure` name real paths, not invented ones.
2b. If `.specify/impl-conventions.txt` lists any convention lenses (installed by packs such as `stack-conventions`), consult each relevant one and fold its decisions into `Technical Decisions` — e.g. naming (code↔DB↔wire), Postgres indexing/RLS, TS type-at-the-boundary. Skip lenses that don't apply to the change. No pack installed ⇒ registry empty ⇒ no-op.
2c. **Replicate before inventing.** Find the closest existing feature/module that already solves this shape of problem (use the map from 2a) and replicate its pattern — same layering, same error/validation strategy, same naming, same file placement. The plan describes how this feature *matches* the established pattern, not a new parallel architecture. Only diverge when the existing pattern genuinely does not fit, and when you do, record the reason in `Technical Decisions` — a divergence without a recorded reason is over-engineering (laziness ladder rung 1). If no comparable pattern exists, say so explicitly.
2d. **Choose the decomposition axis — slice vs layer.** The `Implementation Order` you write here decides whether the tasks can run in parallel later. Two axes:
   - **Vertical slice** — split by independent module/feature/entity, each owning its own files (`src/auth/**`, `src/billing/**`). Slices are file-disjoint ⇒ `implement-and-evaluate` can run them in `dispatch-parallel` (each in its own worktree). This is the axis that unlocks parallelism.
   - **Horizontal layer** — split by technical layer (schema → service → controller). Layer tasks form a dependency chain (each consumes the prior's output) and gravitate to shared files (same module, same `types`, same barrel) ⇒ they serialize, no matter what scopes are declared.
   Prefer the **slice** axis whenever the feature genuinely divides into modules that don't share files — decompose vertically and let each slice own its paths. Keep the **layer** axis only when the work is one indivisible unit (a single coupled module, a cross-cutting migration) — do not force a fake slice, an over-eager split that lies about disjointness clobbers under parallel execution. **Shared-file gravity is the parallelism killer:** a barrel/re-export (`index.ts`), a shared router, or a single `types` file touched by every task forces serialization. When slicing, design so each slice adds its own file and the shared aggregation point (route table, barrel) is either one task's sole scope or a final coupled task — not co-touched by every slice. Record the chosen axis and why in `Technical Decisions` when it is not obvious.
3. Copy `.specify/templates/plan-template.md` to `specs/<active-feature>/plan.md`.
4. Fill each section that exists in the template:
   - `Architecture` — main components, data flow, integration with existing systems.
   - `File Structure` — concrete file/dir paths to add or touch.
   - `Technical Decisions` — tech decisions with rationale.
   - `Data Layer Contract` — fill ONLY when the plan adds/changes a table, column, index, or migration: the code↔schema mapping (`camelCase`↔`snake_case`) and its single mapping site, keys/constraints/types, indexes, and explicit RLS policies (allow-list on the scope column). If the change does not touch the data layer, write `N/A — does not touch the data layer`. When `postgres-conventions` is installed (`stack-conventions` pack), draw the specifics from it; `migration-safety` reviews the result later.
   - `Implementation Order` — numbered implementation order.
   - `How to Validate` — unit/integration tests and quality checklist.
5. Keep `status: draft` in the frontmatter.

Approval: like the spec, the plan needs a human to flip its frontmatter to `status: approved`. The phase-gate hook requires BOTH `spec.md` and `plan.md` to carry `status: approved` before it allows any code edit — this file does not self-approve.

Next: tasks-writer.
