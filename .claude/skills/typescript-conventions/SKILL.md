---
name: typescript-conventions
description: TypeScript convention lens consulted BEFORE writing code — strictness, type-at-the-boundary, discriminated unions over booleans, and no-any hygiene. Appended to impl-conventions.txt by the stack-conventions pack. Also usable standalone.
---

# typescript-conventions

When: consulted by `plan-writer` (to record type-design decisions) and by `implement-feature` (to apply them while coding), in projects where the `stack-conventions` pack is installed and the stack is TS. Not a review lens — shapes code as written; the `code-review` lens still audits it after.

Scope: TS the change introduces. Advisory knowledge, makes no edits.

## Conventions

- **Strict on:** assume `strict: true`. No implicit `any`. If a value's type is unknown at a boundary, type it `unknown` and narrow — never `any` to silence the compiler.
- **Type at the boundary:** every external input (HTTP body/query, env, DB row, third-party response) is validated into a typed shape at the edge (zod/valibot/class-validator or an explicit parser), so the interior is trusted. Don't cast (`as Foo`) untrusted data into a type — casting is an assertion, not a check.
- **Make illegal states unrepresentable:** discriminated unions over boolean flags for mutually exclusive states (`{ status: 'loading' } | { status: 'ok'; data } | { status: 'error'; error }`, not `isLoading`+`data?`+`error?`). Prefer `readonly` fields and `as const` for fixed sets.
- **Narrow allowed values by whitelist:** for source/role/type/origin checks, type them as a union and check membership against the allowed set — the compiler then rejects new stray values by default (mirrors the constitution's authorization rule).
- **Async correctness:** every promise is awaited or explicitly `void`ed; no floating promises. Errors propagate as typed results or thrown typed errors — never swallowed in a bare `catch {}`.
- **No enums-as-strings sprawl:** a fixed set is a union type or `const` object, named once and imported — not the same string literal retyped across files.
- **Nullish over falsy:** `??` / `?.` for null-vs-undefined intent; reserve `||` for genuine boolean-falsy defaults.

## Applying

- In `plan-writer`: when the plan introduces a domain state machine or an external boundary, record the union/parse-at-edge decision in `Technical Decisions`.
- In `implement-feature`: match the repo's existing validation lib and type-organization convention before introducing a new one — climb the laziness ladder (reuse existing).
