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

**Last updated:** 2026-09-05

## In progress / next step

- Active feature: `specs/002-request-throttling/`; `.specify/state` points to it. Branch:
  `002-request-throttling`, two commits ahead of `main`.
- Implementation is complete and committed as `3b32a84`. `tasks.md` is fully checked, `contract.md`
  is stamped PASS for every AC and the full-suite check, and `review-and-simplify` found no
  blocking issues. Re-verified on 2026-09-05: 248 unit, 13 integration, 43 e2e, gates green.
- Next concrete step: merge the branch into `main` locally, re-run gates on the result, then run
  `learn-session`.

## Recent decisions

- The feature's three durable decisions are now ADRs rather than STATE entries:
  [ADR-0002](architecture/adr/0002-approximate-sliding-window-counter-in-dynamodb.md) (the
  saturated sliding-window counter), [ADR-0003](architecture/adr/0003-fail-open-when-the-throttling-path-fails.md)
  (the fail-open posture), and [ADR-0004](architecture/adr/0004-problem-mapping-rows-contributed-per-context.md)
  (problem rows contributed per context, assembled at `AppModule`).
- The Codex view was regenerated with `~/workspace/keel/bootstrap.sh --force --agent=codex`.
  Bootstrap changed `AGENTS.md`, `.agents/`, `.specify/clients.json`, `.specify/keel.json`, and
  moved the tests block in `CLAUDE.md`.
- `ThrottlingModule` provides the Dynamo-backed store, local fallback limiter, use case, global
  IP guard, and account interceptor.
- DynamoDB local was used for integration/e2e and was left running.

## Blockers

- Three open `SPEC_DEVIATION` comments remain and are expected by the current work:
  `src/shared/config/environment.schema.ts` for bootstrap-time config validation,
  `src/throttling/infrastructure/dynamo/throttle-counter.repository.ts` for the rollover transition
  statement, and `src/throttling/presentation/client-address.policy.ts` for FR5a's pure-function
  bootstrap replacement.
- `.specify/gates/run-gates.sh` is not executable after bootstrap. Run it as
  `bash .specify/gates/run-gates.sh` unless the bit is restored.

## Validation

- Green: `npm run test:unit`.
- Green: `npm run test:integration` against local DynamoDB.
- Green: `npm run test:e2e` against local DynamoDB.
- Green: `npm run lint`.
- Green: `npm run build`.
- Green: `bash .specify/gates/run-gates.sh`.

## Deferred ideas / todos

- Nothing outstanding for 002. The temporary `CODEX_HANDOFF.md` has been removed.
