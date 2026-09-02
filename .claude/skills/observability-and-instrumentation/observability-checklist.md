# Observability checklist — observability-and-instrumentation companion

The concrete signal set the skill's discipline expands into. Consult it when instrumenting
a critical path; every item traces back to one of the 2–4 named on-call questions. Not a
mechanical gate — judgment applies: instrument what an operator will actually need, skip
the rest.

Adapted from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)
`references/observability-checklist.md` (MIT, © 2025 Addy Osmani).

## On-call questions (foundation)
- Write down 2–4 questions on-call will ask about this feature.
- Map every signal to one of them. Metrics say *that* something's wrong; traces show *where*; logs explain *why*.

## Structured logging
- JSON logs with stable event names (not free-form strings).
- Correlation/request ID on every line; propagate it across outbound calls and async boundaries.
- Levels: `error` = broken invariant, `warn` = degraded-but-handled, `info` = business event, `debug` = prod-disabled.
- No secrets/tokens/passwords/un-redacted PII. Allow-list fields; never log full request/response bodies or auth headers.
- For external calls, log endpoint, status, latency, attempt count, sanitized identifiers only.
- Verify the actual output shows structured fields correctly.

## Metrics
- RED (Rate, Errors, Duration) for every endpoint and external dependency.
- USE (Utilization, Saturation, Errors) for every resource (queues, pools, hosts).
- Latency as a histogram with p50/p95/p99 — never the mean.
- Bounded labels only (route template, status class, provider). Never user/tenant IDs, emails, raw URLs, request IDs, error text.
- Group status codes by class (`5xx`, not each code). Track queue depth + processing duration for workers.

## Distributed tracing
- Init OpenTelemetry at startup, before other imports; auto-instrument HTTP/gRPC/DB clients.
- Propagate context with W3C `traceparent`/`tracestate`; preserve across async boundaries via message metadata.
- Manual spans only for meaningful work units, with on-call-relevant attributes; no secrets/PII in span attributes.
- Head-based sampling at a low default; retain 100% of errors when tail sampling is available.

## Alerting
- Alert on symptoms (error rate, p99 latency, queue age); reserve dashboards for causes.
- Every alert actionable and linked to a runbook (meaning, initial query, escalation). No self-healing alerts.
- Justify thresholds with SLOs/historical data. Two severities only: **page** (user-facing, immediate) / **ticket** (degradation, weekly).
- Test-fire each new alert to confirm delivery + runbook link.

## Dashboards
- Service-health dashboard: error rate, p99 latency, traffic, saturation. Dependency panel: per-service error rate + latency.
- Design to answer the on-call questions. Default time range 1–6h, not 30 days.

## Verify the telemetry
- Trigger an error in staging → find it via correlation ID. Send test traffic → confirm metric series + labels.
- Trace one request end-to-end with no broken spans. Diagnose an induced failure using telemetry alone, no source reading.

## Pre-launch gate
- Structured logs reaching the aggregator · RED metrics on dashboards for every new endpoint/dependency · ≥1 symptom-based alert with runbook + test · request tracing across every service touched · on-call knows where the runbook is.
