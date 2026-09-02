---
name: saas-security
description: SaaS-domain security lens over a feature's changed auth/billing/tenant surface — read-only. Complements the agnostic security-review lens with the domain checks it does not make (server-side enforcement of client gates, tenant isolation, entitlement/paywall bypass, auth-flow abuse). Appended to review-lenses.txt by the saas-security pack. Also usable standalone.
---

# saas-security

When: dispatched by `review-and-simplify` as one of its parallel lenses, on the feature's diff, in projects where the `saas-security` pack is installed. Runs alongside `security-review` (generic OWASP-ish) — this lens is the SaaS-domain layer on top. Also usable standalone for a focused auth/billing/tenant pass.

Scope: the changed auth/session, billing/entitlement, and tenant-scoped surface only — controllers/handlers/guards/middleware/queries in the feature's tree-snapshot diff (`git diff BASE_TREE HEAD_TREE`, per `subagent-driven-development`'s no-commit-rule snapshotting) or, if no snapshots exist, the working tree diff. Never the whole repo. If the diff touches no auth/billing/tenant surface, report "no SaaS-security-relevant changes" and stop — do not manufacture findings.

Output: findings by severity (Critical/Important/Minor) with `file:line`, reported inline. Makes NO edits.

## Calibration

Same bands as `security-review` (Critical = exploitable now, Important = fix before merge, Minor = hardening). This lens judges the *domain* enforcement, not generic injection/secrets (that is `security-review`'s territory). Flag only what the diff introduces or regresses.

## Checklist

1. **Server-side enforcement of every client-side gate.** A UI blur, hidden/disabled control, client-side redirect, or feature flag read in the browser is UX, not a boundary. If the change gates something in the client without a matching check on the server (the endpoint still serves the data/action when called directly), that is a finding — Critical when it exposes another tenant's data or a paid capability. The real block lives on the server; the client gate is decoration.
2. **Authorization allow-lists (keel rule).** Any check on `source`, `role`, `type`, `origin`, `createdVia`, `plan`, `userGroup` etc. that deny-lists a known-bad value (`if (x === 'admin') throw`) lets new/unexpected values pass silently. Fix is whitelist: `if (x !== 'expected') throw` / `!allowedSet.has(x)`, enum over string. (See project `CLAUDE.md` `## Security`.)
3. **Tenant isolation / RLS.** Every query on a tenant- or user-scoped table filters by the tenant/owner column, and RLS is enabled as the backstop (see `postgres-conventions` when `stack-conventions` is installed). Flag object references taken from user input (`/orgs/:id`, `resourceId` in a body) that are used without re-checking the caller owns them — IDOR / cross-tenant read/write.
4. **Entitlement / paywall / quota bypass.** Plan-, seat-, quota-, and feature-gates are enforced on the server at the point of use, not only where the UI hides the button. Calling the API directly must not grant a capability the caller has not paid for or has exhausted.
5. **Billing integration integrity.** Payment/subscription webhooks verify their signature (e.g. Stripe `Stripe-Signature`) before trusting the payload; events are processed idempotently (a replayed webhook does not double-grant/double-charge); entitlement state is derived from the provider, not from a client-supplied "I paid" flag.
6. **Auth-flow abuse resistance.** Confirmation/verification/reset flows (email-confirm, OTP, password reset) enforce a validity window, an attempt/resend limit, single-use of the code, and sufficient token entropy — and the account/capability is only unlocked after the server confirms the code, never optimistically on the client. Token expiry comparisons use the correct boundary (`>=`/`<=`, not an off-by-one that leaves an expired token valid). Existence is not leaked (uniform response whether or not the email exists; `404` vs `403` chosen to not disclose).

Weigh realistically: a direct-call bypass of another tenant's data or a paid feature is Critical; a missing resend-limit on an internal-only flow is Minor. Do not restate what a schema/authz gate already enforces mechanically — this lens is for the judgment those cannot make.

Next: findings return to `review-and-simplify`, which aggregates them with the other lenses; Critical/Important must be fixed (via `fix-runner`/`implement-and-evaluate`) before the pre-commit gate.
