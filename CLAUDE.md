# PROJECT

## Environment

<!-- BEGIN:keel:environment -->
How this project is brought up and taken down. Fill each line the first time you learn it; `learn-session` keeps it current. Record the exact command, not a description of it, and state the prohibition whenever a wrong path exists ("do not start the dev server directly — use the script above").

- start: `docker compose up -d dynamodb && npm run db:create-table && npm run keys:generate && npm run start:dev`
- stop: `docker compose down -v`
- required env vars: copy `.env.example` to `.env` — never auto-loaded (no `dotenv` dependency), source it manually before any config-touching command
- local URL / health check: `http://localhost:3000/health` (port from `PORT` env var, default 3000)
- test data / credentials: none seeded — e2e suites register the accounts they need through the public routes
- watch work in flight: `bash scripts/keel-watch.sh` — status pane (features, tasks dispatched, ledger, worktrees) plus a shell per extra worktree; `--no-tmux` renders the same status in one terminal
<!-- END:keel:environment -->

## SDD Workflow

This project follows spec-driven development. The skill chain, in order, is:

`brainstorming` → `prd-writer` → `spec-writer` → `clarify` → `plan-writer` → `tasks-writer` → `analyze` → `implement-and-evaluate` → `review-and-simplify` → `finishing-a-development-branch`

Two **once-per-project** layers are written before the chain and referenced by it, never repeated in it: the **product brief** (`.specify/memory/product.md`, via `product-writer`) and the **constitution** (`.specify/memory/constitution.md`, via `constitution-writer`). Both are injected at SessionStart.

Each feature carries a **verification contract** (`specs/<feature>/contract.md`, written by `tasks-writer`): the environment to bring up, and per `AC-N` the proof, the command, the observable, and a status that `evaluator` stamps. See `docs/design-notes/verification-contract.md`.

`implement-and-evaluate` is the execution loop, and `implement-feature` is its child rather than a step before it. It picks inline vs dispatch vs dispatch-parallel per feature — its `## Mode Selection` and `docs/design-notes/execution-mode-routing.md` own that decision. `implement-autonomously` is an **opt-in** swap-in for unattended runs, never the default and never an extra step; the skill carries its own budget and stop conditions.

When processing review feedback (from the user, a human reviewer, or the `review-and-simplify` lenses), follow `receiving-code-review`: verify before implementing, push back with technical reasoning when a suggestion is wrong, never performative agreement. After the approved commit(s), `finishing-a-development-branch` presents the integrate options and handles worktree cleanup.

`brainstorming` is the entry point for any non-trivial feature, refactor, or bug fix; it runs `doubt-driven-development` as an adversarial gate before handing off. Code edits stay blocked until `spec.md` and `plan.md` both carry `status: approved` — the phase-gate hook enforces that. Get approval; never disable or work around the hook.

**Trivial changes have a declared path, and only they do.** A typo, a mechanical rename, a formatting fix, a one-line config change: write the reason into `.specify/trivial` (one line) and the phase-gate allows edits up to 10 lines while that marker is fresh, echoing the reason each time. **Announce the skip in your response** — that is the price of the shortcut. Anything larger, anything that changes behavior, anything you would have to argue for: run the flow. Stretching this door to fit real work is the failure it exists to prevent.

`review-and-simplify` is a MANDATORY pre-commit step: the review lenses (`code-review` + `security-review`) in parallel plus a behavior-preserving `simplify` pass. A commit is never proposed without it.

**TDD is a REQUIRED step.** All implementation (`implement-feature` and any dispatched implementer subagent) MUST follow the `test-driven-development` skill: no production code without a failing test first (Iron Law), red → green → refactor per behavior. Test BEHAVIOR — observable inputs/outputs/effects — NOT implementation details, and NEVER assert on mocks. "Test-after" does not satisfy it.

## Commits

Accumulate changes and commit at the END of a feature or milestone — NOT after every task, step, or TDD cycle. When dispatching subagents, instruct them to implement/test/report only; they NEVER commit. Once tests are green and quality gates pass, propose the commit message(s) and wait for explicit approval before running `git commit`.

## Quality Gates

Run `.specify/gates/run-gates.sh`. DO NOT invent ad-hoc gates — no hand-rolled lint/test invocations outside what the script already runs. The precommit-gate hook runs it before any `git commit` and blocks on failure. It detects the project's build stack-independently (npm, make, go, cargo, Maven, Gradle, .NET), so a feature that broke the build cannot be committed.

Doc-layer gates always run: `audit-structure` (skill frontmatter, every `specs/NNNN-*/` has a `spec.md`, no broken links), `eval-spec-fidelity` (every `AC-N` in the spec covered by a task; a missing test reference or missing `contract.md` section is a warning), `validate-mermaid`.

Tag acceptance criteria `AC-1`, `AC-2`… in the spec and cite the `AC-N` in the task that delivers it. When you knowingly diverge from an approved spec, mark the spot with a `SPEC_DEVIATION` comment explaining why — the gate counts open ones so they are not forgotten.

## Code style

- Functions: 4-20 lines. Files: under 400 lines.
- Single responsibility per function/module.
- Specific names — avoid generic placeholders like `data`, `handler`, `Manager`.
- Explicit types everywhere; no `any`.

## Security

