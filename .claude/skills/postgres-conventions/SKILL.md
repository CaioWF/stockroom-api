---
name: postgres-conventions
description: PostgreSQL convention lens consulted BEFORE writing schema/migrations — indexing, constraints, row-level security, and timestamp/type hygiene. Appended to impl-conventions.txt by the stack-conventions pack. Also usable standalone.
---

# postgres-conventions

When: consulted by `plan-writer` when the plan adds a table, column, index, or migration, and by `implement-feature` while writing the schema/migration, in projects where the `stack-conventions` pack is installed. Complements the `migration-safety` review lens (that catches unsafe change *shapes* after the fact; this shapes the schema up front).

Scope: schema and migration the change introduces. Advisory knowledge, makes no edits.

## Conventions

- **Keys:** every table has an explicit primary key. Prefer a surrogate (`bigint generated always as identity`, or `uuid`) unless a natural key is truly stable. Foreign keys carry an explicit `references` + `on delete` policy — never leave the cascade behaviour implicit.
- **Indexes:** index every foreign key and every column a query filters/sorts on in a hot path. Composite index column order = most-selective / equality-first, range last. Add a `unique` index for any real uniqueness invariant (don't enforce it only in app code). Name indexes predictably (`idx_<table>_<cols>`).
- **Row-level security:** for multi-tenant / per-user tables, enable RLS (`alter table … enable row level security`) and write policies keyed on the tenant/owner column. Whitelist the allowed principal (policy `using (tenant_id = current_tenant())`) — never a deny-list of bad actors. RLS is enforcement, not a substitute for authorization checks in the app; it is the backstop when a query forgets one.
- **Constraints over app-only rules:** `not null`, `check`, `unique`, and FK constraints encode invariants where they cannot be bypassed. If a rule matters, the DB should hold it too.
- **Types & time:** `timestamptz` (never bare `timestamp`) for instants; store UTC. `text` over `varchar(n)` unless a length limit is a real domain rule. `numeric` for money, never `float`. Enums via a lookup table or PG `enum` — not free-form strings.
- **Migrations:** additive and reversible. New non-null column ships with a default or a backfill + a later `set not null`; never a bare `not null` add on a populated table. One logical change per migration.

## Applying

- In `plan-writer`: record indexes, constraints, RLS policies, and the code↔`snake_case` mapping (see `naming-conventions`) in `Technical Decisions`, not left to implement-time guesswork.
- In `implement-feature`: match the existing migration tool and file convention already in the repo before writing a new migration.
