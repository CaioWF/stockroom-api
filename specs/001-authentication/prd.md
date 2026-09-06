# Product Requirements Document (PRD)

> Product context (who the user is, what the product is, the north-star metric) lives in the
> brief at `.specify/memory/product.md`. This PRD **references** that brief and records only what
> is specific to THIS feature — do not repeat the user profile or the product's value proposition.

## Problem

- Stockroom has no way for a caller to prove who they are, so it has no way to scope a catalog to
  its owner or to refuse a stranger. Nothing else in the product can be built until that exists:
  the catalog listing has no owner to filter by, and the throttle has no identity to count against.
- The product's central problem (see `product.md`) is that exposing a catalog safely is more work
  than it looks. This feature owns two of the four concerns named there — sign-in and token
  expiry — and leaves pagination and throttling to `specs/003-product-catalog` and
  `specs/002-request-throttling`.
- The failure this feature prevents is the one that would make the product unusable rather than
  merely incomplete: a credential that leaks, a token that cannot be renewed without a fresh
  sign-in, or a session that cannot be ended once an attacker holds it.

## Hypothesis

- A caller who can register, sign in, and renew a token without re-entering credentials will
  integrate against Stockroom without a support conversation, which is the bar the product brief
  sets for the whole API.
- Short-lived access tokens with rotating refresh tokens should work because they move the
  expensive check off the request path: verification is a signature and an expiry, needing no
  database read, while the state that must be revocable lives on a single item that a conditional
  write can retire.
- Asymmetric signing with a published key set should work because it lets a second service verify
  a token without being able to issue one, which is what allows a legacy service to sit behind the
  same load balancer during a migration — the deployment shape `specs/004-cloud-infrastructure`
  builds toward.
- The hypothesis is falsifiable: if integrators still need a support conversation to authenticate,
  or if token renewal produces spurious sign-outs in normal use, the design is wrong.

## User/Context

- Inherits the target user from `.specify/memory/product.md`. This feature narrows it in one way:
  the account holder and the merchant are the same entity. One account owns one catalog, with no
  organization, membership, or role model. Multi-user merchants are deliberately deferred.
- Usage scenarios specific to this feature:
  - A developer creates an account and immediately calls the API to confirm the setup works.
  - A running integration renews an expiring token on a schedule, without human involvement.
  - A second service verifies a token Stockroom issued, without holding anything that lets it
    issue one.
  - An operator needs to know that a leaked token was replayed, rather than discovering it later.
- Constraints specific to this feature:
  - The product has no mail path, so nothing here may depend on sending email. That rules out
    email verification, password reset, and a generic-response registration flow.
  - Registration is public and reports duplicate addresses, so email enumeration is possible and
    is an accepted, recorded decision — settled in
    [ADR-0006](../../docs/architecture/adr/0006-accept-email-enumeration-at-registration.md).
  - There is no throttling until `specs/002-request-throttling`, so this feature ships no control
    whose absence would be load-bearing, and deliberately ships no account lockout: a lockout
    reachable by any stranger would be a denial of service against the account holder, with no
    unlock path in a product that cannot send mail.

## Success Metric

- **Primary:** a new integrator completes register → sign in → authenticated call using only the
  published contract, with no undocumented step. Measured by the end-to-end suite executing that
  exact sequence against the running application, and by the setup instructions being sufficient
  on a clean clone.
- **Supporting:**
  - Zero spurious session terminations in normal client behaviour — a repeated renewal, a
    concurrent double submission, or a second client restored from the same stored token must not
    end the account's other sessions.
  - A replayed spent token is either refused benignly or escalated to revocation, and every graced
    replay is observable in the logs.
  - Every route in the contract, including each rejection path, is covered by a test that asserts
    behaviour rather than internals.
