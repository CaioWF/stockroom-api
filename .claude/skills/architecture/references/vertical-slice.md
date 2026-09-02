# Vertical slice (language-agnostic)

Source: Jimmy Bogard's vertical slice architecture. Organize code by **feature**, not by
technical layer. A slice owns everything one user intent needs — endpoint, handler, rule,
persistence call — so changing that feature means touching one directory.

This is not an alternative to the dependency rule. It answers a **different question**: Clean
Architecture says which direction dependencies may point; vertical slice says how to group
files. Apply both — slices organize the tree, the dependency rule governs what happens inside
one.

## Layer-first vs feature-first

Layer-first puts every controller together, every use case together, every repository
together:

```
application/     use-cases/create-order, use-cases/cancel-order, ...
infrastructure/  repositories/order-repo, repositories/user-repo, ...
interface/       http/order-controller, http/user-controller, ...
```

Feature-first puts one feature's whole path together:

```
features/create-order/   handler  rules  persistence
features/cancel-order/   handler  rules  persistence
shared/                  what two or more slices genuinely need
```

The domain model usually stays shared — entities and invariants belong to the business, not to
one endpoint. What moves into the slice is the orchestration: the handler, the slice's own
query or command, its validation, its mapping.

## Why it matters here specifically

Two independent reasons, one of them measured in this repo.

**Parallel work.** Slices are naturally file-disjoint; layers are not. Two agents told to add
feature A and feature B under a layer-first tree both edit the controllers directory, both
edit the repositories directory, and collide. Under a feature-first tree they touch different
directories and do not. keel's parallel dispatch requires pairwise disjoint scopes — a
layer-first decomposition rarely produces them, which is why batches collapsed to sequential.

**Reading cost.** Understanding one endpoint in a layer-first tree means opening one file per
layer and reconstructing the path. In a slice it is one directory. Every reader pays that
cost, human or agent, on every task.

## Where it costs

- **Duplication across slices.** Two slices with near-identical persistence code is the normal,
  accepted price; premature extraction into `shared/` is the failure mode. Extract on the third
  occurrence, not the second, and only when the two are the *same* concept rather than two
  concepts that currently look alike.
- **Shared drift.** `shared/` becomes a junk drawer if nothing pushes back. Anything in there
  should be nameable as a concept, not as "stuff more than one slice imports".
- **Cross-slice rules.** A rule that spans features belongs to the domain, not to either slice.
  If it is being copied into two slices, it was never slice-local.

## How to apply

In plan-writer, decide the slice boundary **before** the file structure: name the user intents,
then give each one a directory. In tasks-writer, prefer one task per slice over one task per
layer — that is what makes a batch parallelizable, and it is the decomposition the
`[scope: glob]` metadata can actually express.

If a feature genuinely cuts across slices (a schema migration, a shared value object), that is
a signal it belongs to the shared domain: give it its own task with its own scope instead of
smearing it across the slices that happen to use it.

## Red flags

- A new feature requires editing four directories that no other feature touches.
- `shared/` grows on every feature and nothing ever leaves it.
- Two tasks in one batch declare overlapping scopes because both need "the controllers".
- A slice imports another slice's internals rather than the shared domain.

## Enforcement

Advisory — grouping is a design decision, not a mechanical rule. Its mechanical neighbour is
the scope check (`validate-parallel-scope`), which fails a batch whose declared scopes overlap;
a layer-first decomposition tends to trip it, and that is the feedback signal.
