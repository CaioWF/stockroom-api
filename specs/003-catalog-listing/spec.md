---
status: approved
feature: 003-catalog-listing
date: 2026-09-05
---

# Catalog listing — Spec

## User Stories

- As a merchant's application, I want to read my catalog one page at a time, so that I can consume
  a catalog larger than memory. Accepted when a walk over a multi-page catalog returns every
  product exactly once and terminates.
- As a merchant's application, I want to resume from a cursor I stored earlier, so that a restart
  does not force me to page from the beginning. Accepted when a cursor issued earlier still returns
  the items that follow it, with products added since appearing after them, never interleaved into
  pages already served.
- As a merchant, I want my catalog readable only by my own credentials, so that another account
  cannot enumerate my products. Accepted when a token for account B never yields a product of
  account A, whatever cursor it presents.
- As an integrator, I want malformed paging input answered with a precise, documented error, so
  that I can fix my client without reading server logs. Accepted when a bad `limit` or `cursor`
  yields a documented `422` naming which input was wrong, never a `500`-class answer.
- As an integrator, I want the endpoint described in the published contract, so that I can generate
  a client from it. Accepted when the OpenAPI document describes `GET /products` with its success
  and error responses.

## Functional Requirements

- FR1: A `GET /products` route returns the products belonging to the account named by the caller's
  verified access token, and only those.
- FR2: The route requires authentication. An absent or invalid token is answered by the existing
  `401` behavior, and no catalog data is read.
- FR3: The account's products are stored under a partition dedicated to the catalog, disjoint from
  the account's profile and session-token partition.
- FR4: Products are returned in a stable, total order defined by the sort key. The spec does not
  promise exact creation order, because the id generator is not monotonic within a millisecond.
- FR5: A page carries at most `limit` products, where `limit` is an optional query parameter that
  defaults to 25 and may not exceed 100.
- FR5a: The response body is a flat object with exactly two fields: `items`, the products in the
  order of FR4, and `nextCursor`. There is no envelope and no second end-of-list signal, so nothing
  can disagree with `nextCursor`.
- FR5b: A product is serialized as `id`, `name`, `sku`, `price`, and `createdAt`. `price` is an
  object carrying an integer `amount` and a `currency` code. `createdAt` is an ISO-8601 instant in
  UTC. `name` and `sku` are strings whose length and alphabet this spec deliberately does not
  constrain — nothing here writes a product, so the validation belongs to the feature that does.
- FR6: Every response carries a `nextCursor` field. It is `null` when, and only when, the store
  reports no further results.
- FR7: `nextCursor` is derived from the store's own end-of-page marker, never from the last
  returned item, so that a full final page is still distinguishable from a page with more behind it.
- FR8: A client that supplies `cursor` receives the products that follow that position in the
  order of FR4.
- FR9: The cursor is opaque to the client and carries no partition information. The server derives
  the partition solely from the verified token's account claim.
- FR10: A cursor is accepted only when it positively matches its required shape — the product sort
  key prefix followed by a well-formed UUIDv7. It is never accepted merely because decoding did not
  fail.
- FR10a: A well-formed cursor naming a position that does not exist in the caller's own partition —
  one issued for another account, or one whose product was since removed — is honored rather than
  rejected: the listing returns whatever follows that position for the caller. It is not an error,
  it reads nothing belonging to anyone else, and it costs no extra query. The consequence is that a
  client reusing a foreign cursor sees a partial catalog rather than a failure.
- FR11: A rejected cursor yields `422` with the problem code `INVALID_CURSOR`.
- FR12: A `limit` that is non-numeric, empty, zero, negative, fractional, or above the maximum
  yields `422` with the problem code `INVALID_PAGE_LIMIT`. It is never silently clamped.
- FR13: A repeated query parameter is rejected rather than coerced to one of its values, on any
  transport that surfaces the repetition.
- FR14: Both new problem codes are added to the shared closed code set, contributed as this
  context's mapping rows, and assembled at the composition root, so the published contract and the
  emitted responses cannot disagree.
- FR15: Each new mapping row states its message-exposure decision explicitly rather than relying on
  the default.
- FR16: The listing query reads consistently, so a product already written is visible to the read
  that follows it.
- FR17: The listing issues one store query per page.
- FR18: DynamoDB attribute names appear only inside the catalog's persistence adapter, never in the
  use case, the domain, or the public contract.
- FR19: The stored product item never carries the table's TTL attribute.
- FR20: A product's price is represented as an integer amount in the currency's minor unit together
  with an ISO-4217 currency code. A fractional or negative amount is not representable.
- FR21: The OpenAPI path registry is generic machinery in the shared layer; each bounded context
  contributes its own paths and the composition root assembles them. No bounded context registers
  another context's paths.
- FR22: The published OpenAPI document describes `GET /products`, its success response, and each
  error status it can answer.
