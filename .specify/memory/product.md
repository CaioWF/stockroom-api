# Product Brief

> The project's **product** layer (the counterpart to the constitution, which is the
> **engineering** layer). Written once per project, before the first feature. Each feature's
> `prd.md` REFERENCES this brief instead of repeating the product context — who the user is, why
> the product exists, the north-star metric. Keep it short and durable; whatever changes with
> each feature lives in the PRD, not here.

## Product

- Stockroom is a hosted product-catalog API: a merchant registers their goods once, and any
  application they own or authorize reads that catalog over HTTP through an authenticated,
  paginated, rate-limited endpoint.
- It exists because a catalog is the first backend every commerce-adjacent product needs and the
  last one anybody wants to build twice. The read path is the same everywhere — authenticate the
  caller, page through items, survive traffic spikes — so it is worth solving once as a service
  instead of re-implementing it per project.

## User

- Small teams and solo builders shipping a storefront, an internal ordering tool, a marketplace
  integration, or a mobile app, who need a catalog behind an API but have no platform team to
  build and operate one.
- Jobs to be done:
  - Sign in with an account and obtain a short-lived token to call the API on behalf of a merchant.
  - List the catalog page by page from a client that cannot hold the whole dataset in memory.
  - Keep serving reads while one noisy caller hammers the endpoint.
  - Read the API contract and integrate without asking anyone how it works.

## Problem & Value Proposition

- The problem: exposing a catalog safely is more work than it looks. Sign-in, token expiry, stable
  pagination over a growing dataset, and per-caller throttling are each a small project, and
  getting any of them wrong shows up as a leak, a broken client, or an outage.
- The value proposition: Stockroom ships those four concerns as one contract, priced to sit idle.
  The alternative is either a hand-rolled service that re-learns the same edge cases, or a full
  commerce platform whose catalog is welded to a checkout, an admin UI, and a pricing model the
  team did not ask for. Stockroom is only the catalog, and it is documented well enough to
  integrate against without a support conversation.

## North-star Metric

- Weekly active integrations: distinct API clients that successfully read the catalog at least
  once in a rolling seven-day window.
- It is the metric that moves only when the product works end to end — a client that cannot sign
  in, cannot page, or is throttled into failure does not count. Per-feature measures (token
  issuance latency, pagination throughput, throttle accuracy) live in each `prd.md`.

## Non-goals

- Not an inventory or ERP system: Stockroom does not track stock levels, warehouses, purchase
  orders, or fulfillment.
- Not a commerce platform: no cart, no checkout, no payments, no orders, no shipping.
- Not a marketplace: a catalog belongs to one merchant, and the product does not broker discovery
  or transactions between merchants and end consumers.
- Not a CMS or a DAM: it stores product records, not rich editorial content or media libraries.
- Not an identity provider: it signs callers into Stockroom and issues nothing another system
  should trust as a general-purpose identity.
