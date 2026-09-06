---
name: finishing-a-development-branch
description: Use when implementation is complete, gates pass, and you need to decide how to integrate the work — presents structured options (merge, PR, keep, discard) and handles the chosen workflow, including worktree cleanup. Closes the SDD cycle after review-and-simplify.
---

# Finishing a Development Branch

## Overview

Guide completion of development work by presenting clear options and handling the chosen workflow.

**Core principle:** Verify gates → detect environment → present options → execute choice → clean up.

Runs after `review-and-simplify` and the commit(s) the user approved. Do not commit or push on your own beyond what the chosen option requires; never force-push without an explicit request.

## Step 1 — Verify gates

Run the project's quality gates before offering options:

```bash
.specify/gates/run-gates.sh
```

If they fail: report the failures and stop — cannot proceed with merge/PR until green. If they pass: run the `definition-of-done.md` checklist (sibling companion) — it covers what gates cannot mechanically check (runtime-verified behavior, docs, backward compat, rollback path, observability on new critical paths). Fix or explicitly flag any unmet item to the human, then continue.

## Step 2 — Detect environment

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
```

| State | Menu | Cleanup |
|---|---|---|
| `GIT_DIR == GIT_COMMON` (normal repo) | 4 options | no worktree |
| `GIT_DIR != GIT_COMMON`, named branch | 4 options | provenance-based (Step 5) |
| `GIT_DIR != GIT_COMMON`, detached HEAD | 3 options (no merge) | no cleanup (externally managed) |

## Step 3 — Determine base branch

```bash
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

Or ask: "This branch split from main — correct?"

## Step 4 — Present options (concise, no explanation)

Normal repo / named-branch worktree:
```
Implementation complete. What would you like to do?
1. Merge back to <base> locally
2. Push and create a Pull Request
3. Keep the branch as-is (handle it later)
4. Discard this work
```

Detached HEAD (3 options): push as new branch + PR · keep as-is · discard.

## Step 5 — Execute

**1. Merge locally** — `cd` to main repo root; `git checkout <base> && git pull && git merge <feature>`; re-run gates on the result; then cleanup worktree (Step 6); then `git branch -d <feature>`.

**2. Create PR** — `git push -u origin <feature>`. Do NOT clean up the worktree — the user needs it alive to iterate on PR feedback.

**3. Keep as-is** — report "Keeping branch <name>. Worktree preserved at <path>." No cleanup.

**4. Discard** — confirm first, require the typed word `discard`. Then `cd` to main root, cleanup worktree (Step 6), `git branch -D <feature>`.

## Step 6 — Cleanup workspace (Options 1 & 4 only)

```bash
WORKTREE_PATH=$(git rev-parse --show-toplevel)
```

- `GIT_DIR == GIT_COMMON` → normal repo, nothing to clean up.
- Worktree path under `.worktrees/` or `worktrees/` → created by `using-git-worktrees`; we own cleanup:
  ```bash
  MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
  cd "$MAIN_ROOT"
  git worktree remove "$WORKTREE_PATH"
  git worktree prune
  ```
- Otherwise the host/keel owns the workspace — do NOT remove it.

**SDD dispatch artifacts.** If `subagent-driven-development` ran, it left the
feature's ephemeral briefs/reports/diffs/ledger under the git dir (see its
File Handoffs). Sweep them for Options 1 & 4 only (Keep/PR may still iterate):

```bash
rm -rf "$(git rev-parse --git-common-dir)/sdd/<active-feature>"
```

Nothing there is tracked, so this frees scratch space without touching the
commit. dispatch-parallel's per-implementer worktrees are harness-managed
(`isolation: "worktree"`) and auto-cleaned — do not `git worktree remove` them.

## Step 7 — Capture what the feature taught (Options 1, 2 & 3)

A finished feature is where the project's operating knowledge is freshest: the command that brings the stack up, the suite that had to be seeded first, the trap that cost an hour. Run `learn-session` — it proposes the lines for `CLAUDE.md`'s marker blocks and `docs/gotchas.md` and waits for approval. Skip it for Option 4: discarded work taught the repo nothing durable.

## Quick reference

| Option | Merge | Push | Keep worktree | Delete branch |
|---|---|---|---|---|
| 1. Merge locally | yes | - | - | yes |
| 2. Create PR | - | yes | yes | - |
| 3. Keep as-is | - | - | yes | - |
| 4. Discard | - | - | - | yes (force) |

## Red Flags

Never: proceed with failing gates · merge without re-verifying on the result · delete work without typed confirmation · force-push unprompted · remove a worktree before confirming merge success · clean up a worktree you didn't create · run `git worktree remove` from inside the worktree.

Always: verify gates first · detect environment before the menu · exactly 4 options (3 for detached HEAD) · typed `discard` for Option 4 · cleanup only for Options 1 & 4 · `cd` to main root before removal · `git worktree prune` after.
