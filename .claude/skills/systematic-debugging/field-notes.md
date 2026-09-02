# Field notes — systematic debugging

Tail material for `systematic-debugging`: a phase summary table, the terminal case where
investigation finds no root cause, and the upstream project's reported outcomes. None of it
changes what you do during a debugging session, so it stays out of `SKILL.md` and loads only
when you want it.

The parts that *do* change behavior — the Iron Law, the four phases, Red Flags, and the
rationalization table — stay in the skill body on purpose. They work by being in context
before you start rationalizing, which a file you have to decide to open cannot do.

## Contents

- Phase summary table
- When the process reveals "no root cause"
- Reported outcomes (upstream)

## Phase summary table

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| **1. Root Cause** | Read errors, reproduce, check changes, gather evidence | Understand WHAT and WHY |
| **2. Pattern** | Find working examples, compare | Identify differences |
| **3. Hypothesis** | Form theory, test minimally | Confirmed or new hypothesis |
| **4. Implementation** | Create test, fix, verify | Bug resolved, tests pass |

## When the process reveals "no root cause"

If systematic investigation reveals the issue is truly environmental, timing-dependent, or
external:

1. You've completed the process
2. Document what you investigated
3. Implement appropriate handling (retry, timeout, error message)
4. Add monitoring/logging for future investigation

**But:** most "no root cause" cases are incomplete investigation. Spend the doubt on your own
coverage before spending it on the environment.

## Reported outcomes (upstream)

From the upstream project's debugging sessions, as originally written down:

- Systematic approach: 15-30 minutes to fix; random fixes: 2-3 hours of thrashing
- First-time fix rate: 95% vs 40%

These numbers are self-reported by the skill's original author and were never measured in
keel. They are the reason the technique got written down, not a benchmark to hold yourself to.
