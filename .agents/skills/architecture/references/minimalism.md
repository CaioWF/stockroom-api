# Minimalism — the laziness ladder (language-agnostic)

Generative heuristic: think like an experienced dev who **resists unnecessary complexity**.
AI agents tend to over-engineer — installing a dep, creating an abstraction, generating verbose
code when something simpler would do. This is the discipline **before writing**: climb the ladder
and stop at the first rung that solves it.

## The ladder (climb before adding code)

For any piece of functionality, in order:

1. **Does it need to exist?** Is the requirement real, or is it an invented/anticipated
   feature (YAGNI)? If it doesn't need to exist, the best code is no code.
2. **Is it already in the codebase?** Does a function/module/util already do this? Reuse instead
   of recreating.
3. **Is it in the stdlib?** Does the language already offer it? Prefer the language's standard over
   writing from scratch.
4. **Is it a native platform feature?** Does the runtime/framework/OS already give it for free? Use
   the native one.
5. **Already-installed dep?** Does some existing project dependency already cover it? Use what's
   already there before adding a new package.
6. **Does it fit a one-liner?** If so, write the one-liner — not an abstraction around it.
7. **Otherwise: minimum viable code.** Only now write it, and only the minimum that satisfies
   the requirement.

## The carve-out (non-negotiable)

The ladder optimizes for **code volume**, never **edge-case correctness**. Never cut:

- **Trust-boundary validation** — external input is always validated.
- **Data-loss handling** — failure must not silently corrupt/lose state.
- **Security** — authz (allow-list), secrets, injection, SSRF, crypto.
- **Accessibility** — whenever there's a user-facing surface.

"Minimal" means without fat, not without a seatbelt. These four are never the rung you skip.

## Minimalism (pre) vs `simplify` (post) — don't confuse them

They pull in opposite directions on purpose:

- **This skill decides what gets BORN.** Pre-write, generative: don't add a dep/abstraction/feature
  without climbing the ladder.
- **`simplify` cleans up what was BORN.** Post-write, behavior-preserving: improves diff
  readability — and explicitly **doesn't strip** an abstraction that's earning its keep.

No contradiction: minimalism avoids creating the superfluous; `simplify` doesn't remove the
necessary. When in doubt about removing something already written, that's `simplify`'s
territory, not this skill's.

## Violation signals (red flags)

- New dep for something stdlib/an existing dep already does.
- Abstraction layer with a single implementation and no second use case in sight.
- Wrapper/helper that just passes arguments through.
- Config/flag for a case nobody asked for.
- "For the future" generalization with no present requirement.

## Enforcement

Advisory by nature — it's a design decision, not a mechanical rule. Reinforcement comes from
wiring into the phases: `analyze` checks rung 1 (does it need to exist?) against the spec;
`implement-feature` and the implementer subagent climb the ladder before adding a dep/abstraction.
The constitution carries the hard rule (`## Architecture Principles`). The rationale lives here.
