---
type: state
title: Project state
description: Between-session work-state tracking the current active feature, recent decisions, blockers, and deferred ideas.
---

# STATE — Living project memory

> Working memory **between sessions** (humans and agents). It's **volatile**: updated all
> the time. Different from an **ADR** (a durable, immutable decision — see `docs/architecture/adr/`).
> Structural decision → ADR; work state → here. Update when **pausing/ending**; read when
> **resuming**. Use the `handoff` skill. Injected into context at the start of each session.

**Last updated:** 2026-09-06

## In progress / next step

- Nothing in flight. Features 001, 002 and 003 are implemented, verified and committed on `main`.
  `003-catalog-listing` sits in the commit at the tip of `main`, 62 files, and closed the SDD cycle
  through `review-and-simplify` and `learn-session`.
- `.specify/state` still names `003-catalog-listing`. `prd-writer` repoints it when the next
  feature starts; do not edit it by hand.
- Next concrete step: pick feature 004 and enter the chain at `brainstorming`. No candidate has
  been chosen — the product brief's remaining jobs-to-be-done are the place to look, and the write
  path for products is the obvious successor, since 003's spec fixes the record shape a writer must
  honor (`specs/003-catalog-listing/spec.md`, FR5b and the Out of Scope list).

## Recent decisions

- Git history was rewritten to strip the `Claude-Session:` trailer from all 5 commits that carried
  it (`git filter-branch --msg-filter`, 15 commits rewritten). `Co-Authored-By:` was kept. Content
  is byte-identical — `git diff` against the pre-rewrite tip is empty. The trailer must not be
  written again. There is no remote, so nothing needed force-pushing.
- 003's three durable decisions are ADRs, not STATE entries:
  [ADR-0002](architecture/adr/0002-approximate-sliding-window-counter-in-dynamodb.md),
  [ADR-0003](architecture/adr/0003-fail-open-when-the-throttling-path-fails.md),
  [ADR-0004](architecture/adr/0004-problem-mapping-rows-contributed-per-context.md), plus
  [ADR-0005](architecture/adr/0005-openapi-paths-contributed-per-context.md) (each bounded context
  owns its OpenAPI path rows; `AppModule` assembles them).
- `learn-session` routed this session's durable facts into `CLAUDE.md`'s `keel:tests` block and
  `docs/gotchas.md`. They are not repeated here.

## Blockers

- None. All three suites and the gates were re-run from a cold start and are green: 275 unit,
  16 integration, 59 e2e, `bash .specify/gates/run-gates.sh` all gates passed.
- Three open `SPEC_DEVIATION` comments remain, expected and counted by the fidelity gate:
  `src/shared/config/environment.schema.ts` (bootstrap-time config validation),
  `src/throttling/infrastructure/dynamo/throttle-counter.repository.ts` (rollover transition),
  `src/throttling/presentation/client-address.policy.ts` (FR5a's pure-function bootstrap).

## Deferred ideas / todos

- Five minor findings from the 003 review, none behavior-affecting, none blocking. Reconsider when
  next editing the catalog context:
  - `src/catalog/infrastructure/dynamo/catalog-query-failed.error.ts` — `causeName` is write-only:
    set, never read, and `logFailure` omits it, so a production query failure logs
    `catalog_query_failed` with no cause. Either log it or drop the field. Highest value of the five.
  - `src/catalog/presentation/catalog-problem-mappings.ts` — the `MalformedProductItemError` row is
    unreachable: `readItems` runs inside the repository's `try`, so the catch-all rewraps it as
    `CatalogQueryFailedError`. Both map to 503, so removing the row changes nothing observable.
  - `src/auth/presentation/openapi/problem-schema.ts` — a re-export with zero importers. Dead file.
  - `src/auth/presentation/openapi/extend-zod.ts` — a one-line shim; `request-schemas.ts` and
    `response-schemas.ts` could import the shared module directly.
  - `src/catalog/infrastructure/dynamo/product.repository.ts` — `buildProductKey(accountId, '').PK`
    builds a whole key to discard the sort key. A partition-key helper would read better.
- `refs/original/refs/heads/main` holds the pre-rewrite history as a backup. Drop it once the
  rewrite is trusted: `git update-ref -d refs/original/refs/heads/main && git reflog expire
  --expire=now --all && git gc --prune=now`.
- Local DynamoDB was left running. It uses `-inMemory`, so a container restart wipes the table and
  the start command's `npm run db:create-table` has to run again.
