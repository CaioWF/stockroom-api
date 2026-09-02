---
name: observability-and-instrumentation
description: Use while implementing a feature that has retries, queues, background jobs, external calls, or any critical path an on-call engineer will need to reason about in production. Invoke when adding a new endpoint, dependency, or async flow, and before considering such a feature done — instrumentation is developed alongside the code, like tests, not bolted on after.
---

# observability-and-instrumentation

## Overview

Code you can't observe is code you can't operate. Instrumentation is foundational engineering work, written alongside the feature the same way tests are — not polish added later. This skill is an implementation-time convention lens: `implement-feature` applies it while coding a critical path, and the Definition-of-Done checks it before finish.

Adapted from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) `observability-and-instrumentation` (MIT, © 2025 Addy Osmani).

## When to use

Apply when the changed code has a production surface an operator must reason about: a new endpoint, an external/network call, a retry or queue or background job, a state machine, a payment or auth path. **Skip** for pure computation, internal helpers, and code with no runtime operational surface.

## The discipline

1. **Define the questions before instrumenting.** Name the 2–4 concrete questions an on-call engineer will ask about this feature at 3am ("is the webhook backing up?", "which tenant is erroring?"). Every signal you add must answer one of them — otherwise it is noise you'll pay to store and scroll past.

2. **Match the signal to the question.**
   - **Structured logs** answer *"why did this specific case happen?"* — one event, full context.
   - **Metrics** answer *"how often / how fast, in aggregate?"*
   - **Traces** answer *"where did the time go across services?"*

3. **Never log secrets, tokens, passwords, or full PII.** Telemetry is a classic data-leak vector. Allow-list the fields you log; never dump whole request bodies. (Mirrors the house allow-list-not-deny-list rule.)

4. **Alert on symptoms users feel, not infrastructure causes.** Page on error rate > 1% or p99 latency spikes — not CPU at 85%. Cause-based alerts fire constantly and still miss the failures you didn't predict.

See `observability-checklist.md` (sibling companion) for the concrete signal set (structured JSON events, RED metrics, latency histograms, bounded labels, OpenTelemetry tracing, test-firing an alert).

## Red Flags

- **Ship-blind** — a feature with retries, queues, or external calls merged with **zero** new telemetry. Highest-risk case for production blindness.
- **Noise generation** — signals that answer no named on-call question. More dashboards ≠ more observability.
- **Averages for latency** — report p95/p99 histograms, never the mean (it hides the tail users feel).
- **Unbounded labels** — user IDs or raw URLs as metric labels; cardinality explosion.
- **Cause-based paging** — alerting on CPU/memory instead of user-visible symptoms.
