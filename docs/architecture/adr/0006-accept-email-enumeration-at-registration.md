---
type: adr
title: Accept email enumeration at registration
description: Registration keeps answering 409 on a duplicate address, and the leak is accepted rather than mitigated, because every available mitigation either relocates the oracle or requires a mail path the product does not have.
---

# ADR-0006: Accept email enumeration at registration

- **Status:** accepted
- **Date:** 2026-09-06
- **Decision makers:** caiowf

## Context

`POST /auth/register` answers `409` with code `EMAIL_ALREADY_REGISTERED` when the address is
taken (`specs/001-authentication/spec.md:142-148`). That confirms an address is registered to any
unauthenticated caller, which is account enumeration.

001 saw this and recorded it as accepted in three places
(`specs/001-authentication/spec.md:235`, `prd.md:50`, `brainstorm.md:172`), but recorded it as a
deferral rather than a decision: "`002` revisits whether per-source throttling alone is enough,
or whether registration needs a challenge."

`002` never revisited it. Searching `specs/002-request-throttling/` for enumeration, challenge or
CAPTCHA returns only unrelated matches — the originating PDF's name and an "enumerated" exemption
list. What `002` did ship that bears on this: `/auth/register` carries
`@ThrottleGroup('credentials')` (`src/auth/presentation/auth.controller.ts:58`), so probing is
capped per client address at `THROTTLE_CREDENTIALS_LIMIT` requests per
`THROTTLE_CREDENTIALS_WINDOW_SECONDS` — 10 per 60 seconds by default
(`src/shared/config/environment.schema.ts:14-15`).

So the mitigation shipped and the evaluation of whether it suffices never happened. A reader of
001's spec today sees an open promise, which reads as an oversight. This ADR closes it with an
actual decision.

The forcing constraint is unchanged since 001: the product has no mail path
(`specs/001-authentication/prd.md:48-50`), and nothing on the roadmap adds one.

## Decision

We will keep answering `409` `EMAIL_ALREADY_REGISTERED` on a duplicate registration, and accept
email enumeration as a known leak rather than mitigating it.

The deferral in 001 is resolved here: per-source throttling is the only control this leak gets,
and that is deliberate. Closing it is not a goal of this project, which exists to demonstrate an
authenticated, paginated, rate-limited catalog read path.

## Alternatives considered

- **Generic `202 "check your inbox"` response without actually sending mail** — rejected because
  it relocates the oracle instead of closing it. If the account stays usable immediately, an
  attacker registers the target address with a password of their own choosing, receives the
  generic `202`, then calls `POST /auth/login` with that password: `200` means the address was
  free, `401` means it was taken. Same fact, two requests instead of one. This is the shape 001
  already rejected as a half defence.
- **Idempotent success when a duplicate registration presents the same password** — rejected, and
  worse than the status quo: it turns `/auth/register` into a credential-checking oracle rather
  than only an existence oracle.
- **Pending account state plus an activation token, with a logging mail adapter standing in for a
  real provider** — the only alternative that actually closes the leak, and rejected on
  proportionality. It requires a pending account state, an activation route, and a `/auth/login`
  that answers identically for absent, pending, and wrong-password, which rewrites the sign-in
  path 001 shipped. It also requires the stand-in adapter to expose the activation token
  somewhere readable, and an adapter like that reaching production would trade a low-severity
  enumeration leak for a total activation bypass.
- **A challenge on registration (proof-of-work or CAPTCHA)** — rejected. It raises the cost of
  bulk probing without removing the leak, and it puts friction, and in the CAPTCHA case a
  third-party dependency, on the product's first touch.
- **Dummy argon2 hash on the sign-in miss path** — already rejected inside 001
  (`brainstorm.md:174-177`) and not revived here. Registration leaks the same fact in one
  unauthenticated request, so the defence spends an argon2 execution per miss to close one door
  while its neighbour stands open.

## Consequences

- **Positive:** 001's dangling promise is resolved, so the spec no longer reads as though a
  security review were still pending. Sign-in needs no timing equalization, because the timing
  difference leaks nothing the `409` does not already give away. No account lockout is needed,
  which keeps a stranger from being able to lock a merchant out of a product that has no unlock
  route and cannot send mail.
- **Negative / trade-offs:** any unauthenticated caller can test whether an address is registered,
  at roughly 10 probes per minute per client address, and that rate is trivially multiplied by
  using more source addresses. Anyone who can reach registration can learn whether a given
  merchant uses this product. The leak is accepted, not bounded by anything stronger than the
  throttle.
- **Neutral:** the severity is currently limited by the product having no password-reset flow for
  an attacker to aim at a confirmed address. Whether that stays true is unknown — a console
  (`specs/005-catalog-console`) that ships password reset would change the calculation, and is
  the trigger to supersede this ADR. A mail path entering the product is the other trigger.

## Related

- [Fail open when the throttling path fails](0003-fail-open-when-the-throttling-path-fails.md) —
  the throttle that caps probing is resource control and admits the request when it breaks, so it
  is not a security boundary this decision can lean on.
