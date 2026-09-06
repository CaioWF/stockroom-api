---
type: adr
title: OpenAPI paths contributed per context
description: Each bounded context owns its OpenAPI path rows and the composition root assembles them into the published document.
---

# ADR-0005: OpenAPI paths contributed per context

- **Status:** accepted
- **Date:** 2026-09-05
- **Decision makers:** project maintainers, Codex

## Context

Feature [003-catalog-listing](../../../specs/003-catalog-listing/spec.md) adds
`GET /products` to the published OpenAPI document. Before this feature,
`src/auth/presentation/openapi/openapi-document.ts` registered every route,
including `/health`. Adding catalog paths there would make `auth` publish a
peer context's contract, violating FR21 and the existing module-boundary rule
that shared machinery must not depend on feature-specific code.

ADR-0004 already established the matching pattern for problem rows: contexts
contribute their own rows, and the composition root assembles the full set.
OpenAPI path publication has the same dependency shape.

## Decision

We will keep the generic OpenAPI registry and document builder in
`src/shared/presentation/`. Each bounded context contributes its own OpenAPI
paths, and `AppModule` assembles those contributions into the document served
at `GET /openapi.json`.

## Alternatives considered

- Keep all paths in `auth` — rejected because `auth` would need to know about
  `catalog`, making a bounded context publish a peer's routes.
- Put OpenAPI builders in each module independently — rejected because the
  public API serves one document, and duplicate generators would make component
  schemas and security schemes drift.
- Let `shared` import every context's paths — rejected because it inverts the
  dependency boundary that `shared` exists to preserve.

## Consequences

- **Positive:** bounded contexts publish their own paths without importing
  peers, and the OpenAPI document stays one generated contract.
- **Negative / trade-offs:** adding a context with public routes now requires
  editing the composition root to include its path contribution.
- **Neutral:** `/health` moves from auth's accidental OpenAPI registration into
  the health context's own contribution.
