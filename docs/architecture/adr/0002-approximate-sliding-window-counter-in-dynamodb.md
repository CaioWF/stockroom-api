---
type: adr
title: Approximate sliding-window counter in DynamoDB
description: Rate limits are enforced by a weighted sliding-window counter stored in the shared DynamoDB table, with both counts saturated at a configurable ceiling.
---

# ADR-0002: Approximate sliding-window counter in DynamoDB

- **Status:** accepted
- **Date:** 2026-09-05
- **Decision makers:** caiowf

## Context

A limit that only holds inside one process is not a limit: the API runs as N concurrent Lambda
instances, so an in-process counter yields an effective limit of N times the configured one. The
counter has to be shared, and the constitution already mandates the single DynamoDB table and rules
out any always-on component (Redis, ElastiCache) that has not earned its standing cost in a decision
record of its own.

That settles where the counter lives but not what it counts. A fixed window is one atomic `ADD` and
about thirty lines, and it admits twice the limit across a boundary — 100 requests at second 59 plus
100 at second 61 for a 100/min limit. `spec.md` AC-8 forbids exactly that.

A second force pushes the other way. A refused request still increments the counter (FR8), so a
caller does not buy a free probe with every rejection. Left unbounded, that turns the limiter into a
denial-of-service primitive: one flood inflates an identity's stored count arbitrarily high, and the
weighted estimate keeps an innocent caller sharing that identity refused long after the flood stops.

## Decision

We will enforce limits with a weighted sliding-window counter, stored in the shared DynamoDB table
behind the `RateLimitStore` port, with both the previous and the current window's count saturated at
`saturationCeiling = limit × THROTTLE_COUNTER_SATURATION_FACTOR` before they enter the estimate.

The estimate is `min(previous, ceiling) × (1 − elapsedFraction) + min(current, ceiling)`, and a
request is refused only when that value *exceeds* the limit, never at equality — the increment for
this request is already in the number.

The common path is one conditional `UpdateItem` whose single condition covers both "the stored
window is the caller's" and "the count is still under the ceiling"; the `ALL_OLD` item DynamoDB
attaches to the failed condition says which clause failed. A rollover costs three round trips: the
failed increment, the window transition, and the re-counted increment.

## Alternatives considered

- **Fixed window counter** — the cheapest correct-looking option, rejected on the boundary burst
  that AC-8 exists to forbid.
- **Sliding window log** — exact, but the item grows with traffic and the abusive caller is the one
  who inflates it most. Disproportionate storage for the caller we least want to reward.
- **Token bucket** — the model clients expect, and it yields a precise `Retry-After`. Time-based
  refill does not fit an atomic `ADD`; it needs a conditional update with retry or optimistic
  locking, the largest race surface of the four.
- **Redis / ElastiCache** — the conventional answer, rejected on the constitution's standing-cost
  principle.
- **In-memory per instance** — free and instant, and not a shared limit at all. It survives only as
  the degraded fallback in [ADR-0003](0003-fail-open-when-the-throttling-path-fails.md).
- **`@nestjs/throttler`** — peer-compatible with the installed Nest 11 and inspected at the source.
  Its storage contract is shaped around its own decision model, so adopting it would have meant
  fitting our window arithmetic into its `increment` signature rather than owning it.

## Consequences

- **Positive:** no boundary burst; near-log precision at roughly fixed-window cost; the stored item
  is constant size regardless of traffic; the saturation ceiling bounds both the amplification an
  attacker can inflict on a shared identity and the write capacity a refusal can burn.
- **Negative / trade-offs:** the estimate is an approximation, so admission near the limit is not
  exact. The `Retry-After` value must be derived by inverting the weighted estimate against the
  worst case — both counts at the ceiling — which was got wrong twice during implementation and is
  the reason `throttle-policy.ts` carries the longest comment in the feature. A rollover costs three
  round trips instead of one. Every request costs a write, including refused ones: a failed
  conditional write still consumes write capacity.
- **Neutral:** window length, limits, and both factors are configuration; the service starts and
  behaves sanely with none of the ten variables set (AC-26).
