---
name: migration-safety
description: Database migration/schema-change safety lens over a feature's diff — read-only. Appended to review-and-simplify's lens registry by the api-review pack. Also usable standalone.
---

# migration-safety

When: dispatched by `review-and-simplify` as one of its parallel lenses, on the feature's diff, in projects where the `api-review` pack is installed. Also usable standalone for a focused migration pass.

Scope: schema and migration changes only in the feature's tree-snapshot diff (`git diff BASE_TREE HEAD_TREE`, per `subagent-driven-development`'s no-commit-rule snapshotting) or, if no snapshots exist, the working tree diff — migration files, `schema.prisma`, SQL DDL, ORM entity/column changes. Never the whole repo. If the diff contains no schema/migration change, report "no migration-relevant changes" and stop — do not manufacture findings.

Output: findings by severity (Critical/Important/Minor) with `file:line`, reported inline. Makes NO edits.

## Calibration

Judge migration **safety against existing data and a live deploy** — the concern is "will applying this to a populated production DB lose data, fail, or lock a table", distinct from `perf-review`'s query-efficiency concern (N+1, missing index on a hot read). Flag only what the changed migration/schema introduces.

- **Destructive / irreversible:** dropping a column or table still read/written by code; renaming a column as drop+add (data loss) instead of a preserving rename; changing a type in a way that truncates or fails to cast existing rows; no rollback/down path where the tooling expects one.
- **Non-null without backfill:** adding a `NOT NULL` column to a populated table with no default and no backfill step; making an existing nullable column `NOT NULL` before existing NULLs are backfilled — the migration fails on real data.
- **Constraint on dirty data:** adding a `UNIQUE`/`CHECK`/foreign-key constraint without first proving or cleaning existing rows that would violate it.
- **Locking / long-running:** an operation that rewrites or exclusively locks a large table on a hot path (e.g. adding a non-nullable column with a volatile default, a blocking index build) with no concurrent/online variant where the engine offers one.
- **Ordering / expand-contract:** a schema change deployed in a single step that breaks the currently-running app version — a column/table removed or renamed before the code that uses it stops shipping. Prefer expand → migrate → contract across releases.
- **New FK without index:** a foreign key added with no index on the referencing column (both a lock-on-write and a lookup-perf risk) — flag the safety half here, defer pure read-perf to `perf-review`.

Weigh blast radius: a `DROP COLUMN` on a live table or a `NOT NULL` add without backfill is Critical; a missing down-migration on a brand-new table with no data is Minor. Do not restate what a migration linter (e.g. an online-DDL checker) already gates — this lens is for the judgment those miss (is this column *actually* still in use? is the backfill *correct*?).

Next: findings return to `review-and-simplify`, which aggregates them with the other lenses; Critical/Important must be fixed before the pre-commit gate.
