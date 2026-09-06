---
status: draft
feature: 003-catalog-listing
date: 2026-09-05
---

# Catalog listing — Brainstorm

> The approved design + the reasoning trail that produced it. Upstream of `spec.md`/`plan.md`:
> this is where the **why this shape** lives (exploration, trade-offs, what was left open); the
> *what* and the *how* live in the spec and plan templates. No code — contracts and intent, not
> function bodies.

## Understanding

- An authenticated caller lists the products of its own account, one page at a time, over a cursor
  the server hands back. The dataset grows while clients page through it, and paging must stay
  correct while it does.
- Scope is **read only**. There is no write endpoint in this feature: products enter through a seed
  script and through the repository in tests. A registration endpoint is feature 004.
- The account is the merchant. `auth` models `accountId` and nothing else, and the product brief's
  "any application they own or authorize" delegation is out of scope here — one account reads its
  own catalog.
- Product record carries `id`, `name`, `sku`, price, and `createdAt`. Price is an integer in the
  currency's minor unit plus an ISO-4217 code, never a float.
- Listing is unfiltered. Order is **stable and total**, not "exact creation order" — see the
  ordering note under the outline.
- The feature carries one refactor it cannot avoid: the OpenAPI path registry moves out of `auth`.

## Investigation

- `.specify/memory/constitution.md` already names `ProductRepository` as an expected port and cites
  `GSI1PK` in the naming rule, but `scripts/create-table.ts` creates the table with **PK/SK only**
  and no index. The chosen design needs no index, so this feature does not change the table.
- That script also enables TTL on the attribute `ttl`. The product mapper must never emit that
  attribute: an item carrying it is deleted on DynamoDB's own schedule, silently.
- `scripts/create-table.ts` provisions the **local** table only. The production table is feature
  004's Terraform, which is unwritten.
- `src/shared/persistence/table-keys.ts` is the single place a PK/SK pair is assembled. `auth` owns
  `USER#<accountId>`; throttling deliberately took a disjoint `THROTTLE#` partition to keep flood
  traffic off the account's own partition budget.
- `src/shared/persistence/dynamo-client.provider.ts` exposes `DYNAMO_DOCUMENT_CLIENT`, a
  `DynamoDBDocumentClient`. Its `QueryCommand` therefore comes from `@aws-sdk/lib-dynamodb`, where
  `ExclusiveStartKey` and `LastEvaluatedKey` are `Record<string, NativeAttributeValue>` — not the
  `AttributeValue` shapes of `@aws-sdk/client-dynamodb`.
- The SDK documents that a non-empty `LastEvaluatedKey` **does not** imply more data, and that the
  only end-of-results signal is an empty one.
- `Query` is eventually consistent by default, and local DynamoDB answers strongly consistent, so a
  seed-then-read test can pass locally and flake against the real service.
- `src/throttling/presentation/account-throttle.interceptor.ts` is global and skips only public and
  exempt routes, so an authenticated `GET /products` is metered with no new code. But
  `throttle-policy-resolver.ts` **ignores the route group when the scope is `account`**: every
  authenticated route shares one counter at `THROTTLE#account#<id>`, default 100 requests per 60s.
- `src/shared/presentation/problem-details.filter.ts` declares `PROBLEM_CODES` as a closed runtime
  array with `ProblemCode` derived from it, and `DEFAULT_MAPPING` answers **`503`** for any
  exception no row matches. `auth`'s request schemas use `.catch()` precisely so no `ZodError`
  escapes into that default.
- `auth-problem-mappings.ts` answers **`422`**, not `400`, for invalid request input
  (`PASSWORD_LENGTH_INVALID`, `EMAIL_INVALID`). It also maps `MissingAuthClaimsError` to `503`
  deliberately: a protected route reaching a handler without claims is a wiring defect, not client
  error. `AuthenticatedRequest.authClaims` is optional, so that path is reachable by construction.
- The published document's paths are **hand-registered**: six `registry.registerPath` calls inside
  `src/auth/presentation/openapi/openapi-document.ts`, `/health` included, while
  `problem-schema.ts` builds the `code` enum from `PROBLEM_CODES`. `test/e2e/contract/openapi.e2e-spec.ts`
  asserts the document describes every route. Publishing a code with no operation that returns it,
  or a route with no description, fails that test.
