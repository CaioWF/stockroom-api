---
name: handoff
description: Use when PAUSING/ending a session (writes the current state to docs/STATE.md to resume later) or when RESUMING (reads docs/STATE.md and the active spec, recomposes context, and proposes the next step). Maintains continuity across human and agent sessions.
---

# handoff — session continuity (pause / resume)

Maintains project continuity via `docs/STATE.md`, the **volatile** working memory
(different from an ADR, which is a **durable** decision under `docs/architecture/adr/`). Detect the intent
from the request (pause vs. resume); if ambiguous, ask.

## PAUSE mode (pause / end)

Update `docs/STATE.md` with this session's real state:

1. **In progress / next step** — the active feature/spec and the **next concrete and
   specific action** ("implement AC-3 on adapter X", not "continue the feature").
2. **Recent decisions** — what was decided. If it is hard to reverse, record it with the
   `adr-writer` skill (`docs/architecture/adr/`) and link it; STATE only summarizes.
3. **Blockers** — what is stuck and who/how unblocks it.
4. **Deferred ideas / todos** — what was intentionally left out, with the trigger to reconsider it.
5. Note the date and the author. If there is an open `SPEC_DEVIATION` in the code, record it as a blocker.
6. Be concise and actionable — STATE exists so someone (or an agent) can resume **cold** tomorrow.
7. Sort out what is **not** volatile. A start command, a test invocation, a repo convention, a trap that cost an hour: those outlive this session and do not belong in STATE. Run `learn-session` to route them into `CLAUDE.md` and `docs/gotchas.md`. STATE keeps only what stops being true once the work resumes.

Do not commit on your own; propose the commit (`docs: handoff — update STATE`) and wait for
approval, per the project's commit rule.

## RESUME mode (resume)

1. Read `docs/STATE.md` and the active feature's `spec.md`/`tasks.md` cited in it.
2. **Summarize where we left off** in a few lines: active feature, last step, open blockers.
3. **Propose the next step** (the "In progress / next step" from STATE) and confirm with the
   user before executing.

## Rules

- STATE.md is **volatile**; ADR is **durable**. Never write a structural decision only in STATE.
- An accepted ADR is **append-only**: to change a decision, `adr-writer` writes a new one that supersedes
  the old one — never edit the accepted ADR (only the `Status` line).
- Do not invent progress: report faithfully what was done, what remains, and what is blocked.
- STATE is already injected into context at SessionStart; when resuming, trust it as the starting point.
