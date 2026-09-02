---
type: adr
title: Record architecture decisions
description: Formalize architecture decision records as immutable documents to preserve structural reasoning and improve onboarding.
---

# ADR-0001: Record architecture decisions

- **Status:** accepted
- **Date:** YYYY-MM-DD
- **Decision makers:** <team>

## Context

Structural decisions (stack choice, module boundaries, cross-cutting patterns) get lost
when they live only in the head of whoever decided them, or scattered across chat threads. Whoever
arrives later (human or agent) redoes the discussion without knowing what was already ruled out and why.
`docs/STATE.md` holds the **volatile** state of the work — it's not the place for a durable decision.

## Decision

We will record every significant architecture decision as an immutable **ADR** (Architecture
Decision Record) in `docs/architecture/adr/NNNN-title.md`, using `_template.md`. An ADR is
append-only: to change one's mind, a new ADR is created that marks the previous one as "superseded by."

## Alternatives considered

- **STATE.md only** — mixes volatile state with durable decisions; the history of the why gets
  lost with every STATE update.
- **External wiki/Confluence** — lives outside the repository, drifts out of sync with the code, and doesn't version alongside it.

## Consequences

- **Positive:** traceable history of the *why*; faster onboarding (human and agent); STATE
  stays lean and links to the ADR.
- **Negative / trade-offs:** discipline required to write the ADR at decision time.
- **Neutral:** ADRs become part of the diff and the review like any other file.
