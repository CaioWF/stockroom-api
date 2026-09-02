---
name: perf-review
description: Performance lens over a feature's changed code — read-only. Appended to review-and-simplify's lens registry by the ui-review pack. Also usable standalone.
---

# perf-review

When: dispatched by `review-and-simplify` as one of its parallel lenses, on the feature's diff, in projects where the `ui-review` pack is installed. Also usable standalone for a focused performance pass.

Scope: the changed code only — the feature's tree-snapshot diff (`git diff BASE_TREE HEAD_TREE`, per `subagent-driven-development`'s no-commit-rule snapshotting) or, if no snapshots exist, the working tree diff. Never the whole repo. If the diff has no plausible performance surface, report "no perf-relevant changes" and stop — do not manufacture findings.

Output: findings by severity (Critical/Important/Minor) with `file:line`, reported inline. Makes NO edits.

## Calibration

Flag real, likely-hot regressions the changed code introduces — not micro-optimizations with no measurable impact. Premature optimization is itself a finding-worthy smell; call it out rather than rewarding it.

- **Data / backend:** N+1 queries; missing index on a new hot query path; unbounded result sets / missing pagination; work inside a loop that belongs outside it; sync/blocking IO on a request path; missing caching on an expensive, cache-safe computation.
- **Frontend rendering:** unnecessary re-renders (new object/array/function identity passed as props each render; missing memo where a measured hot path warrants it); expensive work in render instead of an effect/worker; large lists without virtualization.
- **Assets / bundle:** a heavy dependency pulled in for a trivial use; a non-code-split large module on a critical path; unoptimized images/media on the changed screen; blocking scripts.
- **Algorithmic:** an accidental O(n²) (nested scans over the same collection) where the input can grow; repeated recomputation of a stable value.

Weigh cost against likelihood and hotness: an N+1 on a per-request endpoint is Critical; a redundant `.map` over a 3-element constant is not a finding. Do not duplicate what a bundler/profiler gate already measures — this lens is for the judgment those tools don't make (is this path *actually* hot? does this abstraction *earn* its cost?).

When a finding needs a concrete threshold (Core Web Vitals target, bundle size, p95, font/image tactic), cite `performance-budgets.md` (sibling companion) rather than inventing a number — it carries the numeric budgets and remediation tactics this lens references.

Next: findings return to `review-and-simplify`, which aggregates them with the other lenses; Critical/Important must be fixed before the pre-commit gate.
