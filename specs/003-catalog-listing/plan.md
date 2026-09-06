---
status: approved
---

# Catalog listing — Plan

> Grounded in `spec.md` (FR/AC numbering below refers to it) and the seams `prd.md` declares.
> `docs/codebase-map.md` does not exist and was deliberately not generated: the repo is small
> (93 source files across four bounded contexts) and its structure was read directly while this
> plan was written, so the paths below are verified rather than mapped.

## Architecture

- **New bounded context `src/catalog/`**, layered exactly like `src/auth/` and `src/throttling/`:
  `domain/` (pure), `application/` (use case), `infrastructure/dynamo/` (adapter), `presentation/`
  (HTTP). This is replication, not invention — the two existing contexts already settled the
  layering, the port-per-dependency style, the `Symbol` injection tokens, and the typed-error
  strategy, and nothing about a read endpoint justifies diverging.
- **Data flow.** `JwtAuthGuard` (existing) puts `authClaims` on the request →
  `AccountThrottleInterceptor` (existing, global, no decorator needed) meters the account →
  `CatalogController` parses `limit`/`cursor` at the trust boundary into typed values →
  `ListCatalog` use case → `ProductRepository` port → `ProductDynamoRepository` issues one
  `QueryCommand` → `product.mapper` converts stored attributes to the domain → controller
  serializes `{ items, nextCursor }`.
- **Consumes** (from `prd.md`): the verified `accountId` claim, via `AuthenticatedRequest.authClaims`
  published by `src/auth/presentation/jwt-auth.guard.ts`; the shared `DYNAMO_DOCUMENT_CLIENT` from
  `src/shared/persistence/dynamo-client.provider.ts`; the key grammar in
  `src/shared/persistence/table-keys.ts`; the problem machinery in `src/shared/presentation/`; and
  per-account throttling from `src/throttling/`.
- **Exposes**: `GET /products`, the product wire shape, and — new to this feature — a generic
  OpenAPI path registry in `src/shared/presentation/` that every context contributes to.
- **The one structural change beyond the new context.** Today
  `src/auth/presentation/openapi/openapi-document.ts` hand-registers all six routes, `/health`
  included. Publishing `GET /products` from there would make `auth` import `catalog` (FR21, AC-13).
  The registry therefore moves to `shared/presentation/`, each context exports its own path
  contributions, and `AppModule` assembles them — the same contribution shape ADR-0004 established
  for problem rows. This is hard to reverse and changes shipped 001 code, so it gets ADR-0005.

## File Structure

Add:

- `src/catalog/domain/product.ts`, `money.ts`, `catalog-page.ts`, `catalog-cursor.ts`,
  `errors.ts`, `ports/product-repository.ts`
- `src/catalog/application/list-catalog.usecase.ts`
- `src/catalog/infrastructure/dynamo/product.repository.ts`, `product.mapper.ts`
- `src/catalog/presentation/catalog.controller.ts`, `dto/list-catalog-query.schema.ts`,
  `dto/catalog-page.response.ts`, `catalog-problem-mappings.ts`, `catalog-openapi-paths.ts`
- `src/catalog/catalog.module.ts`
- `src/shared/presentation/openapi-registry.ts` (the relocated generic registry + its token)
- `scripts/seed-catalog.ts`
- `docs/architecture/adr/0005-*.md` (the registry relocation)
- tests mirroring the above under `test/unit/catalog/**`,
  `test/integration/catalog-listing.int-spec.ts`, `test/e2e/catalog/**`

Touch:

- `src/shared/persistence/table-keys.ts` — add `buildProductKey`
- `src/shared/presentation/problem-details.filter.ts` — two entries in `PROBLEM_CODES`
- `src/auth/presentation/openapi/openapi-document.ts` — reduced to auth's own path contributions
- `src/auth/presentation/openapi/problem-schema.ts` — follows the relocated registry if needed
- `src/app.module.ts` — import `CatalogModule`, assemble problem rows and OpenAPI paths
- `test/e2e/contract/openapi.e2e-spec.ts` — now asserts the catalog route too

