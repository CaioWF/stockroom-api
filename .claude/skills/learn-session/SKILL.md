---
name: learn-session
description: Use at the end of a session or feature — from `handoff` (pause), from `finishing-a-development-branch`, or on request — to distill what was learned about the project into its living docs. Routes environment/test/convention facts into CLAUDE.md marker blocks and traps into docs/gotchas.md, proposing the diff and waiting for approval.
---

# learn-session

When: a work session is ending, a feature is being closed, or the user asks to capture what was learned. Not mid-task — the point is hindsight over a finished stretch of work.

Why it exists: a project's operating knowledge is discovered by doing (the exact command that starts the stack, the env var nobody documented, the test that only passes after a seed, the trap that cost an hour). Today it dies with the transcript, so the next cold session re-derives it. `CLAUDE.md` written once at bootstrap goes stale the same week. This skill is the loop that keeps it true.

The boundary with `handoff`: STATE.md is **volatile** — where we stopped, what is blocked, what comes next. This skill captures the **durable** — what will still be true next week, for a different task, for someone who was not here.

## Step 1 — Harvest

Re-read the session for facts the project did not have written down. Sources: commands actually run and what they did, failures and what fixed them, decisions applied while coding, files that turned out to matter.

Apply the durability test to each candidate, and drop it when the answer is no:

> Will this still be true next week, on a different task, for someone who was not here?

Also drop: anything already written in `CLAUDE.md`, the constitution, or `docs/gotchas.md` (check before proposing — restating an existing rule in new words creates two sources for one instruction); anything specific to the feature under way (that is `spec.md` / STATE); one-off exploration; anything you inferred but did not observe.

## Step 2 — Classify and route

| Category | Goes to | Why there |
|---|---|---|
| Environment — start/stop, env vars, ports, seeded credentials, fixtures | `CLAUDE.md`, block `keel:environment` | needed on turn one of every session |
| Tests — how to run them, which suite covers what, what "green" means | `CLAUDE.md`, block `keel:tests` | needed before the first edit |
| Conventions — objective patterns this repo follows | `CLAUDE.md`, block `keel:conventions` | applied while writing code |
| Gotchas — traps, confusing failure modes, workarounds | `docs/gotchas.md` | looked up when hit, not needed every turn |
| Pointers — where a subject is documented | frontmatter on the target doc | the `okf-index` hook already maps concepts at SessionStart |

The split is deliberate. `CLAUDE.md` is loaded in full on every turn, so only what is needed *before* work starts belongs there. Everything else is retrieved on demand.

For a pointer, do not maintain a link list: give the target doc `type:`, `title:`, and a one-sentence `description:`, and it appears in the SessionStart concept map by itself. An external URL worth keeping goes in the `docs/gotchas.md` entry that needs it.

## Step 3 — Write the proposal

Never write to `CLAUDE.md` or `docs/gotchas.md` before showing the diff. Present each candidate as the exact line(s) you would add, grouped by target file, and say what you dropped and why. Wait for approval.

Rules for the lines themselves:

- The exact command, not a description of it: `pnpm test -- --run auth`, not "run the auth tests".
- Add the prohibition when a wrong path exists: "do not run `next dev` directly — use `./scripts/init.sh`".
- One fact per line. No preamble, no summary of the session, no "as we discovered today".
- Sharpen rather than append: when a line already covers the subject and is now wrong or vague, replace it.
- The project's `## Prose` rule applies — plain statements, no throat-clearing, no borrowed vocabulary.
- A `CLAUDE.md` block that grows past roughly 15 lines is a signal to move detail into `docs/` and leave a pointer.

## Step 4 — Apply

`CLAUDE.md`: write inside the block's markers, creating the block if absent.

```
<!-- BEGIN:keel:tests -->
- unit + integration: `pnpm test`
- one suite: `pnpm test -- --run <name>`
- green means: exit 0 and no skipped suite
<!-- END:keel:tests -->
```

Block discipline: never nest blocks; never move keel's core body inside one; never hand-edit a block a pack owns (`stack-conventions` and friends re-render theirs on every install). `bootstrap.sh --force` refreshes the body around the blocks and carries the blocks across, which is what makes the learned content survive a keel upgrade.

`docs/gotchas.md`: create it on first use as an Open Knowledge Format concept, one `##` per trap, symptom → cause → what to do, linked to the commit or issue when there is one.

```markdown
---
type: gotchas
title: Gotchas
description: Traps in this repo and the way past each one.
---
```

After touching anything under `docs/`, refresh the concept index so the freshness gate stays green:

```bash
.specify/gates/okf-build-index.mjs build docs
```

## Step 5 — Stop

Report what was written and what was dropped. Do not commit — the project's commit rule owns that, and these edits ride along with the feature's commit.

## Red flags

Never: write before the user approves the diff · restate what `CLAUDE.md` already says · record a fact about the current feature (that is STATE or the spec) · invent a command you did not run · edit a pack-owned block · let a block grow into a manual · commit on your own.
