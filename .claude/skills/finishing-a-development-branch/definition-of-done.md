# Definition of Done — finishing-a-development-branch companion

The consolidated checklist for "is this work actually complete?" — run it in Step 1,
after gates pass and before presenting the integrate options. Gates prove the mechanical
floor (build/lint/tests); this list covers what gates cannot mechanically check. Any
unmet item is either fixed or explicitly waived to the human before merge/PR.

Adapted from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)
`references/definition-of-done.md` (MIT, © 2025 Addy Osmani).

## Correctness
- Every acceptance criterion (`AC-N`) for the feature is met.
- Behavior verified at runtime — not just compiled/typechecked (see the `verify` skill).
- New behavior is covered by a test that fails without the change and passes with it.
- Existing tests still pass; no regressions.
- Edge cases and error paths handled, not only the happy path.

## Quality
- Code reveals intent through naming/structure; no comment needed to explain *what* it does.
- No duplicated business logic; no dead code, debug output, or commented-out blocks.
- Changes scoped to the feature — no unrelated refactors snuck in.
- Lint/format pass.

## Integration
- Works with the rest of the system, not just in isolation.
- Migrations, config changes, and feature flags accounted for.
- Backward compatibility considered for any changed public interface/API.

## Documentation
- Public interfaces, APIs, and user-facing behavior documented.
- Durable architecture decisions recorded as an ADR (`docs/architecture/adr/`), not in STATE.
- Docs describe the current state in timeless language, not the change history.

## Ship-readiness
- Security reviewed for any untrusted input, auth, or data handling (allow-list, not deny-list).
- Observability in place for new critical paths (logs, metrics, traces) where the change warrants it — if the `ship` pack is installed, per its `observability-and-instrumentation` skill.
- A rollback path exists for anything risky (reversible migration, flag, revert plan).
- The human has reviewed and approved before merge/deploy.