- Repeated query parameters arrive as arrays under Express (default `simple` query parser), but the
  ALB transport only surfaces them when multi-value headers are enabled on the target group;
  otherwise `?limit=5&limit=9` silently becomes the last value.
- `src/auth/infrastructure/crypto/uuid-v7-generator.ts` writes `Date.now()` into 48 bits and fills
  the rest from `randomBytes`, with no monotonic counter. Ids minted inside one millisecond sort
  randomly relative to each other.

## Approaches considered

- **Opaque cursor carrying the last `productId`** — the cursor is the last SK seen, base64url
  encoded. The server always rebuilds the PK from the token's `accountId`, so the cursor never
  contributes the partition. New items get a larger UUIDv7 and land at the end, so nothing already
  paged shifts: no duplicate, no hole. Trade-off: tied to a key whose sort order is the listing
  order, so a future ordering change invalidates cursors in flight.
- **Pass the raw DynamoDB `LastEvaluatedKey` through** — faithful to the SDK and survives a future
  GSI unchanged. Rejected: it puts `PK`/`SK` in the public contract, against the constitution's rule
  that a DynamoDB attribute name never leaves the adapter, and a forged cursor could then name
  another account's partition, turning validation into a security obligation rather than a
  convenience.
- **Numbered pages (`?page=2`)** — the shape clients expect. Rejected: DynamoDB has no offset, so
  serving page N means scanning from the start — cost linear in the page requested, and unstable
  under concurrent inserts.
- **Chosen: the opaque last-id cursor.** The only option that keeps pagination stable and the
  persistence boundary intact at the same time, at one `Query` per page.

## Open Decisions

None. Every point raised across two adversarial review cycles is closed below with its reason.

## Outline of the solution

**Key grammar.** `PK = CATALOG#<accountId>`, `SK = PRODUCT#<uuidv7>`, added to
`shared/persistence/table-keys.ts` as `buildProductKey`. A dedicated partition rather than hanging
products off `USER#<accountId>`: the catalog will be the highest-volume item in the system, and a
DynamoDB partition is capped near 10GB and ~3000 RCU, so sharing one with a merchant's session
tokens makes a large catalog compete with that merchant's own sign-in. Same reasoning that gave
throttling its `THROTTLE#` partition.

**Ordering is stable and total, not exact creation order.** The project's UUIDv7 generator has no
monotonic counter, so two products minted in the same millisecond have no defined relative order.
That is sufficient for pagination, which needs only a unique, stable, totally-ordered SK — but the
spec must claim exactly that and no more, and the ordering test must seed across distinct
milliseconds. A batch seed writing in a tight loop is precisely the case that would make a stronger
claim flaky.

**Modules**, a new bounded context `src/catalog/` following the layout auth and throttling use:

- `domain/` — the `Product` entity; `Money` (integer minor unit + ISO-4217, rejecting floats and
  negatives) and `Sku` value objects; `catalog-cursor.ts` as a pure encode/decode/validate;
  `CatalogPage`; `ports/product-repository.ts`; typed errors.
- `application/list-catalog.usecase.ts` — validate the limit, decode and validate the cursor, call
  the port, return the page.
- `infrastructure/dynamo/` — the repository issuing one `Query` (from `@aws-sdk/lib-dynamodb`), and
  the mapper that is the only place `PK`, `SK` and `snake_case` attributes appear, and which never
  emits `ttl`. Reuses `DYNAMO_DOCUMENT_CLIENT`.
- `presentation/` — `GET /products`, query DTOs, response DTO, this context's problem rows, its
  OpenAPI path registration, and the `401`/`422`/`429` responses it documents.

Id minting for the seed path needs an `IdGenerator`; taking `auth`'s implementation directly would
make `catalog` depend on a peer context's infrastructure. The port belongs in the shared kernel or
in this context, and the plan phase owns picking which.

**The OpenAPI registry moves to `shared/presentation`.** Paths are hand-registered today inside
`auth`, so publishing this feature's route from there would make `auth` import `catalog` — the exact
coupling ADR-0004 rejected for the problem filter, and it worsens with every new context. The
generic registry moves to `shared/presentation`, each context contributes its own paths, and the
composition root assembles them, mirroring how problem rows already work. This is a hard-to-reverse
structural decision that changes shipped 001 code, so it gets its own ADR alongside the feature.

