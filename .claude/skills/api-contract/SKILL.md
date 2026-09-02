---
name: api-contract
description: REST/HTTP API contract lens over a feature's changed endpoints — read-only. Appended to review-and-simplify's lens registry by the api-review pack. Also usable standalone.
---

# api-contract

When: dispatched by `review-and-simplify` as one of its parallel lenses, on the feature's diff, in projects where the `api-review` pack is installed. Also usable standalone for a focused API-design pass.

Scope: the changed API surface only — controllers/handlers/routes/DTOs in the feature's tree-snapshot diff (`git diff BASE_TREE HEAD_TREE`, per `subagent-driven-development`'s no-commit-rule snapshotting) or, if no snapshots exist, the working tree diff. Never the whole repo. If the diff touches no HTTP surface, report "no API-contract-relevant changes" and stop — do not manufacture findings.

Output: findings by severity (Critical/Important/Minor) with `file:line`, reported inline. Makes NO edits.

## Calibration

Judge the contract the changed endpoints expose — not internal implementation (that is `code-review`'s and `perf-review`'s territory). Flag only what the diff introduces or regresses.

- **Status codes:** wrong code for the effect — `200` on a create that should be `201`, `200` with an empty body where `204` fits, `200` masking an error, `404` vs `403` leaking existence, non-`4xx` on client error. A mutation that always returns `200` regardless of outcome is a finding.
- **Input validation:** an endpoint accepting a body/query/param without a validated DTO (no `class-validator`/schema) — untrusted input reaching logic unchecked. Cross-reference `security-review` for injection; here the concern is the *contract* (is the shape declared and enforced?).
- **Error shape:** inconsistent error bodies across endpoints; leaking stack traces or internal messages; throwing a raw error instead of a typed HTTP exception; success and error using incompatible envelopes.
- **Collections:** list endpoints without pagination or an upper bound; filtering/sorting via unvalidated free-form params; unbounded includes/joins exposed to the caller.
- **Resource semantics:** verb↔method mismatch (`GET` with side effects, `POST` for a pure read); non-idempotent `PUT`/`DELETE`; action verbs baked into paths where a resource noun belongs; inconsistent pluralization/casing versus sibling routes.
- **Versioning / compatibility:** a breaking change to an existing endpoint's request/response shape with no versioning or deprecation path.

Weigh contract risk realistically: a public mutation returning the wrong status or accepting unvalidated input is Critical/Important; a casing nit on a brand-new internal route is Minor. Do not restate what an OpenAPI/schema gate already enforces mechanically — this lens is for the judgment those cannot make (is this the *right* status? is the error envelope *consistent* with the rest of the API?).

Next: findings return to `review-and-simplify`, which aggregates them with the other lenses; Critical/Important must be fixed before the pre-commit gate.
