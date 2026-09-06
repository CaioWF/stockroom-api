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

## Alternatives considered

- **Keep the filter in `auth`, have throttling import `AuthModule`** — makes one bounded context
  depend on a peer for a cross-cutting presentation concern, and puts a cycle one feature away.
- **Each module registers `PROBLEM_MAPPINGS` independently** — reads like Angular's multi-provider
  and is not: the second registration overwrites the first, silently, as the `@nestjs/core` source
  confirms. The most dangerous option, because it looks correct until a row goes missing.
- **An `if`-chain inside the filter** — grows with every context and forces `shared` to import
  feature-specific exception types.
- **Declare the closed `code` union in `shared`** — one line per new code, and `shared` starts
  naming concepts it must not know about. The narrowing now happens in each context's own rows file.

## Consequences

- **Positive:** `shared` depends on nothing feature-specific, verified by the dependency-rule gate;
  adding a context is one rows file plus one entry at the composition root; message disclosure is
  closed by default.
- **Negative / trade-offs:** the composition root must be edited for every new contributor, and
  forgetting it is not a compile error — the context's rows simply do not exist, and its exceptions
  fall through to the filter's default mapping. Nothing enforces that step mechanically.
- **Neutral:** the filter moved from `src/auth/presentation` to `src/shared/presentation`, and
  auth's rows were extracted into `auth-problem-mappings.ts`.
