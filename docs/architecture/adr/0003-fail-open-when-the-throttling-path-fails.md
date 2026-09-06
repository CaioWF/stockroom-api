---
type: adr
title: Fail open when the throttling path fails
description: Any failure inside the throttling path admits the request rather than refusing it, because throttling is resource control and not authorization.
---

# ADR-0003: Fail open when the throttling path fails

- **Status:** accepted
- **Date:** 2026-09-05
- **Decision makers:** caiowf

## Context

Throttling sits in front of every public route, `/auth/login` included. That gives its failure modes
the same blast radius as the routes themselves: a counter-table blip, a slow DynamoDB call, or an
unclassified throw inside the guard would each reach the global problem filter and answer `503`.
The product's north-star metric explicitly discounts clients throttled into failure, so a limiter
that converts a partial incident into a total outage is worse than no limiter for that window.

The distinction that settles it is that throttling is **resource control, not authorization**.
Refusing a request because a counter is unavailable is not a safety property; it is an outage with a
different status code.

Two further failure shapes had to be answered rather than assumed away. Store latency is one: a slow
store must not be allowed to hold a request open until the ALB idle timeout, which is the outage the
posture is meant to prevent. Backpressure is the other: a throttling-class store error and an
exhausted retry budget both mean "the store could not answer", not "this caller is over the limit",
so answering `429` to either would report a false reason to the client.

## Decision

We will admit the request on every failure inside the throttling path.

- A degraded store error is caught in the use case: it emits `throttle_degraded` **before**
  consulting the fallback, so a bug in the fallback can never suppress the alarm, then checks an
  instance-local limiter with a ceiling derived from `THROTTLE_LOCAL_FALLBACK_FACTOR`, and admits.
- All store work for one request runs under a single deadline — a total, not per call — driving an
  `AbortSignal`; outrunning it is classified as degraded.
- Both entry points, `ThrottleGuard` and `AccountThrottleInterceptor`, wrap the whole throttling path
  in a boundary that logs any unclassified throw and admits. A protected route that reaches the
  interceptor without auth claims is logged as a wiring defect and admitted.
- The instance-local fallback admits a previously unseen identity when its entry cap is full, rather
  than refusing on eviction (AC-19).

Only a `RateLimitExceededError` — the deliberate refusal — escapes the boundary and becomes a `429`.

## Alternatives considered

- **Fail closed everywhere** — guarantees the limit is never exceeded, at the price of `/auth/login`
  going dark whenever the counter table does. Treats a resource control as an authorization
  decision.
- **Fail closed on public routes only** — preserves protection on the attacker's highest-value
  target, but asymmetric semantics need explaining and testing in both modes, and login outage is
  the most visible failure symptom available.
- **Classify store failures finely and answer `429` to some of them** — attempted across two
  revisions and abandoned. Both intermediate positions were worse than either endpoint: they made
  the client's `Retry-After` a guess about our infrastructure rather than about their own traffic.
- **Refuse unknown identities when the fallback cache is full** — closes an eviction bypass, and
  turns cache pressure into refusals for callers who have done nothing.

## Consequences

- **Positive:** a counter-table outage degrades the limit instead of taking down sign-in; the
  degraded state is observable through `throttle_degraded` before any fallback logic runs; a
  pathological store cannot hold requests open past the deadline.
- **Negative / trade-offs:** during a degradation the effective limit is N instances times the local
  ceiling, so **the limit is not guaranteed while the store is unhealthy** — that is the trade being
  bought, not an oversight. A bug anywhere in the throttling path also fails silently in production:
  every request is served, and the only evidence is a structured event nobody is required to watch.
  The full-cache admission is a deliberate, documented bypass.
- **Neutral:** the structured events (`throttle_degraded`, `throttle_entrypoint_error`,
  `throttle_admission_error`) become the sole signal that the limiter is unhealthy, which makes
  their field allow-list (AC-27) load-bearing rather than cosmetic.

Related: [ADR-0002](0002-approximate-sliding-window-counter-in-dynamodb.md) — the in-memory counter
rejected there as a primary store is what serves as the fallback here.
