---
name: security-review
description: Dedicated security lens over a feature's changed code — read-only. Invoked by review-and-simplify, also usable standalone.
---

# security-review

When: invoked by `review-and-simplify` as one of its parallel lenses, on the feature's diff. Also usable standalone any time a focused security pass is needed.

Scope: the changed code only — the feature's tree-snapshot diff (`git diff BASE_TREE HEAD_TREE`, per `subagent-driven-development`'s no-commit-rule snapshotting) or, if no snapshots exist, the working tree diff. Never the whole repo.

Output: findings by severity (Critical/Important/Minor) with `file:line`, reported inline. Makes NO edits.

## Calibration

Same bands as the task-reviewer rubric in `subagent-driven-development`:
- **Critical** — exploitable or unsafe right now (hardcoded secret, missing authz check, injection-reachable input).
- **Important** — should fix before merge, not actively exploited yet (denylist instead of allowlist, missing input validation on a low-risk path).
- **Minor** — hardening, defense-in-depth, no current exposure.

## Checklist

Walk every item against the diff:

1. **Hardcoded secrets/credentials/tokens.** Grep the diff for API keys, passwords, connection strings, private keys. Also flag secrets leaked into log statements — a secret printed to a log is still a secret leak.
2. **Authorization/permission checks MUST allow-list the permitted value, never deny-list the known-bad.** This is the keel's own security rule (see project `CLAUDE.md`, `## Security`): any check on a field like `source`, `role`, `type`, `origin`, `createdVia`, or `userGroup` that compares against a *forbidden* value (`if (x === 'admin') throw`) is a blacklist — new/unexpected values pass through silently. Flag every instance; the fix is `if (x !== 'expected-value') throw` or `!allowedSet.has(x)`, with an enum preferred over a string literal.
3. **Input validation / injection.** SQL built by string concatenation, shell commands built from unsanitized input, path segments taken from user input without normalization/containment (path traversal).
4. **SSRF / unvalidated outbound requests.** Any outbound HTTP call whose host/URL is influenced by user input without an allowlist of permitted destinations.
5. **Unsafe crypto, weak randomness, predictable IDs.** `Math.random()` or similar for tokens/IDs/secrets, weak or homegrown hashing, predictable session/reset tokens.
6. **Dependency & supply-chain surface.** New third-party dependencies, postinstall scripts, auto-updating plugins. For keel-style code specifically: flag any deviation from zero-dependency / no-python (Path A) — a new runtime dependency on an external plugin or interpreter is itself a finding.

## Process

1. Resolve the diff to review (tree-snapshot diff or working tree — see `subagent-driven-development`'s no-commit rule for how snapshots are taken).
2. Walk the checklist above against every changed file.
3. Report each finding as `file:line — severity — description — why it matters`.
4. Make no edits. If a finding requires a code change, hand it back to `fix-runner` or `implement-and-evaluate` — this skill reviews, it does not patch.

Next: findings return to the orchestrator (`review-and-simplify`), which routes Critical/Important findings to fix-runner/implement-and-evaluate for remediation, then re-invokes this lens.
