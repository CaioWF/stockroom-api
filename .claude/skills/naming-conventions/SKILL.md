---
name: naming-conventions
description: Naming-convention lens consulted BEFORE writing code — camelCase in code, snake_case at the DB boundary, and one consistent name per concept across layers. Appended to impl-conventions.txt by the stack-conventions pack. Also usable standalone.
---

# naming-conventions

When: consulted by `plan-writer` (to record naming decisions in `Technical Decisions`) and by `implement-feature` (to apply them while coding), in projects where the `stack-conventions` pack is installed. Not a review lens — this shapes code as it is written, not after.

Scope: names the code introduces — identifiers, DB columns/tables, API fields, files. Advisory knowledge, makes no edits.

## Conventions

- **Code identifiers:** `camelCase` for variables/functions/properties, `PascalCase` for types/classes/components, `SCREAMING_SNAKE` for module-level constants. One name per concept — do not rename a thing as it crosses functions (`userId` stays `userId`, not `uid` then `user_id` then `id`).
- **Database boundary:** `snake_case` for tables and columns (`created_at`, `user_id`). Tables plural (`users`), columns singular. The mapping `camelCase` (code) ↔ `snake_case` (DB) is EXPLICIT — declared once in the ORM/mapper (Prisma `@map`/`@@map`, or the query layer), never scattered per-query. A plan that adds a table must state this mapping.
- **API fields:** pick one wire casing per API and hold it — `camelCase` JSON is the common default for TS stacks; do not mix `camelCase` and `snake_case` in the same payload. The wire shape is a contract, independent of the DB casing.
- **Booleans:** prefix with `is`/`has`/`can` (`isActive`, `hasAccess`). Avoid negated names (`isNotDisabled`).
- **Files:** match the surrounding tree's existing convention (`kebab-case.ts` vs `PascalCase.tsx`) — consistency with siblings beats any absolute rule.

## Applying

- In `plan-writer`: when the plan adds a table, column, or API field, record the code↔DB↔wire names and the mapping site in `Technical Decisions`. Ambiguity here becomes a `clarify` question, not a coin-flip at implement time.
- In `implement-feature`: before naming a new identifier, match how the surrounding code already names the same concept. New name only when no sibling exists.

Whitelist over blacklist for any allowed-value naming (source/role/type checks): name the allowed set, not the banned one — see the constitution's authorization rule.
