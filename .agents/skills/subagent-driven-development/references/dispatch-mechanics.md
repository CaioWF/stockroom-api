# Dispatch mechanics (subagent-driven-development)

Full detail for constructing reviewer prompts, handing artifacts as files, and
keeping durable progress. The `SKILL.md` body carries the non-negotiables; read
this before your first dispatch for the complete rules and rationale.

## Contents

- Constructing Reviewer Prompts — what a task-scoped review gate must carry
- File Handoffs — brief/report by path, and the size gate for inlining
- Durable Progress — the `progress.md` ledger

## Constructing Reviewer Prompts

Per-task reviews are task-scoped gates. The broad review happens once, at the
final whole-branch review. When you fill a reviewer template:

- Do not add open-ended directives like "check all uses" or "run race tests
  if useful" without a concrete, task-specific reason
- Do not ask a reviewer to re-run tests the implementer already ran on the
  same code — the implementer's report carries the test evidence
- Do not pre-judge findings for the reviewer — never instruct a reviewer to
  ignore or not flag a specific issue. If you believe a finding would be a
  false positive, let the reviewer raise it and adjudicate it in the review
  loop. If the prompt you are writing contains "do not flag," "don't treat X
  as a defect," "at most Minor," or "the plan chose" — stop: you are
  pre-judging, usually to spare yourself a review loop.
- The global-constraints block you hand the reviewer is its attention
  lens. Copy the binding requirements verbatim from the plan's Global
  Constraints section or the spec: exact values, exact formats, and the
  stated relationships between components ("same layout as X", "matches
  Y"). The reviewer's template already carries the process rules (YAGNI,
  test hygiene, review method) — the constraints block is for what THIS
  project's spec demands.
- Hand the reviewer its diff as a file: `git diff BASE_TREE HEAD_TREE >
  <unique-path>` (BASE_TREE/HEAD_TREE are the `write-tree` SHAs from this
  task, not commit SHAs), plus `git diff --stat BASE_TREE HEAD_TREE` for the
  summary, both redirected into one uniquely named file. The output never
  enters your own context, and the reviewer sees the stat summary and full
  diff with context in one Read call.
- A dispatch prompt describes one task, not the session's history. Do not
  paste accumulated prior-task summaries ("state after Tasks 1-3") into
  later dispatches — a real session's dispatch hit 42k chars of which 99%
  was pasted history. A fresh subagent needs its task, the interfaces it
  touches, and the global constraints. Nothing else.
- Dispatch fix subagents for Critical and Important findings. Record Minor
  findings in the progress ledger as you go, and point the final
  whole-branch review at that list so it can triage which must be fixed
  before merge. A roll-up nobody reads is a silent discard.
- A finding labeled plan-mandated — or any finding that conflicts with
  what the plan's text requires — is the human's decision, like any plan
  contradiction: present the finding and the plan text, ask which governs.
  Do not dismiss the finding because the plan mandates it, and do not
  dispatch a fix that contradicts the plan without asking.
- The final whole-branch review gets a package too: `git diff
  MILESTONE_START_TREE LAST_TASK_TREE` (MILESTONE_START_TREE = the snapshot
  taken before Task 1) into one file, so the final reviewer reads one diff
  instead of re-deriving the milestone's full change set with git commands.
- Every fix dispatch carries the implementer contract: the fix subagent
  re-runs the tests covering its change and reports the results. Name the
  covering test files in the dispatch — a one-line fix does not need the
  whole suite. Before re-dispatching the reviewer, confirm the fix report
  contains the covering tests, the command run, and the output; dispatch
  the re-review once all three are present.
- If the final whole-branch review returns findings, dispatch ONE fix
  subagent with the complete findings list — not one fixer per finding.
  Per-finding fixers each rebuild context and re-run suites; a real
  session's final-review fix wave cost more than all its tasks combined.

## File Handoffs

Everything you paste into a dispatch prompt — and everything a subagent
prints back — stays resident in your context for the rest of the session
and is re-read on every later turn. Hand artifacts over as files.

**Where these files live — NOT the tracked tree.** Briefs, reports, diff
packages, and the progress ledger are ephemeral scaffolding, not feature
deliverables; writing them under `specs/` clutters the working tree and sweeps
them into the feature commit. Put them under the repo's git dir instead:
`$(git rev-parse --git-common-dir)/sdd/<feature>/` — i.e. `.git/sdd/<feature>/`
in the main worktree. Resolving the *common* dir (not `--git-dir`) keeps the
path shared across dispatch-parallel worktrees, so the controller and every
isolated implementer read and write one location. Nothing there is ever tracked
or committed — zero working-tree clutter — and `finishing-a-development-branch`
sweeps the dir at cycle end.

Hand artifacts over as files:

- **Size gate for the brief.** The file handoff earns its round-trip only when
  the brief is bulky. A short brief — a few lines, no exact-value tables — costs
  less pasted inline than written-then-read, so paste it directly in the
  dispatch prompt and skip the file. Reserve the brief file for tasks carrying
  exact values to reproduce verbatim (signatures, magic strings, test cases) or
  long requirement lists. **Reports always go to a file** regardless of size —
  implementer output is unbounded and would otherwise land in your context in
  full.
- **Task brief:** before dispatching an implementer, extract the task's full
  text from the plan into a uniquely named file (e.g.
  `.git/sdd/<feature>/task-N-brief.md`). Compose the dispatch so the brief
  stays the single source of requirements. Your dispatch should contain:
  (1) one line on where this task fits in the project; (2) the brief path,
  introduced as "read this first — it is your requirements, with the exact
  values to use verbatim"; (3) interfaces and decisions from earlier tasks
  that the brief cannot know; (4) your resolution of any ambiguity you
  noticed in the brief; (5) the report-file path and report contract; (6)
  the explicit instruction that the subagent must NOT run git or commit —
  implement, test, report only. Exact values (numbers, magic strings,
  signatures, test cases) appear only in the brief.
- **Report file:** name the implementer's report file after the brief
  (brief `…/task-N-brief.md` → report `…/task-N-report.md`) and put it in
  the dispatch prompt. The implementer writes the full report there and
  returns only status, files changed, a one-line test summary, and concerns
  — never commits, since there is nothing to commit to.
- **Reviewer inputs:** the task reviewer gets three paths — the same brief
  file, the report file, and the tree-diff package — plus the global
  constraints that bind the task.
- Fix dispatches append their fix report (with test results) to the same
  report file and return a short summary; re-reviews read the updated file.

## Durable Progress

Conversation memory does not survive compaction. In real sessions,
controllers that lost their place have re-dispatched entire completed task
sequences — the single most expensive failure observed. Track progress in
a ledger file, not only in todos.

- At skill start, check for a ledger, e.g.
  `.git/sdd/<feature>/progress.md`. Tasks listed there as complete are
  DONE — do not re-dispatch them; resume at the first task not marked
  complete.
- When a task's review comes back clean, append one line to the ledger in
  the same message as your other bookkeeping:
  `Task N: complete (tree <base7>..<head7>, review clean)` — using the
  `write-tree` SHAs, since there are no commits to cite.
- The ledger is your recovery map: the tree SHAs it names are real git
  objects even when your context no longer remembers creating them. After
  compaction, trust the ledger over your own recollection (tree objects are
  not reachable from refs, so they can be garbage-collected — treat the
  ledger as a record of what happened, not as a guaranteed-retrievable
  blob store).