- FR23: The route is rate limited per account by the existing throttling, with no new throttling
  code and no exemption.
- FR24: A protected route reaching the handler without auth claims remains a wiring defect answered
  by the existing `503` mapping. No malformed client input can reach that path.

## Acceptance Criteria

- AC-1: Given a catalog of more products than one page holds, when a client walks pages until
  `nextCursor` is `null`, then it receives every product exactly once and no product twice.
- AC-2: Given a catalog with fewer products than the limit, when the client requests a page, then
  all products are returned and `nextCursor` is `null`.
- AC-3: Given an empty catalog, when the client requests a page, then the item list is empty and
  `nextCursor` is `null`, and the response is `200`, not an error.
- AC-4: Given a page whose returned item count is lower than the requested limit while the store
  still reports more results, when the client inspects the response, then `nextCursor` is not
  `null` — proving a client must stop on the cursor and never on a short page.
- AC-5: Given a cursor obtained from an earlier page, when products are added afterwards and the
  client resumes from that cursor, then it sees the items that followed it, and the new products
  appear after them rather than inside pages already served.
- AC-6: Given accounts A and B each holding products, when B lists the catalog with any cursor,
  including one issued to A, then no product of A is returned.
- AC-7: Given a cursor that decodes cleanly but does not match the required shape, when it is
  supplied, then the response is `422` with code `INVALID_CURSOR` and no store query is issued.
- AC-7a: Given a well-formed cursor issued to account A, when account B supplies it, then the
  response is `200` carrying only B's own products from that position onward, and never a product
  of A.
- AC-22: Given a page response, when its body is inspected, then it carries exactly `items` and
  `nextCursor` at the top level, each product carries `id`, `name`, `sku`, `price` and `createdAt`,
  `price` carries an integer `amount` with a `currency` code, and `createdAt` parses as an ISO-8601
  UTC instant.
- AC-8: Given a `limit` that is non-numeric, empty, zero, negative, fractional, or above the
  maximum, when it is supplied, then the response is `422` with code `INVALID_PAGE_LIMIT`, one case
  per input class.
- AC-9: Given no `limit`, when the client requests a page, then at most the default page size is
  returned.
- AC-10: Given any malformed paging input, when the request is served, then the response is never
  `503` — the parser's own typed errors are what reach the problem filter.
- AC-11: Given a repeated query parameter on a transport that surfaces the repetition, when the
  request is served, then it is rejected rather than resolved to one value.
- AC-12: Given the published OpenAPI document, when it is generated, then it describes
  `GET /products` with its success and error responses, and its `code` enum contains
  `INVALID_CURSOR` and `INVALID_PAGE_LIMIT`.
- AC-13: Given the OpenAPI registry after this feature, when a bounded context publishes a path,
  then it contributes it from its own module, and no context imports a peer to register a path.
- AC-14: Given a request without a valid token, when `GET /products` is called, then the response is
  `401` and no catalog data is read.
- AC-15: Given an account that has exceeded its authenticated request quota, when it calls
  `GET /products`, then it receives the existing `429` with its retry hint, with no throttling code
  added by this feature.
- AC-16: Given a product written to the store, when the listing query runs immediately afterwards,
  then the product is visible.
- AC-17: Given a stored product item, when it is read back from the table, then it carries no TTL
  attribute and is not subject to expiry.
- AC-18: Given a page request, when it is served, then exactly one store query is issued.
- AC-19: Given two products written in the same millisecond, when the catalog is listed, then both
  appear exactly once and the walk terminates. Their relative order is not asserted.
- AC-20: Given a price, when it is constructed, then a fractional or negative amount is rejected,
  and the serialized form carries an integer minor-unit amount with an ISO-4217 code.
- AC-21: Given the catalog's persistence adapter, when the codebase is inspected, then DynamoDB
  attribute names and the AWS SDK appear only inside it, and never in the use case, the domain, or
  the response contract.

## Out of Scope

- Any write path: creating, updating, or deleting a product. A later feature owns it and must write
  records in the shape this spec fixes.
- Filtering, search, alternative sort orders, and field selection.
- Delegated access. One account reads its own catalog; there is no authorization model for a third
  party reading on a merchant's behalf.
- Media, variants, categories, and stock levels.
- Giving the catalog its own rate-limit quota. The shared authenticated counter is an accepted
  cost, recorded in the PRD.
- The production table and the ALB target-group configuration that FR13 needs on the Lambda
  transport. Both belong to the infrastructure feature; until it lands, FR13 is provable only on
  the local transport.
- Making the id generator monotonic within a millisecond, which is why FR4 promises a stable total
  order rather than creation order.
- Length and alphabet constraints on `name` and `sku`. Per FR5b these belong to the write feature,
  which is the only place input validation can run.
- Detecting that a cursor was issued for a different account. Per FR10a a foreign cursor is honored
  against the caller's own partition rather than rejected, which is safe but silently partial.
