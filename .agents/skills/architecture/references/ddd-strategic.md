# Strategic DDD (language-agnostic)

Source: Eric Evans, *Domain-Driven Design*, part IV. Where [tactical DDD](ddd-tactical.md)
models what is inside one model, strategic DDD decides **how many models there are and where
each one stops**. Use it when a term starts meaning two different things, or when one feature
keeps having to know about another.

## Bounded context

A bounded context is the boundary within which a model and its terms have **one** meaning. The
same word can exist in two contexts with different definitions, and that is correct — the error
is forcing one shared definition on both.

Order in Sales is a basket with prices and a customer. Order in Fulfilment is a list of items
with weights and an address. Modelling one `Order` that serves both produces a type carrying
every field either side needs, where half are null at any moment and no invariant holds. Two
models with an explicit translation between them is the fix.

Signals that one context is really two:

- The same type name needs a qualifier to be unambiguous in conversation.
- A field is meaningful only when another field has a particular value.
- Two teams argue about what a term means and both are right.
- A change for one workflow keeps breaking a different workflow.

## Ubiquitous language

Inside a context, the code uses the domain's words and the domain uses the code's words — one
vocabulary, no translation running in anyone's head. If the business says "policy lapsed" and
the code says `status = 3`, the model is not expressing the domain.

What keeps it honest: name types and methods with terms a domain expert would recognize; when
the business changes a term, rename in code as part of the same change; and when the code needs
a word the business does not have, that is usually a missing concept rather than a naming
problem.

## Context map

The map records how contexts relate. The relationship matters more than the diagram — it says
who absorbs change when the other side moves.

- **Shared kernel** — two contexts share a small model deliberately. Cheapest to build, most
  expensive to change: any edit needs both sides to agree.
- **Customer/supplier** — downstream depends on upstream, and upstream accepts responsibility
  for not breaking it. Requires a real agreement, not an assumption.
- **Conformist** — downstream adopts upstream's model as-is because it has no leverage. Honest
  when upstream is a vendor or a fixed platform.
- **Anticorruption layer** — downstream translates upstream's model into its own at the edge.
  The right default against legacy or third-party models: it stops a foreign shape from leaking
  into the domain.
- **Separate ways** — no integration. Often the correct answer, and the one least often
  considered.

## How this connects to the rest of keel

The **seams** a PRD declares (`Consumes` / `Exposes` / `Dependencies`) are context-map edges
written per feature. `Exposes` is what other contexts may rely on; `Consumes` names the
upstream and, implicitly, one of the relationships above. Saying which relationship it is turns
"we call their API" into a statement about who absorbs the breakage.

The project's `product.md` describes one product; it does not follow that the product is one
context. When two features in the same product resist a shared term, that is the boundary
showing itself.

## Where it goes wrong

- **Splitting too early.** Contexts cost translation, duplication and coordination. A model
  that is still coherent should stay one model. Split when the language breaks, not when the
  file gets long.
- **A context per table, or per service.** Boundaries come from language and invariants, not
  from deployment or storage. Services drawn on the wrong boundary are distributed coupling.
- **Integrating through the database.** Two contexts reading the same tables have no boundary
  at all, whatever the diagram says.
- **A map nobody updates.** Relationships not revisited when integration changes make the map a
  lie, which is worse than no map.

## How to apply

In brainstorming and prd-writer, ask whether the feature lives in an existing context or opens
a new one, and name the relationship to whatever it touches. In plan-writer, place the
anticorruption translation at the boundary explicitly instead of letting a foreign model reach
the domain — the same move the dependency rule already requires, applied between contexts
rather than between layers.

## Enforcement

Advisory. Its nearest mechanical neighbour is the import-direction check, which can forbid one
context's directory from importing another's internals once boundaries are named in the
directory structure. Everything above the directory level is judgment.
