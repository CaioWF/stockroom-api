---
name: adr-writer
description: Use when a hard-to-reverse architectural decision is made — during plan-writer, a refactor, a doubt-driven trade-off, or a handoff PAUSE — to write it as an immutable ADR in docs/architecture/adr/ from the ADR template, or to supersede an existing one.
---

# adr-writer

When: a decision that is **hard to reverse** has been made (or is about to be). ADRs are durable; `docs/STATE.md` is volatile. Never let a structural decision live only in STATE, a commit message, or the chat.

Template: `docs/architecture/adr/_template.md`.

Output: `docs/architecture/adr/NNNN-kebab-case-title.md`.

## Does this deserve an ADR?

Write one when the decision is hard to reverse AND has consequences beyond the current feature:

- Dependency direction, layer or module boundary, aggregate boundary.
- Adopting/replacing a framework, database, protocol, or external service.
- Persistence model or public contract shape (API, event, schema).
- Deliberately accepting a trade-off or technical debt.

Skip it for reversible or local choices (a variable name, a helper's location, a one-file refactor). Those belong in the code and, if in flight, in STATE. When unsure, ask the user rather than growing the ADR log with noise.

## Steps

1. Determine the number: `NNNN` = highest existing ADR in `docs/architecture/adr/` + 1, zero-padded to 4 digits, sequential and never reused. `_template.md` and `index.md` are not ADRs.
2. Copy `_template.md` and fill every section against what was actually decided:
   - **Context** — the problem, the forces, the constraints, why this must be decided now.
   - **Decision** — present tense ("We will use X because…"). One decision per ADR.
   - **Alternatives Considered** — real options that were weighed, each with why it lost. An ADR with no alternatives is a note, not a decision.
   - **Consequences** — positive, negative/trade-offs, and neutral. Naming the negative consequence is the point; an ADR with only upsides is not honest.
   - **Status** — `proposed` while the user has not agreed; `accepted` once they have.
   - **Decision makers** and **Date** (today's date, `YYYY-MM-DD`).
3. Ground it in evidence: cite the spec/plan, the constitution rule, or the code that forced the decision. Do not invent a rationale after the fact — if the real reason was a constraint or a deadline, write that.
4. Register it as an OKF concept: the frontmatter carries `type: adr`, `title`, and a one-sentence `description`, so the SessionStart `okf-index` hook surfaces it. Cross-link related concepts with **relative markdown links** (`[Title](../../design-notes/XXXX.md)`), and link back from the spec/plan that motivated it.
5. Refresh the knowledge index — `node .specify/gates/okf-build-index.mjs build docs` — otherwise the freshness gate blocks the commit.
6. Report the ADR path and its status to the user. Do not commit; ADRs ride with the feature's commit, proposed and approved like any other change.

## Changing a decision: supersede, never edit

ADRs are **append-only**. An accepted ADR is a historical record of what was decided and why, at that time — editing it destroys the reasoning trail that makes it worth keeping.

To change a decision:

1. Write a NEW ADR with the next number. Its `Context` states what changed since the old one (new constraint, new evidence, the trade-off went bad).
2. Edit the OLD ADR's `Status` line only: `superseded by ADR-XXXX`. Touch nothing else in it.
3. Link the two in both directions.

The single exception: an ADR still in `proposed` status has not been agreed to yet, so it may be edited freely until it becomes `accepted`.

Fixing a typo or a broken link is not "changing a decision" — that is fine.

## Rules

- **One decision per ADR.** Two decisions = two ADRs, even if made in the same conversation.
- **Never edit an accepted ADR** except its Status line when superseding.
- **Never renumber**, reuse, or delete an ADR number — a superseded ADR stays in the tree.
- **Never invent consequences.** If a consequence is unknown, say it is unknown.
- **Never commit** on your own; propose and wait, per the project's commit-at-milestone rule.

## Related

- `handoff` — writes the volatile STATE; delegates durable decisions here.
- `architecture` — the agnostic principles behind most decisions worth recording.
- `plan-writer` — the phase where boundary/dependency decisions usually surface.
- `doubt-driven-development` — a legitimate trade-off found there gets recorded as an ADR.
