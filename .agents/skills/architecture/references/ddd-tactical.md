# Tactical DDD (language-agnostic)

Source: Eric Evans, *Domain-Driven Design*. Tactical patterns model the domain within
the innermost layer of Clean Architecture. Use when there are **real business rules and
invariants** (not for anemic CRUD).

## The building blocks

- **Value Object** — defined by its values, no identity; immutable. E.g.: `Money`, `Email`,
  `DateRange`. Compared by value. Carries validation in the constructor (there's no such thing as an
  invalid `Email`).
- **Entity** — has a stable **identity** over time, even as attributes change. E.g.:
  `Order`, `User`. Equality by id, not by attributes.
- **Aggregate** — cluster of entities/value objects treated as a consistency unit. Has
  a **root** (aggregate root); the outside world only references the root.
- **Repository** — collection abstraction for loading/saving **aggregates** by their root. It is a
  **port** (Clean Architecture): defined in domain/application, implemented in infra.
- **Domain Service** — business logic that doesn't naturally belong to a single entity/value
  object (involves several). Stateless.
- **Domain Event** — something relevant that happened in the domain (`OrderPlaced`); enables
  decoupled reactions.

## Aggregate boundary (the rule that becomes constitution)

- **Every mutation goes through the aggregate root.** It guarantees the invariants. Don't
  change internal entities from outside the root.
- Keep aggregates **small** — only what needs to be consistent within the same transaction.
- Between aggregates, reference **by id**, not by object. Consistency between aggregates is eventual.
- One repository per **aggregate root**, not per table.

## Red flags

- Anemic entity (only getters/setters) with the business rule spread across application "services."
- Repository returning internal entities of another aggregate.
- Invariant checked in the controller instead of the aggregate root.
- Mutable value object, or one that accepts invalid state.

## How to apply

In plan-writer, identify aggregates and their roots before modeling persistence. Repositories
are ports → they align with the dependency rule (domain defines, infra implements). Strategic
depth (bounded contexts, ubiquitous language) is out of scope for this tactical guide.
