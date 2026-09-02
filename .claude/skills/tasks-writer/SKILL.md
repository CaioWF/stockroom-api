---
name: tasks-writer
description: Use after the plan is approved to break the active feature's plan into a concrete task checklist, written into specs/<feature>/tasks.md from the tasks template.
---

# tasks-writer

When: plan exists (ideally already `status: approved`, since implementation is gated on it); before implementation starts.

Templates: `.specify/templates/tasks-template.md`, `.specify/templates/contract-template.md`.

Output: `specs/<active-feature>/tasks.md` and `specs/<active-feature>/contract.md`.

Steps:
1. Resolve the active feature from `.specify/state` (fallback: newest dir under `specs/`).
2. Read `specs/<active-feature>/plan.md`, particularly `Implementation Order`, to derive the task breakdown.
3. Copy `.specify/templates/tasks-template.md` to `specs/<active-feature>/tasks.md`.
4. Fill each section that exists in the template:
   - `Implementation Checklist` — one checkbox per top-level task, mirroring the plan's implementation order.
   - `Subtasks` — break each top-level task into concrete subtasks under its own `### Task N` heading.
   - `Blockers` — known blockers or external dependencies.
   - `Notes` — execution notes worth keeping (constraints, gotchas).
5. Tasks should be scoped so each can be implemented and verified independently (matches the "ONE task" convention used elsewhere in this repo).
5a. **Honor the plan's decomposition axis (slice vs layer).** The plan's `Implementation Order` already chose the axis (see plan-writer step 2d); mirror it faithfully — do not silently re-slice. When the plan decomposed by **vertical slice** (independent modules owning disjoint files), keep each slice as its own top-level task so their `[scope: …]` stay disjoint and `dispatch-parallel` can fan them out. When the plan decomposed by **horizontal layer** (schema → service → controller), those tasks are a dependency chain over shared files — declare their real (overlapping or broad) scopes honestly so they serialize; never fabricate disjoint scopes to force parallelism the code cannot support. If while breaking down you notice the plan layered work that is actually file-disjoint (a genuine missed slice), flag it rather than re-architecting on your own. The goal is faithful scopes, not maximal parallelism — a lie about disjointness clobbers under concurrent execution.
6. Declare each task's **file scope** with a `[scope: glob, glob]` suffix on its checklist line, derived from the plan's `File Structure` — the globs that task will create or edit (e.g. `[scope: src/auth/**, tests/auth/**]`). This is what lets `implement-and-evaluate` run tasks with disjoint scopes in parallel (`dispatch-parallel`). Be honest and tight: an over-broad scope needlessly serializes; a scope that omits a file a task actually touches risks a clobber against a parallel sibling. When a task genuinely spans shared/broad files (a cross-cutting migration, a file many tasks touch), either omit `[scope: …]` or use a broad glob — both force that task to run alone. Absent or broad scope is the safe default: it never parallelizes.

7. **Write the verification contract.** Copy `.specify/templates/contract-template.md` to `specs/<active-feature>/contract.md` and fill it — this is the feature's self-contained answer to "how do I verify this?", so nobody (human or fresh subagent) has to reassemble it from spec+plan+tasks+code:
   - `Environment` — the concrete setup the proofs need (what to start, which env vars, fixtures/seeds, test credentials, teardown). Take it from the plan and the repo's real scripts; do NOT invent commands the project does not have. Nothing needed → `N/A — no setup beyond install`.
   - One `## AC-N` section per `AC-N` in `spec.md`, in spec order, with a **short label** — reference the criterion, never copy its Given/When/Then (two copies drift).
   - `proof` — the test file (or `manual` + steps) that will prove it, derived from the same breakdown that produced the tasks. At this point the test does not exist yet, so declare the **intended** path without a line number; `evaluator` sharpens it to `path:LINE` later.
   - `command` — the exact command that runs just that proof, so verification is one copy-paste, not a guess.
   - `observable` — what a human sees when it passes.
   - Leave every `status:` as `PENDING`; filling it is `evaluator`'s job, not yours.
   Keep it tight: a contract that restates the spec is noise, one that names the command and the observable is leverage.

Next: analyze, then implement-feature.
