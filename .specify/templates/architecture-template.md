# Feature Architecture — [Feature]

> Language-agnostic format. Describes the layers and the direction of dependencies; **each
> language realizes it in its own idiom** (TS: folders + barrels; Go: packages + `internal/`;
> Python: modules/packages; Java: packages). Filled in during plan-writer. Guide: `architecture`
> skill.

## Layers

| Layer | Responsibility | Can depend on | CANNOT depend on |
|---|---|---|---|
| `domain` | Entities, value objects, business invariants | (nothing external) | framework, I/O, database, HTTP |
| `application` | Use cases; defines **ports** (interfaces) | `domain` | concrete infra |
| `infrastructure` | Implements the ports: repos, clients, ORM | `application`, `domain` | `interface` |
| `interface` | Delivery: HTTP/CLI/UI; converts input/output | `application` | `infrastructure` details |

Dependency direction (inward only): `interface → application → domain`;
`infrastructure → application/domain` (implementing ports declared within).

## Realization in this language/stack

- Language: [e.g.: TypeScript]
- Layer → unit mapping: [e.g.: each layer is a folder; imports crossing the boundary are
  forbidden by the enforcement pack]
- Enforcement: [e.g.: `architecture-gates` pack, layer map in `.specify/architecture.json`; or
  "advisory" if the pack is not installed]

## Components of this feature

- **Domain:** [entities / value objects / aggregates + roots]
- **Use cases:** [intents + ports each one declares]
- **Adapters/infra:** [port implementations: repository X, client Y]
- **Interface:** [input endpoints/commands]

## Boundary decisions

- [Why something is domain and not infra]
- [Where each port lives and who implements it]
- [Aggregates and their consistency boundaries]
