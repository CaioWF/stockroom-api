# Product Requirements Document (PRD)

> Product context (who the user is, what the product is, the north-star metric) lives in the
> brief at `.specify/memory/product.md`. This PRD **references** that brief and records only what
> is specific to THIS feature — do not repeat the user profile or the product's value proposition.

## Problem

- [The problem/opportunity specific to THIS feature]
- [How it connects to the product's core problem (see `product.md`) — without repeating it]

## Hypothesis

- [Statement of the hypothesis about the solution]
- [Why we believe this will work]

## User/Context

- [Inherits the target user from the product brief (`.specify/memory/product.md`); record only
  what this feature adds or restricts]
- [Usage scenarios specific to this feature]
- [Context and constraints specific to this feature]

## Success Metric

- [Measurable KPI or OKR]
- [How to evaluate the feature's success]

## Dependencies & Interfaces

**Consumes (inputs)** — what this feature depends on to work:

- [Source (feature `NNN-name` / service / external system) → what is consumed]

**Exposes (outputs)** — what this feature now offers to others:

- [Contract/endpoint/event/data/screen exposed → who consumes it]

**Dependencies** — couplings with explicit direction:

- [`specs/NNN-name` or external system — blocks this feature / is unblocked by it]

## Out of Scope

- [What will not be delivered in this phase]
- [Future improvements considered]
