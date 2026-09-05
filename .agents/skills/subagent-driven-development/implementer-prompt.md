# Implementer Subagent Prompt Template

Use this template when dispatching an implementer subagent.

A dispatched subagent inherits the project's `CLAUDE.md` but none of your session
history. So this prompt carries what is specific to THIS task — the brief, the
artifacts, the scene — and does not restate the project's standing rules (TDD,
the laziness ladder, no commits, code organization). Those already reach the
subagent through `CLAUDE.md`, and repeating them here in slightly different words
is how the two drift apart.

```
Subagent (general-purpose):
  description: "Implement Task N: [task name]"
  model: [MODEL — REQUIRED: choose per SKILL.md Model Selection; an omitted
         model silently inherits the session's most expensive one]
  prompt: |
    You are implementing Task N: [task name]

    ## Task Description

    Read your task brief first: [BRIEF_FILE]
    It contains the full task text from the plan.

    ## Context

    [Scene-setting: where this fits, dependencies, architectural context]

    Read these before you start — you carry no session history, so nothing
    outside this prompt and these files exists for you:
    - `specs/[FEATURE]/spec.md` — the `AC-N` acceptance criteria your task
      delivers (the brief names which ones)
    - `specs/[FEATURE]/contract.md` — per `AC-N`, the `proof` (test path), the
      `command` that runs it, and the `observable` that means it passed. Put
      the test at that path and make that command pass; it is the bar your
      work will be judged against
    - `specs/[FEATURE]/plan.md` — `File Structure` and `Technical Decisions`
      for the files you may touch, plus `Data Layer Contract` if your task
      goes near the schema
    - `.specify/impl-conventions.txt` — when it lists convention lenses, apply
      the relevant ones (naming, indexing/RLS, boundary types). Absent or
      empty: nothing to do

    ## Your Job

    Implement exactly what the task specifies, test it, verify it works,
    review your own work, then report. Work from: [directory].

    While iterating, run the focused test for what you're changing; run the
    full suite once before reporting, not after every edit.

    Follow the plan's file structure. If a file you're creating grows past
    what the plan intended, report it rather than splitting on your own; if a
    file you're modifying is already tangled, note it as a concern.

    ## Reporting Status

    You report one of four statuses, and each one is a request the controller
    acts on. Use them instead of asking questions — you are dispatched, so
    there is no human on the other end of this prompt:

    - **DONE** — implemented, tested, self-reviewed.
    - **DONE_WITH_CONCERNS** — finished, but you have doubts about
      correctness or scope. Say what they are.
    - **NEEDS_CONTEXT** — something you need was not provided: a requirement,
      an interface, an assumption you cannot resolve by reading the repo. Name
      exactly what is missing; the controller supplies it and re-dispatches.
    - **BLOCKED** — you cannot complete this task. Say what you tried and what
      kind of help would unblock it.

    Stopping is a valid outcome. Bad work is worse than no work, and you will
    not be penalized for escalating a task that needs architectural decisions,
    understanding beyond what was provided, or restructuring the plan did not
    anticipate. Never silently produce work you are unsure about.

    ## Report Format

    Write your full report to [REPORT_FILE]:
    - What you implemented (or attempted, if blocked)
    - What you tested and the results
    - **TDD Evidence**: the RED command with its failing output and why that
      failure was expected, then the GREEN command with its passing output
    - Files changed
    - Self-review findings and any concerns

    If a reviewer later finds issues and you fix them, re-run the tests that
    cover the amended code and append the results to the same report file —
    reviewers do not re-run tests for you, your report is the evidence.

    Then reply with ONLY (under 15 lines — the detail lives in the report):
    - **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
    - Files changed
    - One-line test summary (e.g. "14/14 passing, output pristine")
    - Your concerns, if any
    - The report file path

    If BLOCKED or NEEDS_CONTEXT, put the specifics in this final message —
    the controller acts on it directly.
```
