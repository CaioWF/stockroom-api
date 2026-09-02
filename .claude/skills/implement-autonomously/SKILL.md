---
name: implement-autonomously
description: Opt-in autonomous driver for the implementation loop — runs implement-and-evaluate to completion without human check-ins, under a global iteration budget and a stall guard, escalating with a diagnosis instead of running away. Use when a human wants the active feature built end-to-end unattended.
---

# implement-autonomously

When: same preconditions as `implement-and-evaluate` — analyze reported clean and
`spec.md` + `plan.md` both carry `status: approved` — AND the human explicitly opted
into unattended execution for this feature. This is the **goal-loop envelope**: it
invokes `implement-and-evaluate` and lets it run to completion without pausing to
check in. If the human wants to drive task-by-task, use `implement-and-evaluate`
directly instead; this skill is the opt-in autonomous variant, not the default.

Template: none — this skill orchestrates `implement-and-evaluate`, it does not fill a
template-based artifact.

Output: the same as `implement-and-evaluate` (a gate-green feature, every `tasks.md`
checkbox ticked, every `Acceptance Criteria` scenario PASS) — OR, on budget/stall
exhaustion, a stop with `.git/sdd/<feature>/loop-report.md` written and the blocker
surfaced to the human. Never a silent runaway.

Rationale and the loop-engineering framing (why keel's loop is already a goal loop,
what the three gaps are, why the driver is in-session) live in the design-note
docs/design-notes/autonomous-implementation-loop.md — read it before changing this skill.

## The loop contract (definition of done)

Done is machine-checkable, every line an exit code — the loop cannot know when to stop
otherwise:

- every top-level checkbox in `specs/<active-feature>/tasks.md` is ticked, AND
- every `Acceptance Criteria` scenario in `spec.md` reports PASS from `evaluator`, AND
- `.specify/gates/run-gates.sh` exits 0.

When all three hold, the loop stops with success. Nothing else counts as done — do not
stop on "looks complete" or "probably fine".

## Autonomy contract

**May do unattended** (the whole point of the mode): edit files within the active
feature's scope, run tests, run `.specify/gates/run-gates.sh`, dispatch
implementer/evaluator/fix/reviewer subagents, take `git write-tree` snapshots, update
the ledger.

**Must stop and get a human** (autonomy budget ≠ approval budget):

- **Commit** — never. The No-Commit Rule stands: commits happen only at a milestone
  with explicit human approval (see `subagent-driven-development`). The loop finishing
  is NOT permission to commit.
- **Destructive command** — never run `rm -rf`, `git push --force`, `git reset --hard`,
  a DB drop, or a prod deploy unattended. Stop and ask. The `destructive-guard`
  PreToolUse hook (`core/claude/hooks/destructive-guard.mjs`) now enforces this
  mechanically — it blocks the worst families and turns the rest into an `ask`, so an
  unattended loop cannot silently run one — but treat the rule as hard regardless; do
  not lean on the guard to catch a command you should not have issued.
- **Plan is wrong** — if implementation reveals the plan itself is wrong (not just a
  task), escalate to the human; do not rewrite the plan autonomously.
- **Budget or stall exhausted** — see below.

## Budget and stall guard

The bounded-retry-with-escalation that `implement-and-evaluate` already has is
per-scenario (same scenario fails 3× → stop). This envelope adds the two **global**
stops that make unattended execution safe against runaway iteration and cost blowup:

1. **Iteration budget.** Count one iteration per task-execute → evaluate → fix cycle.
   Cap = env `KEEL_LOOP_MAX_ITERATIONS` (default 10). On reaching the cap, stop.
2. **Stall guard.** Track the count of ticked `tasks.md` checkboxes and the set of
   failing scenarios. If 3 consecutive iterations neither tick a new checkbox nor clear
   a failing scenario, the loop is not making progress — stop. (This complements the
   per-scenario 3-strikes: that catches one stuck scenario; this catches a loop that is
   busy but not advancing.)

Keep the running counts in the ledger (`.git/sdd/<feature>/progress.md`) so they
survive compaction — state in the transcript is lost on the first compaction.

## Steps

1. Resolve the active feature from `.specify/state` (fallback: newest dir under
   `specs/`). Read the ledger `.git/sdd/<feature>/progress.md` if it exists — trust it,
   never re-do a task it marks complete (resume-safe after compaction).
2. State the loop contract (the three exit-code conditions above) and the budget
   (`KEEL_LOOP_MAX_ITERATIONS`) once, so the finish line is explicit.
3. Invoke `implement-and-evaluate` and let it run **continuously** — do not pause to
   check in between tasks, do not emit "should I continue?" prompts or progress
   summaries. After each of its iterations, update the ledger counts and check the two
   global stops from Budget and stall guard.
4. **Stop on any of:** the loop contract is fully satisfied (success); the iteration
   budget is reached; the stall guard trips; or the autonomy contract forces a
   checkpoint (destructive command, plan-wrong, or `implement-and-evaluate`'s own
   step-3 blocker).
5. **On non-success stop**, write `.git/sdd/<feature>/loop-report.md` with: iterations
   spent vs. cap, tasks done vs. remaining, the last failing scenario and its
   `evaluator` output, the last `fix-runner` diagnosis, and the reason for stopping.
   Then surface the blocker to the human — a retry without a diagnosis is an
   anti-pattern.
6. Do not commit. Accumulate changes; the commit happens later, once `review-and-simplify`
   and the human both sign off.

Next: review-and-simplify.
