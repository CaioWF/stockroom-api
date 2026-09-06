---
type: adr
title: Problem-mapping rows contributed per context
description: Each bounded context owns its RFC 9457 problem rows and the composition root assembles them, keeping shared free of feature-specific types.
---

# ADR-0004: Problem-mapping rows contributed per context

- **Status:** accepted
- **Date:** 2026-09-05
- **Decision makers:** caiowf

## Context

The RFC 9457 problem filter arrived with authentication and lived in `src/auth/presentation`, with a
closed table naming every error code the API could answer. Throttling then needed to add one row
(`RATE_LIMIT_EXCEEDED`, `429`, plus a `Retry-After` header) to that table.

Neither obvious move works. Leaving the filter in `auth` and having `ThrottlingModule` import
`AuthModule` inverts the dependency between two peer bounded contexts. Moving the closed table into
`shared` makes `shared` name feature-specific concepts, which the constitution's dependency rule
forbids.

Nest does not offer a way out either. Verified against the installed `@nestjs/core` 11.2.3 source:
`Provider` declares no `multi` field, and `injector/module.js`'s `addProvider` stores providers in a
`Map` keyed by token, so a second registration under the same token silently overwrites the first.
Only `APP_FILTER`, `APP_GUARD`, `APP_INTERCEPTOR` and `APP_PIPE` get cross-module collection. Two
modules each providing `PROBLEM_MAPPINGS` would therefore lose one contributor's rows with no error.

## Decision

We will keep the generic machinery in `src/shared/presentation` — `ProblemDetailsFilter`, the
`ProblemRow` shape, and the `PROBLEM_MAPPINGS` token — naming nothing feature-specific, and have
each bounded context export its own `ProblemRow[]`. The composition root assembles them:
`AppModule` provides `PROBLEM_MAPPINGS` as `useValue: [authProblemMappings, throttlingProblemMappings]`,
and the filter injects the array of arrays and flattens it once.

A row must opt in to exposing `exception.message` via `exposeMessage`, applying the constitution's
allow-list rule to message disclosure: a row that forgets the field leaks nothing.

The closed `code` set is the one thing `shared` does name, as the runtime array `PROBLEM_CODES`
with `ProblemCode` derived from it, because the published OpenAPI document's `code` enum has to
generate from exactly one array or the contract and the filter drift apart. Contexts assert
membership (`'X' satisfies ProblemCode`) rather than unioning their own. So a new code costs two
edits — the array in `shared`, and the context's own row — plus the composition-root entry.

## Alternatives considered

- **Keep the filter in `auth`, have throttling import `AuthModule`** — makes one bounded context
  depend on a peer for a cross-cutting presentation concern, and puts a cycle one feature away.
- **Each module registers `PROBLEM_MAPPINGS` independently** — reads like Angular's multi-provider
  and is not: the second registration overwrites the first, silently, as the `@nestjs/core` source
  confirms. The most dangerous option, because it looks correct until a row goes missing.
- **An `if`-chain inside the filter** — grows with every context and forces `shared` to import
  feature-specific exception types.
- **Let each context union its own codes** — keeps `shared` from naming any feature concept at all,
  and leaves the generated OpenAPI `code` enum with no single array to build from, so the published
  contract could disagree with what the filter emits. Rejected for that reason; the closed set stays
  in `shared` and only the matching logic is contributed.

## Consequences

- **Positive:** `shared` carries no feature-specific exception type or matching logic, verified by
  the dependency-rule gate; the published `code` enum cannot drift from what the filter emits;
  message disclosure is closed by default.
- **Negative / trade-offs:** the composition root must be edited for every new contributor, and
  forgetting it is not a compile error — the context's rows simply do not exist, and its exceptions
  fall through to the filter's default mapping, which is a `503`. Nothing enforces that step
  mechanically. Adding a code also touches two files in two layers, so the closed set is a small
  shared bottleneck by design.
- **Neutral:** the filter moved from `src/auth/presentation` to `src/shared/presentation`, and
  auth's rows were extracted into `auth-problem-mappings.ts`.
