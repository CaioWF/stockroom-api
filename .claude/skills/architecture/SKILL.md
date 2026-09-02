---
name: architecture
description: Use when designing the structure of a feature or module (in the plan phase, or when refactoring) to apply language-agnostic engineering principles — Clean Architecture, SOLID, testing strategy, and tactical DDD. Container of guides; each concept is a companion.
---

# architecture — language-agnostic engineering principles

Container for keel's architecture concepts. Language-agnostic: it describes **how
to think about** structure; each language realizes it in its own idiom, and mechanical
enforcement (when it exists) comes from a per-language pack, not from here.

## When to use

- In the **plan-writer** phase, when deciding the feature's layers/modules/boundaries.
- When **refactoring** existing structure, or when `architecture-template.md` is filled in.
- Whenever a dependency or boundary decision comes up.

The non-negotiables already live in the constitution (`## Architecture Principles`, injected on
SessionStart) — this skill is the depth and rationale behind them.

## How to apply (in the SDD chain)

1. Identify the feature's **domain** (entities, business rules) and separate it from what is
   framework/I-O/infra. When a term already means something else elsewhere in the product, the
   boundary is a **bounded context** (see
   [references/ddd-strategic.md](references/ddd-strategic.md)).
2. Apply the **dependency rule**: dependencies point inward (see
   [references/clean-architecture.md](references/clean-architecture.md)), which also carries the
   hexagonal/onion vocabulary and the driving-vs-driven port distinction.
3. Decide how files are **grouped** — by feature slice or by layer (see
   [references/vertical-slice.md](references/vertical-slice.md)). Independent of step 2: slices
   organize the tree, the dependency rule governs what happens inside one.
4. Model the domain with **tactical DDD** when there are invariants/state (see
   [references/ddd-tactical.md](references/ddd-tactical.md)).
5. Name the **expected failures** alongside the happy path and decide how they are represented
   (see [references/error-handling.md](references/error-handling.md)) — they are part of the
   contract, not an afterthought.
6. Check the design against **SOLID** (see [references/solid.md](references/solid.md)) — one
   responsibility per unit, depend on abstraction, not on detail.
7. Plan the tests via the **testing strategy** (see
   [references/testing-strategy.md](references/testing-strategy.md)), which reinforces the
   `test-driven-development` skill (behavior over implementation).
8. Before adding a dep/abstraction/feature, climb the **laziness ladder** (see
   [references/minimalism.md](references/minimalism.md)) — the simplest design that satisfies the
   requirement, without cutting security/validation/data-loss/a11y.

## Concepts

Read the one that applies — they are independent and load on demand.

- [references/clean-architecture.md](references/clean-architecture.md) — layers + dependency rule; hexagonal/onion vocabulary; driving vs driven ports.
- [references/vertical-slice.md](references/vertical-slice.md) — feature-first vs layer-first grouping; why slices parallelize and layers collide.
- [references/solid.md](references/solid.md) — the 5 principles as heuristics, read as properties rather than rules.
- [references/error-handling.md](references/error-handling.md) — expected failure vs bug; never swallow; what a message must contain.
- [references/testing-strategy.md](references/testing-strategy.md) — pyramid/strategy; references `test-driven-development`.
- [references/ddd-tactical.md](references/ddd-tactical.md) — entity, value object, aggregate, repository, domain service.
- [references/ddd-strategic.md](references/ddd-strategic.md) — bounded context, ubiquitous language, context map; the seams a PRD declares.
- [references/minimalism.md](references/minimalism.md) — the laziness ladder; pre-write minimalism (vs `simplify` post-write).

Mechanical enforcement of the dependency rule is opt-in and lives in the `architecture-gates`
pack, not here — this file is the reasoning, the pack is the check.

To add a concept, see `docs/design-notes/concepts-layer.md` (the container's recipe).