## Technical Decisions

- **Replicate `auth`/`throttling` wholesale.** Same layering, same `Symbol` tokens, same
  typed-domain-error-mapped-at-the-edge strategy, same file placement. No divergence is proposed,
  so none needs justifying.
- **Key grammar `CATALOG#<accountId>` / `PRODUCT#<uuidv7>`** (FR3). A partition disjoint from
  `USER#<accountId>`, mirroring the reason throttling took `THROTTLE#`: the catalog will be the
  highest-volume item set in the table, and sharing a partition with session tokens makes a large
  catalog compete with the merchant's own sign-in.
- **`QueryCommand` from `@aws-sdk/lib-dynamodb`**, not `@aws-sdk/client-dynamodb` — the injected
  client is a `DynamoDBDocumentClient`, so keys are `Record<string, NativeAttributeValue>`.
- **`ConsistentRead: true`** on the listing query (FR16, AC-16). Single-partition query, so the cost
  is bounded at double the read units, and it removes the contradiction between an eventually
  consistent contract and read-after-write tests.
- **`nextCursor` derives from `LastEvaluatedKey`** (FR7), never from the last returned item. The
  SDK documents that a non-empty `LastEvaluatedKey` does not imply more data and that only an empty
  one means the end, so this is the only source that makes AC-4 true.
- **Cursor validation is positive** (FR10). `Buffer.from(s, 'base64url')` does not throw on
  malformed input — it discards invalid characters — so the decoder asserts the required shape
  (`PRODUCT#` prefix plus a well-formed UUIDv7) before the value is used. A foreign but well-formed
  cursor is honored against the caller's own partition (FR10a).
- **`422`, not `400`** (FR11, FR12), matching the status `auth-problem-mappings.ts` already uses for
  invalid request input, so the public contract stays internally consistent.
- **Decomposition axis: layer, not slice.** This feature is one coupled context plus one
  cross-cutting refactor; there is no second module to slice against, and the shared aggregation
  points (`table-keys.ts`, `PROBLEM_CODES`, `app.module.ts`, the registry) are touched by more than
  one step. Forcing a fake vertical slice here would clobber under parallel execution. The one
  genuine parallel opening is noted in `Implementation Order`.
- **Conventions consulted.** `typescript-conventions` and `naming-conventions` apply and are
  satisfied by the layering above: input enters as `unknown` and is parsed at the controller
  boundary, no `any`, `camelCase` in code with stored attribute names confined to the mapper.
  `postgres-conventions` does not apply — this project has no relational store.
- **Observability** (`observability-and-instrumentation`). The on-call questions are "is the catalog
  read failing, and for which account?" and "how slow is it?". One structured event,
  `catalog_query_failed`, carrying `accountId`, `durationMs` and `context`, answers the first;
  aggregate latency is already visible at the platform edge, so no per-request success log is added
  — that would be pure volume on a hot read path. `ALLOWED_LOG_FIELDS` already contains every field
  needed, so the allow-list does not change. Client-caused `422`s are not logged as errors.
- **An `IdGenerator` is needed by the seed path only.** Importing `auth`'s implementation would make
  `catalog` depend on a peer context's infrastructure. The seed script composes its own generator
  instead; no shared port is introduced for a need this small.

## Data Layer Contract

The table itself is unchanged — `scripts/create-table.ts` already provisions `PK`/`SK` with no index
and this feature needs none. What follows is the new item type it stores.

- **Code↔schema mapping**: `camelCase` in the domain (`id`, `name`, `sku`, `priceAmount`,
  `priceCurrency`, `createdAt`) ↔ stored attributes in `snake_case`, mapped in exactly one place,
  `src/catalog/infrastructure/dynamo/product.mapper.ts` (FR18, AC-21). No stored attribute name
  appears in the use case, the domain, or the response DTO.