Authorization and permission checks on fields like `source`, `role`, `type`, `origin`, `createdVia`, or `userGroup` MUST allow-list the permitted value — never deny-list the known-bad value. New/unexpected values must be blocked by default. Prefer an enum over a string literal for the allowed set.

```ts
// wrong — blacklist (new values pass through silently)
if (entity.sourceApp === 'admin') throw new ForbiddenException();

// right — whitelist (new values are blocked by default)
if (entity.sourceApp !== 'expected-source') throw new ForbiddenException();
```

## Comments

Comment WHY, not WHAT — the code already says what it does. Docstrings should state intent plus a short example. Reference the relevant issue or commit SHA when a comment explains a workaround or a non-obvious historical decision.

## Prose

Docs, specs, and comments are written plainly. No throat-clearing openers, no claiming significance the work has not earned, no `not just X, but Y`, no borrowed vocabulary (`delve`, `intricate`, `myriad`, `showcase`), no `-ing` filler clauses, no decorative emoji in headings, no Title-Case section headings. Say the thing and stop.

The `slop-guard` hook reports these tells back after a write, advisory only. Its rules, knobs (`KEEL_SLOP_THRESHOLD`, `KEEL_SLOP_OFF`), and rationale live in the hook's own header and `docs/design-notes/prose-slop-guard.md`.

## Structure

Keep modules small and focused on one concern. Use predictable, conventional paths so files can be found without searching.

When designing a feature's structure (during `plan-writer`), use the `architecture` skill and fill `.specify/templates/architecture-template.md`. The constitution's `## Architecture Principles` are non-negotiable; mechanical enforcement of the dependency rule is per-language and ships in a pack, not in core.

Ground the plan in the real tree first with the `codebase-map` skill — it maps the repo ONCE into `docs/codebase-map.md` so later phases reuse it instead of re-exploring. Skip it on small repos.

## Continuity & decisions

`docs/STATE.md` is the **volatile** work memory — where we stopped, the next concrete step, blockers. It is injected at SessionStart. Use the `handoff` skill to write it when pausing and to recompose context when resuming.

Parts of this file are **living**. The spans between `<!-- BEGIN:keel:<id> -->` and `<!-- END:keel:<id> -->` hold what the project learned about itself (environment, test commands, conventions) plus the sections an installed pack contributes. `learn-session` writes them at the end of a session or feature; traps and doc pointers go to `docs/gotchas.md` instead, so the always-loaded file stays short. `bootstrap.sh --force` refreshes the body around the blocks and carries them across, and each pack re-renders its own block — never hand-edit a pack's.

Durable architecture decisions go in `docs/architecture/adr/NNNN-*.md` via the `adr-writer` skill, which owns numbering, template, and the supersede protocol. ADRs are append-only. Rule of thumb: hard-to-reverse decision → ADR; current work state → STATE.

`docs/` is an Open Knowledge Format bundle: any `.md` under `docs/`, `specs/`, or `.specify/memory/` carrying a `type:` frontmatter key is a concept, and the `okf-index` hook injects a map of them at SessionStart — documented schemas, metrics, APIs, and decisions are in context from turn one with zero tool calls. To register one, give the doc `type:`, `title:`, and a one-sentence `description:`, and cross-link with relative markdown links. Regenerate the index after adding or editing concepts (`.specify/gates/okf-build-index.mjs build docs`); a freshness gate blocks the commit otherwise. Full tooling map: `docs/design-notes/okf-adoption.md`.

## Multi-client views

This Claude Code setup (`CLAUDE.md` + `.claude/`) is the **canonical source**. Views for other agents (Codex, Cursor, Copilot, Gemini, Windsurf), generated when bootstrapped with `--agent=` / `--all`, are advisory and read-only: they carry instructions and skills but NOT the mechanical enforcement, which is Claude-Code-only. Never hand-edit a view; change the source and regenerate with `bootstrap.sh --force --agent=...`.

## Logging

Use structured JSON for debug/diagnostic logging. Use plain text for user-facing output.

<!-- BEGIN:keel:tests -->
- unit: `npm run test:unit` (no DynamoDB needed)
- integration: `npm run test:integration` (needs local DynamoDB up)
- e2e: `npm run test:e2e` (needs local DynamoDB up; no AWS credentials needed —
  `test/e2e/auth/support/build-test-app.ts` overrides both key providers with an in-memory RS256
  pair. Only running the app by hand needs real SSM)
- one file: `npm run test:e2e -- <path-substring>` — the positional arg matches by file-path
  substring, not test name; do not use a short substring like `me`, checkouts commonly live under
  `/home/...` and would match every e2e file
- gates: `.specify/gates/run-gates.sh`
- gates run doc audits, dependency-rule, lint and build, and no test suite. Green gates are not
  green tests: run all three suites separately
<!-- END:keel:tests -->

<!-- BEGIN:keel:stack-conventions -->
## Stack conventions

Before writing TypeScript, SQL, or naming anything public, load the matching lens: `typescript-conventions`, `postgres-conventions`, `naming-conventions`. They are registered in `.specify/impl-conventions.txt`, which `plan-writer` reads when grounding technical decisions and `implement-feature` applies while coding.

These lenses are house style for this stack. Facts about a framework's API come from `source-driven-development` — verify against the installed version, never from memory.

This section is rendered by the `stack-conventions` pack. Edit the pack, not this block.
<!-- END:keel:stack-conventions -->
