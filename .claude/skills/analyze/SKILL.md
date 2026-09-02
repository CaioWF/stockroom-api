---
name: analyze
description: Use after tasks-writer to cross-check the active feature's spec, plan, and tasks for gaps or contradictions before implementation begins. Read-only advisory — makes no code or doc changes.
---

# analyze

When: spec, plan, and tasks all exist for the active feature, right before handing off to implementation. Re-run whenever any of the three documents change.

Template: none — this skill is purely analytical, it does not fill or produce a template-based artifact.

Output: findings reported inline to the user (and/or appended as notes under `tasks.md`'s `Notes` section if persistence is wanted) — no new file is mandated.

Steps:
1. Resolve the active feature from `.specify/state` (fallback: newest dir under `specs/`).
2. Read `specs/<active-feature>/spec.md`, `plan.md`, `tasks.md`, and `contract.md` in full.
3. Cross-check:
   - Every functional requirement (`Functional Requirements`) in the spec is covered by at least one task.
   - Every acceptance criterion has a section in `contract.md` declaring how it is proven (`proof` + `command` + `observable`), and that proof is consistent with the tasks and the plan's `How to Validate` strategy. A criterion with no declared proof, or a `command`/path the project cannot actually run, is a finding — implementation would start with no way to verify it.
   - The plan's `Implementation Order` and `tasks.md`'s checklist agree on sequence and scope.
   - No task references something out of scope per `Out of Scope` in either spec or PRD.
   - No requirement or task introduces a dependency, abstraction, or feature the spec doesn't actually require — laziness ladder rung 1, "does it need to exist?" (see `architecture` skill's `references/minimalism.md`). Flag suspected over-engineering for the human; don't fix it here.
   - The plan replicates the codebase's existing pattern for this shape of problem rather than inventing a parallel one. Cross-check `Architecture` / `File Structure` against `docs/codebase-map.md` and the closest existing feature: a new layering, error/validation strategy, or file placement that diverges from an established equivalent without a recorded reason in `Technical Decisions` is a finding (architecture divergence). Replicating is the default; divergence must be justified.
4. Report findings as a list of gaps/contradictions (or confirm none found). Do not edit spec.md, plan.md, or tasks.md, and do not touch any code — this skill is read-only advisory.
5. If findings require changes, hand back to spec-writer/clarify, plan-writer, or tasks-writer as appropriate rather than fixing them directly.
6. For a non-obvious design call that survives this cross-check but still feels uncertain — a cross-module contract, an irreversible choice, an unverifiable assumption — run it through `doubt-driven-development` (a fresh-context reviewer that tries to disprove it) before it is treated as settled.

Next: implement-feature, once analyze reports clean and spec.md + plan.md both carry `status: approved`.
