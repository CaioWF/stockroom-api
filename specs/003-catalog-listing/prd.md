# Product Requirements Document (PRD)

> Product context (who the user is, what the product is, the north-star metric) lives in the
> brief at `.specify/memory/product.md`. This PRD **references** that brief and records only what
> is specific to THIS feature — do not repeat the user profile or the product's value proposition.

## Problem

- A merchant can sign in and hold a token, and nothing yet answers the question the token exists to
  ask: what is in my catalog? Features 001 and 002 built the way in and the way to survive load,
  around a read path that does not exist.
- This is the read path the brief calls the product. Until it ships, no integration can succeed
  end to end, so the north-star metric cannot move at all — it counts clients that read the
  catalog, and there is nothing to read.

## Hypothesis

- A single authenticated, cursor-paginated `GET /products` is enough for a client to consume a
  catalog of any size without holding it in memory, and paging that stays correct while the dataset
  grows is the part teams get wrong when they build it themselves.
- We believe it works because the ordering key is also the cursor: products sort by a
  time-ordered id, new products land after everything already paged, and a caller resuming from a
  cursor therefore cannot see a duplicate or skip an item. The server rebuilds the caller's
  partition from the verified token, so a cursor can address only the account that issued it.

## User/Context

- Inherits the target user from the brief. This feature narrows to the caller that already holds a
  valid access token: a merchant's own application reading the merchant's own catalog.
- Scenario: a client walks the whole catalog page by page on a cold start, then resumes later from
  a stored cursor while other writes have landed.
- Constraint specific to this feature: the catalog is **read only** here. Products enter through a
  seed script and through tests; a write endpoint is a later feature, so this one cannot be
  demonstrated by a client alone until that lands.
- Constraint inherited from 002: every authenticated route shares one rate-limit counter, so
  walking a large catalog consumes the account's quota for all other routes during that window.

## Success Metric

- A client can page a catalog larger than one page to completion, receiving every product exactly
  once and no product belonging to another account.
- Measured as: the acceptance criteria for pagination and cross-account isolation passing, and a
  seeded catalog of N products yielding exactly N distinct items across the walk, for an N spanning
  several pages.
- The feature-level KPI is page-walk completeness rather than latency; the north-star (weekly
  active integrations) can only start moving once the write endpoint follows.

## Dependencies & Interfaces

**Consumes (inputs)** — what this feature depends on to work:

- `specs/001-authentication` → the verified access token and the `accountId` claim that names whose
  catalog is being read.
- `specs/001-authentication` → the shared DynamoDB client, the single-table key grammar, and the
  RFC 9457 problem-details machinery its closed code set governs.
- `specs/002-request-throttling` → per-account rate limiting, applied to this route automatically
  because it is authenticated.
- Local DynamoDB provisioned by `scripts/create-table.ts`, plus a seed path, since no write
  endpoint exists yet.

**Exposes (outputs)** — what this feature now offers to others:

- `GET /products` — the authenticated, cursor-paginated catalog listing, consumed by any client
  application the merchant runs.
- The product record's public shape (id, name, sku, price as minor-unit integer plus ISO-4217 code,
  createdAt), which the write endpoint in a later feature must accept and preserve.
- A relocated OpenAPI path registry in `shared`, which every bounded context now contributes to
  instead of registering paths inside `auth`.

**Dependencies** — couplings with explicit direction:

- `specs/001-authentication` — blocks this feature. Merged.
- `specs/002-request-throttling` — blocks this feature. Merged.
- `specs/004-*` (product registration) — unblocked by this feature: it must write records this
  listing can read, in the shape defined here.
- `specs/004-*` (cloud infrastructure) — unblocked by this feature, and carries two requirements it
  raises: the production table, and multi-value headers on the ALB target group, without which
  repeated query parameters cannot be rejected on the Lambda transport.

## Out of Scope

- Any write path: creating, updating, or deleting a product.
- Filtering, search, sorting by anything but the storage order, and field selection.
- Delegated access — one account reads its own catalog; the brief's "any application they own or
  authorize" needs an authorization model this feature does not build.
- Media, variants, categories, and stock levels, all of which the brief lists as product non-goals
  or defers.
- Changing the throttling policy resolver so the catalog gets its own quota. Documented as an
  accepted cost here; revisit if page-walk quota becomes a real complaint.
