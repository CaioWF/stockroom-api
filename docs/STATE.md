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

**Last updated:** YYYY-MM-DD by <name>

## In progress / next step

> What's open right now and the **next concrete action** (not "continue the feature" — state the step).

- Active feature: `specs/NNNN-<name>/` — <current phase: spec | plan | tasks | implement>
- Next step: <specific action, e.g. "implement AC-3 in adapter X">

## Recent decisions

> Chronological summary. If it's hard to reverse, turn it into an ADR and link it here.

- YYYY-MM-DD: <decision> — <ADR-NNNN if applicable>

## Blockers

- [ ] <what's blocking · who/how unblocks it · since when>

## Deferred ideas / technical backlog

- <idea → what trigger to reconsider>

## Loose todos

- [ ] <task that doesn't fit a spec yet>
