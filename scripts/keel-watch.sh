#!/usr/bin/env bash
# Human-side visibility for parallel work: a status pane plus one shell pane per
# extra worktree, so several developments can be watched at once.
#
# Read-only. It renders what the repo already exposes — dispatch artifacts under
# the git dir, task checkboxes, worktrees — and starts no agents. Parallel
# implementers are dispatched by the harness (isolation: "worktree"), so there is
# no keel-owned process to tail; what is observable is state, not a log stream.
#
# Without tmux (or with --no-tmux) it falls back to the status renderer in the
# current terminal, which is the same information in one pane.
#
# Usage: bash scripts/keel-watch.sh [--dir <path>] [--interval <seconds>] [--no-tmux]
set -euo pipefail
SELF="$(cd "$(dirname "$0")" && pwd)"
DIR="$PWD"; INTERVAL=5; USE_TMUX=1; ONCE=0; MAX_PANES=3
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR="$2"; shift 2 ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    --no-tmux) USE_TMUX=0; shift ;;
    --once) ONCE=1; USE_TMUX=0; shift ;;   # print the status once and exit (scripts, CI, a quick look)
    *) echo "[keel:watch] unknown arg: $1" >&2; exit 2 ;;
  esac
done

ROOT="$(git -C "$DIR" rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$ROOT" ] || { echo "[keel:watch] not a git repo: $DIR" >&2; exit 2; }
STATUS="node $SELF/watch-status.mjs --dir $ROOT --watch $INTERVAL"

if [ "$ONCE" -eq 1 ]; then
  exec node "$SELF/watch-status.mjs" --dir "$ROOT"
fi

if [ "$USE_TMUX" -eq 0 ] || ! command -v tmux >/dev/null 2>&1; then
  exec node "$SELF/watch-status.mjs" --dir "$ROOT" --watch "$INTERVAL"
fi

SESSION="keel-$(basename "$ROOT")"
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "[keel:watch] attaching to existing session $SESSION"
  exec tmux attach-session -t "$SESSION"
fi

# Extra worktrees get a shell each, cd'd in place, so the human can inspect or drive
# a session there. Harness-created worktrees are ephemeral: the status pane covers
# them, and panes are capped so the layout stays readable.
WORKTREES=()
while IFS= read -r line; do
  [ -n "$line" ] && WORKTREES+=("$line")
done < <(git -C "$ROOT" worktree list --porcelain | awk '/^worktree /{print substr($0,10)}' | grep -vxF "$ROOT" || true)

tmux new-session -d -s "$SESSION" -c "$ROOT" "$STATUS"
PANES=0
for w in "${WORKTREES[@]:-}"; do
  [ -n "$w" ] || continue
  [ "$PANES" -lt "$MAX_PANES" ] || break
  tmux split-window -t "$SESSION" -c "$w"
  tmux send-keys -t "$SESSION" "clear; echo 'worktree: $w'" C-m
  PANES=$((PANES+1))
done
tmux select-layout -t "$SESSION" tiled >/dev/null
tmux select-pane -t "$SESSION".0

if [ "${#WORKTREES[@]}" -gt "$MAX_PANES" ]; then
  echo "[keel:watch] ${#WORKTREES[@]} worktrees, $MAX_PANES panes — the rest are listed in the status pane"
fi

if [ -n "${TMUX:-}" ]; then
  exec tmux switch-client -t "$SESSION"
else
  exec tmux attach-session -t "$SESSION"
fi
