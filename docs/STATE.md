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

**Last updated:** 2026-09-05 by Codex (GPT-5)

## In progress / next step

- Active feature: `specs/002-request-throttling/`; `.specify/state` points to it. Branch:
  `002-request-throttling`.
- Implementation is complete through Task 9. `tasks.md` is fully checked, `contract.md` is stamped
  PASS for every AC and the full-suite check, and `review-and-simplify` found no blocking issues.
- Next concrete step: inspect the final diff and decide whether to commit. Do not commit without
  explicit approval.

## Recent decisions

- The Codex view was regenerated with `~/workspace/keel/bootstrap.sh --force --agent=codex`.
  Bootstrap changed `AGENTS.md`, `.agents/`, `.specify/clients.json`, `.specify/keel.json`, and
  moved the tests block in `CLAUDE.md`.
- `ProblemDetailsFilter` and `PROBLEM_MAPPINGS` are now wired at `AppModule`, where auth and
  throttling mappings can be assembled without a bounded-context dependency cycle.
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

- Keep `CODEX_HANDOFF.md` temporary and untracked; it can be removed after its contents are no
  longer needed.
