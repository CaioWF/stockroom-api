# Clean Architecture (language-agnostic)

Source: Robert C. Martin, *Clean Architecture*. Goal: keep business rules
independent of framework, UI, database, and external details — so details can change
without rewriting the core.

## The layers (from inside out)

1. **Entities / Domain** — the most stable business rules. Business types and invariants.
   Know nothing about the outside.
2. **Use cases / Application** — orchestrate entities to fulfill a user intent.
   Define **ports** (interfaces) for what they need from the outside world.
3. **Interface adapters** — convert between the use cases' format and the outside world:
   controllers, presenters, gateways, repository mappers.
4. **Frameworks & drivers** — web framework, database, queue, SDKs. The most volatile ring.

## The dependency rule (the central rule)

**Code dependencies point only inward.** An inner ring never knows about an outer one.

- The domain does NOT import framework, I/O, ORM, HTTP, or infra types.
- Use cases depend on **abstractions** (ports) they declare; infra **implements** these
  ports (dependency inversion). Control flow can go outward; **code dependency**
  cannot.
- Data crosses the boundary as a plain structure (DTO), never an ORM entity leaking into
  the domain.

## How it maps to structure

`domain/` (entities) · `application/` (use cases + ports) · `infrastructure/` (adapters/port
implementations) · `interface/` (delivery: HTTP, CLI). Import direction: `interface → application →
domain`, `infrastructure → application/domain` (implementing ports). See
`architecture-template.md` for the format; each language realizes it in its own idiom.

## Hexagonal and Onion: the same rule in other words

Ports and Adapters (Cockburn, 2005) and Onion (Palermo, 2008) are not competing rules. All
three put the business model at the centre and forbid it from depending outward; they differ in
vocabulary and in how finely they name the rings. Choosing between them is choosing what to
call things, not what is allowed.

| Clean | Hexagonal | Onion |
|---|---|---|
| Entities / domain | inside the hexagon | domain model |
| Use cases + ports | the ports | domain services + application services |
| Interface adapters | adapters | infrastructure |
| Frameworks & drivers | the outside world | infrastructure |

What hexagonal contributes that the rings do not make obvious is the **direction of the port**,
and it is worth borrowing whichever style a project names itself after:

- **Driving (primary) ports** — the application's own API, called *by* the outside. HTTP
  handlers, CLI commands, message consumers and test harnesses drive it. The adapter depends on
  the port; the application does not know who called.
- **Driven (secondary) ports** — what the application needs *from* the outside, declared by the
  application and implemented by infra. Repositories, mail senders, clocks, payment gateways.

The asymmetry answers a question that comes up constantly while designing: *who owns this
interface?* Both kinds are defined by the application, for opposite reasons — a driving port
exists so callers have something stable to call, a driven port exists so the application never
names a concrete dependency. An interface defined by infrastructure and imported by a use case
is neither, and is a dependency-rule violation wearing an interface.

Practical consequence: two adapters implementing the same driven port (a real database one and
an in-memory fake) is the normal case, and it is what makes the domain testable without the
world running. If a driven port has exactly one implementation and no plausible second, check
`minimalism.md` before extracting it — the rule permits the port, it does not require one for
everything.

## Violation signals (red flags)

- `import` of framework/database inside `domain/`.
- Use case instantiating a concrete HTTP/SQL client instead of receiving a port.
- ORM entity used as the domain model.
- Business rule inside a controller/handler.

## Enforcement

Language-agnostic here is guidance. The mechanical half — forbidding the import across the
boundary — is the opt-in `architecture-gates` pack, which declares the layer map in
`.specify/architecture.json` and fails `run-gates.sh` on a violation. It checks that one
invariant and no more; for cycles, orphans or a full graph, reach for the real tools:
`dependency-cruiser`/`eslint-plugin-boundaries` (TS/JS), `import-linter` (Python), arch-tests
plus `internal/` (Go), ArchUnit (Java). Enforcement never lives in the agnostic core.