- **Relation to the north-star:** the brief's north-star is weekly active integrations, counting
  distinct clients that successfully read the catalog. A client that cannot sign in never counts,
  so this feature is the precondition for the metric being non-zero rather than a contributor to
  it. This feature does not move the north-star; it makes it measurable.

## Dependencies & Interfaces

**Consumes (inputs)** — what this feature depends on to work:

- Managed key/parameter storage → the signing key pair, read once per running instance.
- Managed NoSQL storage → the single table holding accounts, email locks, and refresh tokens. The
  table is created locally by this feature's own bootstrap script; its production definition is
  owed by `specs/004-cloud-infrastructure`.
- The runtime's load balancer → the request envelope and the trace header used as a correlation
  id. This feature reads that shape but does not provision it.
- `.specify/memory/product.md` → product context, referenced rather than restated.

**Exposes (outputs)** — what this feature now offers to others:

- Registration, sign-in, and token renewal endpoints → consumed by `specs/005-catalog-console`
  and by any external integrator.
- A caller-identity endpoint → consumed by `specs/005-catalog-console`, and used here to give the
  route guard an observable acceptance criterion.
- The route guard and the caller identity it resolves → consumed by `specs/003-product-catalog`
  to scope a catalog to its owner, and by `specs/002-request-throttling` to count requests per
  identity.
- A published verification key set → consumed by any service that must validate a token without
  being able to issue one, which is the seam `specs/004-cloud-infrastructure` depends on for a
  second target behind the same balancer.
- A liveness endpoint → consumed by `specs/004-cloud-infrastructure` as the health-check target.
- A generated API contract → consumed by integrators and by `specs/005-catalog-console`.
- The shared persistence kernel — the storage client and the key grammar, owning neither domain
  types nor mappers → consumed by `specs/003-product-catalog` for its own items.

**Dependencies** — couplings with explicit direction:

- `specs/002-request-throttling` — **is unblocked by** this feature; it needs the caller identity
  to key a limit against. It also carries an obligation from here: this feature ships the auth
  routes with no rate control, and closing that is why throttling was moved ahead of the catalog.
- `specs/003-product-catalog` — **is unblocked by** this feature; it needs both the guard and the
  shared key grammar before it can scope or store anything.
- `specs/004-cloud-infrastructure` — **is unblocked by** this feature and owes it three
  constraints recorded during design: the balancer must route the auth paths, the key-set path,
  the liveness path, and the contract path; the target's header-handling mode must be set
  explicitly rather than left to a default; and the deployment artifact must be built for the
  runtime's own platform and architecture, which the password hash makes load-bearing.
- `specs/005-catalog-console` — **is unblocked by** this feature for its sign-in screen.
- No feature blocks this one. It is the first.

## Out of Scope

- **Sign-out.** Nothing here lets an account holder end a session early; the only revocation
  trigger is a detected token replay. This is the most significant deliberate gap and the first
  candidate for a later feature.
- **Password reset and email verification.** Both need a mail path the product does not have.
- **Account deletion and email change.** Both require retiring an email lock and writing a new one
  under an optimistic-concurrency guard; neither ships here, and no half-measure attribute is left
  behind in anticipation.
- **Multi-user merchants, roles, and permissions.** An account is a merchant.
- **Access-token revocation before expiry.** Revocation reaches refresh tokens only, so it takes
  effect within one access-token lifetime. That lifetime is therefore a security parameter, not a
  UX preference.
- **Rate limiting of any kind**, including per-account lockout — `specs/002-request-throttling`.
- **Products, pagination, cursors** — `specs/003-product-catalog`.
- **Infrastructure as code and deployment** — `specs/004-cloud-infrastructure`.
- **Any user interface** — `specs/005-catalog-console`.
- **Detection of an attacker who renews a stolen token before the legitimate client does.** Replay
  detection catches the attacker who replays second, not the one who arrives first; this is a known
  limit of the mechanism rather than an omission, bounded here by the absolute session ceiling and
  made observable by logging every benign replay as an anomaly.
