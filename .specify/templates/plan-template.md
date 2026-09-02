---
status: draft
---

# [Feature] — Plan

## Architecture

- [Main components]
- [Data flow]
- [Integration with existing systems]

## File Structure

- [src/components/...]
- [src/services/...]
- [tests/...]

## Technical Decisions

- [Tech decision 1 and rationale]
- [Tech decision 2 and rationale]

## Data Layer Contract

> Fill in ONLY when the plan adds/changes a table, column, index, or migration.
> Otherwise, write `N/A — does not touch the data layer` and move on.

- **Code↔schema mapping**: [`camelCase` field (code) ↔ `snake_case` column (DB), and where the mapping lives — e.g. Prisma `@map`/`@@map`, or the query layer. One place, not scattered.]
- **Tables/columns**: [explicit PK; FKs with `on delete`; types (`timestamptz`/`numeric`/…); `not null`/`unique`/`check` constraints.]
- **Indexes**: [FK and filter/sort columns on hot path; composite index order; `unique` for real invariants.]
- **RLS**: [tenant/user-scoped tables → RLS enabled + allow-list policy on the scope column. Or `N/A` with reason.]
- **Migration**: [additive and reversible; new non-null column via default or backfill+`set not null`.]

## Implementation Order

1. [Task 1: Description]
2. [Task 2: Description]
3. [Task 3: Description]

## How to Validate

> Strategy only — which kinds of test cover what, and why that is enough. The per-`AC-N` proof map
> (exact command, expected observable, environment setup) belongs in `contract.md`, written by
> `tasks-writer`. Do not duplicate it here.

- [Unit tests]
- [Integration tests]
- [Quality checklist]
