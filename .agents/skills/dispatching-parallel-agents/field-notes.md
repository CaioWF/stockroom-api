# Field notes — parallel dispatch

Session anecdotes and outcome claims for `dispatching-parallel-agents`. Inherited from the
skill's upstream source (superpowers), so the numbers describe *that* project's sessions, not
keel's. Kept out of `SKILL.md` because none of it changes what you do — it is illustration,
and illustration does not need to sit in context on every dispatch.

## Worked example: 6 failures, 3 agents

**Scenario:** 6 test failures across 3 files after major refactoring

**Failures:**
- agent-tool-abort.test.ts: 3 failures (timing issues)
- batch-completion-behavior.test.ts: 2 failures (tools not executing)
- tool-approval-race-conditions.test.ts: 1 failure (execution count = 0)

**Decision:** Independent domains — abort logic separate from batch completion separate from
race conditions

**Dispatch:**
```
Agent 1 → Fix agent-tool-abort.test.ts
Agent 2 → Fix batch-completion-behavior.test.ts
Agent 3 → Fix tool-approval-race-conditions.test.ts
```

**Results:**
- Agent 1: Replaced timeouts with event-based waiting
- Agent 2: Fixed event structure bug (threadId in wrong place)
- Agent 3: Added wait for async tool execution to complete

**Integration:** All fixes independent, no conflicts, full suite green

The shape is the point: three failures that shared no state, so three briefs that shared no
files. When the partition is not that clean, see the scope-disjointness rules in
`subagent-driven-development` instead.

## Reported outcomes

From the upstream project's own debugging session:

- 6 failures across 3 files, 3 agents dispatched, all investigations concurrent, zero conflicts
- Claimed benefits: parallelization, narrower per-agent scope, no interference, wall-clock speed

These are self-reported and unmeasured. Treat them as the reason the technique was written
down, not as a benchmark to expect.
