# SOLID (language-agnostic)

Five heuristics for modules that change without breaking. Use as a design checklist, not
dogma — each one addresses a specific coupling/cohesion pain point.

**Read these as properties, not as rules.** Dan North's CUPID (composable, Unix philosophy,
predictable, idiomatic, domain-based) exists as a reaction to SOLID being recited as a rulebook,
and its useful move is the reframing: a rule is something you either comply with or violate,
while a property is a direction you can be closer to or further from. Nothing below is a pass or
a fail. Move toward each one until moving further costs more than it returns — splitting a unit
that has a single reason to change satisfies S and makes the code worse. Where a principle and
the reader's comprehension disagree, comprehension wins.

## S — Single Responsibility

A unit has **one reason to change** (one actor/stakeholder). If two unrelated changes
touch the same module, split it.
- Red flag: a class/function that does parsing + business rule + persistence.

## O — Open/Closed

Open for extension, closed for modification. Add behavior via a **new implementation
of an abstraction**, not by editing existing code that already works.
- Red flag: a `switch`/`if` per type that grows with every new feature. Consider polymorphism/strategy.

## L — Liskov Substitution

A subtype must be usable wherever the supertype is expected, **without surprise**. Don't
strengthen preconditions or weaken postconditions.
- Red flag: a subclass that throws in an inherited method, or an `instanceof` check to handle a different subtype.

## I — Interface Segregation

Clients shouldn't depend on methods they don't use. Prefer **small, focused ports** over a
fat interface.
- Red flag: implementing an interface where half the methods throw `notImplemented`.

## D — Dependency Inversion

Depend on **abstractions**, not on concretes. High-level modules (use cases) define the port;
low-level ones (infra) implement it. This is the engine behind Clean Architecture's dependency rule.
- Red flag: a use case doing `new` on a concrete HTTP/SQL client instead of receiving the port.

## How to apply

When designing the feature (plan-writer), run the module through these five questions. SOLID
**supports** the dependency rule (especially D and I): they're the tactical way to keep Clean
Architecture's boundaries clean. Enforcement is via language-specific lint (later), not in the
language-agnostic core.
