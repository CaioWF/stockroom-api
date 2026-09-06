---
type: adr
title: One shared catalog partition
description: The catalog is a single shared collection under a fixed partition key, and an account authenticates a caller without owning or partitioning any product.
---

# ADR-0007: One shared catalog partition

- **Status:** accepted
- **Date:** 2026-09-06
- **Decision makers:** caiowf

## Context

`specs/003-catalog-listing` scopes the catalog per account. `buildProductKey` puts products under
`CATALOG#<accountId>`, the repository derives that partition from the verified token, and FR1, FR9,
FR10a, AC-6 and AC-7a exist to guarantee that one account never reads another's products. A whole
e2e file, `test/e2e/catalog/account-isolation.e2e-spec.ts`, proves it.

None of that came from a requirement. It came from `.specify/memory/product.md`, written in commit
`f0710f6` before the first feature, which said a catalog belongs to one merchant. 003's PRD
inherited that sentence and the spec turned it into functional requirements. The originating
challenge is quoted once in the repository, in `specs/002-request-throttling/brainstorm.md`, and
asks only for a paginated listing with a rate limit — it says nothing about accounts owning
products.

The brief has now been corrected: Stockroom serves one catalog, and an account is a credential for
reaching the API rather than a boundary that partitions data. The persistence model and 003's
isolation requirements contradict the corrected brief, so one of the two has to move.

## Decision

We will store every product under one fixed partition key and remove the account from the read
path entirely. An account authenticates a caller; it does not own, scope, or filter any product.

Authentication is unchanged. 003's FR2 and AC-14 stand: without a valid token the route answers
`401` and reads nothing. What changes is that the token stops deciding *which* records a caller
sees, because there is only one set.

A product item carries no owner attribute. Nothing would read it, and a field nothing consumes
drifts from whatever it was meant to mean.

## Alternatives considered

- **Keep the per-account partition** — rejected. It implements a product decision that has been
  withdrawn, and leaving it would mean the data model and the brief disagree, with the brief
  losing silently the next time somebody reads the code instead of the document.
- **Keep the account as an attribute on the item, read globally** — rejected. It preserves a
  write-time concept for a feature that does not exist yet, and this project has no write path;
  the feature that adds one can add the field then, against a real requirement.
- **A sharded partition key (`CATALOG#<shard>`) with scatter-gather reads** — rejected for now. It
  answers the throughput ceiling named below, but costs the single-query-per-page property that
  003's FR17 and AC-18 pin, and makes the cursor carry a shard. The ceiling is not a problem this
  product has; adopting the complexity before it does would be paying for a scale that has not
  arrived.

## Consequences

- **Positive:** the model matches the brief. `accountId` leaves the domain port, the use case, the
  repository, the mapper and the seeder, so the read path loses a parameter at every layer. FR9's
  caution that the cursor must carry no partition information becomes trivially true, since there
  is one partition.
- **Negative / trade-offs:** every product now lives in one DynamoDB partition, which is capped at
  roughly 3000 read and 1000 write units. The per-account key was distributing that load as a side
  effect of a decision made for the wrong reason, and this removes the distribution along with the
  reason. If throughput becomes real, the successor is the sharded key rejected above, and adopting
  it costs the one-query-per-page guarantee.
- **Negative / trade-offs:** 003 loses shipped, passing guarantees. FR1, FR9, FR10a, AC-6 and AC-7a
  are withdrawn and `account-isolation.e2e-spec.ts` is deleted. The repository ends up with fewer
  tests than it has today, and that is the intended outcome rather than a regression to fix.
- **Neutral:** products already written under `CATALOG#<accountId>` become unreachable once the
  partition key changes. They are local development data, so they are reseeded rather than
  migrated. A deployed environment holding real records would need a migration, and none exists.

## Related

- [Problem-mapping rows contributed per context](0004-problem-mapping-rows-contributed-per-context.md)
  — unaffected: the withdrawn requirements remove no problem code.