**Data flow.** `JwtAuthGuard` establishes the claims, `AccountThrottleInterceptor` meters the
account, the controller parses `limit` and `cursor` at the trust boundary into typed values, the use
case decides, the adapter queries, the mapper converts, the DTO serializes.

**Pagination contract.** `limit` defaults to 25 and is capped at 100. The response always carries
`nextCursor`, `null` marking the end, and **it is derived from the query's `LastEvaluatedKey`, never
from the last returned item's SK** — the distinction is the whole point, since a last-item cursor
would make a full final page report a null cursor and render the stop rule decorative. Because the
SDK guarantees only that an empty `LastEvaluatedKey` means the end, a client must stop on
`nextCursor === null` and never on a short page: a page may come back with fewer items than the
limit, or none, and still carry a cursor.

Walking a large catalog costs quota, and that cost is documented rather than engineered around:
every authenticated route shares one 100-per-60s counter, so a 10,000-product catalog at 100 per
page consumes an entire window and locks the account out of every other route until it rolls. The
alternative — a dedicated route group — would mean changing `resolveThrottlePolicy`, which today
ignores the route group for account scope, and that is feature 002's settled code. Clients pace
themselves; the spec says so out loud.

**Input validation is positive, never "it failed to parse".** `Buffer.from(s, 'base64url')` does not
throw on malformed input — it discards invalid characters, so garbage decodes to garbage, becomes a
syntactically legal `ExclusiveStartKey`, and DynamoDB answers with a page rather than an error. The
cursor is therefore validated by asserting the shape it must have (the `PRODUCT#` prefix and a
well-formed UUIDv7) before it is used, and `limit` is checked against non-numeric, empty, zero,
negative, float, and above-cap input, not only the above-cap case.

Repeated parameters (`?limit=5&limit=9`) are rejected rather than coerced, which holds on Express
but reaches the Lambda transport only when the ALB target group has multi-value headers enabled.
That becomes a stated infrastructure requirement carried by feature 004's Terraform; until it lands,
the e2e proves the Express transport and the spec says so rather than implying both.

**Error handling.** The parser throws only this context's typed errors, which map to **`422`**, not
`400` — matching the precedent `auth` already set for invalid request input, so the public contract
stays consistent. Both codes go into `PROBLEM_CODES` in `shared` (which also feeds the published
`code` enum), are contributed as this context's rows, and are assembled at `AppModule`, per
ADR-0004. Each row states `exposeMessage` explicitly rather than inheriting the safe default
silently, since a `false` there leaves `detail` echoing the title and tells the client nothing.

`401` and `429` come from existing code. A `503` remains reachable and intentionally so: `authClaims`
is optional on the request, and a protected route arriving without claims is a wiring defect that
`auth` already maps to `503`. The design does not claim to eliminate that path; it claims that no
**malformed client input** can reach it.

**Consistency.** The listing query sets `ConsistentRead: true`. It is a single-partition query, so
the cost is bounded — double the read units — and it removes the contradiction between an eventually
consistent contract and seed-then-page tests that would pass locally and flake in production.

**Testing.** Unit: cursor roundtrip, and rejection of a forged, truncated, or wrong-shaped cursor —
including one that decodes cleanly but names something other than a product; `Money` and `Sku`
invariants; the full limit-input table; the use case against a fake repository, which is also where
the short-page-with-cursor behavior is proven, since a real short page requires either a filter
expression or roughly 1MB of items. Integration against local DynamoDB: paging a real multi-page
catalog and ordering across distinct milliseconds. E2e: walking to `nextCursor === null`, the
`422`s, the `401`, that no malformed input yields a `503`, the documented route and codes in the
published document, and **cross-account isolation** — account A must never see account B's product,
which is this feature's security proof. Problem-document assertions must expect `instance` to carry
the query string, since it is built from `request.originalUrl`.

Seeding: tests write through the repository, and `scripts/seed-catalog.ts` populates a local
environment, since no write endpoint exists until 004.
