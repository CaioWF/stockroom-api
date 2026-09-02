# [Feature] — Verification Contract

> Everything needed to verify this feature, in one place: how to bring the environment up, and
> for each `AC-N` from `spec.md` — what proves it, what command runs that proof, what you should
> observe, and whether it currently passes.
>
> The spec is the authoritative statement of each criterion. Reference `AC-N` here with a short
> label; do NOT copy the full Given/When/Then, or the two drift apart.
>
> This is a **verification** contract — how the feature is proven. It is not an interface or API
> contract: those live in the PRD's `Dependencies & Interfaces` and the plan's `Data Layer Contract`.
>
> `status:` is filled by the `evaluator` skill, not at authoring time. Leave it `PENDING`.
> Vocabulary: `PENDING` (never run) · `PASS` · `FAIL` · `UNVERIFIED` (no runnable proof — manual
> or missing; NOT a pass). Keep one section per `AC-N` in spec order and delete sections whose
> criterion the spec dropped — a section for an AC that no longer exists is stale, and the
> `eval-spec-fidelity` gate warns about it in both directions.

## Environment

> What a fresh machine (or a fresh subagent) needs before any command below will run.
> If nothing is needed beyond the repo, write `N/A — no setup beyond install`.

- **start**: [command that brings dependencies up — e.g. `docker compose up -d db`]
- **env**: [required variables and where they come from — e.g. `DATABASE_URL` from `.env.example`]
- **fixtures**: [seed/migration/test-data step, or `N/A`]
- **credentials**: [test user/token the proofs use, or `N/A`]
- **teardown**: [how to reset state between runs, or `N/A`]

## AC-1 — [short label]

- **proof**: [the test or check that proves it — `tests/auth.spec.ts` (add `:LINE` once it exists); or `manual` with the steps]
- **command**: [exact command that runs that proof — e.g. `npm test -- auth`]
- **observable**: [what a human sees when it passes — e.g. `401 with no token, 200 with a valid one`]
- **status**: PENDING

## AC-2 — [short label]

- **proof**: [...]
- **command**: [...]
- **observable**: [...]
- **status**: PENDING

## Full-Suite Check

> The one command that runs everything, for the final pass.

- **command**: `.specify/gates/run-gates.sh`
- **status**: PENDING