- **Keys**: `PK = CATALOG#<accountId>`, `SK = PRODUCT#<uuidv7>`, both composed only by
  `buildProductKey` in the shared key grammar. The sort key is the ordering (FR4) and the cursor
  (FR8).
- **Types/constraints**: the price amount is stored as an integer in the currency's minor unit with
  a separate ISO-4217 code (FR20); `createdAt` is stored as an ISO-8601 UTC instant. No length or
  alphabet constraint on `name`/`sku` — validation belongs to the write feature (FR5b).
- **Indexes**: none. The listing is a partition query in sort-key order.
- **TTL**: the table enables TTL on the attribute `ttl`. The product mapper must never emit it, or
  products are deleted on DynamoDB's own schedule (FR19, AC-17). This is asserted, not assumed.
- **RLS**: `N/A` — DynamoDB has no row-level security. The equivalent guarantee is that the
  partition key is built solely from the verified token's account claim and never from client
  input (FR9), which AC-6 and AC-7a prove.
- **Migration**: `N/A` — additive item type on an existing table, no schema change, nothing to
  reverse.

## Implementation Order

1. **Relocate the OpenAPI path registry** to `src/shared/presentation/`, with each context
   contributing its own paths and `AppModule` assembling them; reduce
   `auth/presentation/openapi/openapi-document.ts` to auth's own contributions; keep the existing
   contract e2e green throughout. Write ADR-0005. (FR21, AC-13)
2. **Shared seams**: `buildProductKey` in `table-keys.ts`, and `INVALID_CURSOR` /
   `INVALID_PAGE_LIMIT` in `PROBLEM_CODES`. (FR3, FR14)
3. **Catalog domain**: `Money`, `Product`, `CatalogPage`, the cursor codec with positive
   validation, the `ProductRepository` port, typed errors. `sku` is a plain `string` — FR5b puts
   its validation in the write feature, so a value object here would guard no invariant. (FR4,
   FR10, FR20)
4. **Catalog infrastructure**: the Dynamo repository issuing one consistent query, and the mapper.
   (FR16, FR17, FR18, FR19)
5. **Catalog application**: `ListCatalog`, limit validation, cursor decoding, page assembly with
   `nextCursor` from the store marker. (FR5, FR6, FR7, FR12)
6. **Catalog presentation and wiring**: controller, query parsing including repeated-parameter
   rejection, response DTO, problem rows, path contributions, `CatalogModule`, `AppModule`
   assembly. (FR1, FR2, FR5a, FR11, FR13, FR22, FR23, FR24)
7. **Seed script and end-to-end coverage**, including cross-account isolation. (AC-6, AC-7a)

Step 3 is file-disjoint from steps 1 and 2 and could run alongside them; everything else serializes
on the shared files those steps touch.

## How to Validate

- **Unit** — the pure core, where most of this feature's risk lives: the cursor codec's roundtrip
  and its rejection of forged, truncated, and cleanly-decoding-but-wrong-shaped input; `Money`
  invariants; the full `limit` input table (non-numeric, empty, zero, negative, fractional,
  above cap); and `ListCatalog` against a fake repository. The fake is also where AC-4 is proven,
  because a genuinely short page from DynamoDB requires either a filter expression or roughly 1MB
  of items, and a test that cannot be built reliably is not a test.
- **Integration** — the repository against local DynamoDB: a real multi-page walk, ordering across
  distinct milliseconds (never within one, per FR4), one query per page, read-after-write
  visibility, and the absence of a TTL attribute on a stored item.
- **E2e** — the route as a client sees it: walking to `nextCursor === null`, both `422`s, the `401`,
  that no malformed input yields `503`, the published document describing the route and both codes,
  and cross-account isolation, which is this feature's security proof.
- **Quality checklist** — `.specify/gates/run-gates.sh` green; every `AC-N` cited by a task; no
  `@aws-sdk` import outside `infrastructure/`; functions 4–20 lines and files under 400; no `any`.
