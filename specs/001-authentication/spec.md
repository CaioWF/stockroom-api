---
status: approved
feature: 001-authentication
date: 2026-09-03
---

# Authentication — Spec

## User Stories

- **As a developer evaluating Stockroom, I want to create an account and immediately call the API,
  so that I can confirm the setup works without talking to anyone.**
  Accepted when registration, sign-in, and an authenticated call succeed in sequence using only
  the published contract, and when a duplicate address or a weak password is refused with a reason
  the caller can act on.

- **As a running integration, I want to renew my token on a schedule, so that I keep working
  without a human re-entering credentials.**
  Accepted when a valid refresh token returns a fresh pair, when the presented token stops working
  afterwards, and when ordinary client behaviour — a retry, a double submission, a second process
  restored from the same stored token — never ends the account's other sessions.

- **As an operator, I want a replayed token to be either refused or escalated, so that a leak is
  visible rather than silent.**
  Accepted when replaying a spent token is refused, when a replay that proves two live chains
  revokes every outstanding token for the account, and when both outcomes are observable in the
  logs.

- **As a neighbouring service behind the same load balancer, I want to verify a token without
  being able to issue one, so that trust flows one way.**
  Accepted when the published key set is fetchable without authentication and a token signed with
  anything other than the pinned algorithm is refused.

## Functional Requirements

**Accounts**

- **FR1** — `POST /auth/register` accepts an email and a password and creates an account,
  returning the account's id and normalized email. It does **not** return tokens: token issuance
  belongs to sign-in alone, so there is a single audited path that mints credentials.
- **FR2** — The email is normalized before it is stored or compared: trim, NFC, then
  locale-invariant lowercasing of the **entire** address, local part included. RFC 5321 permits a
  case-sensitive local part, but no mainstream provider treats it that way, and honouring the
  letter of the rule would let `Foo@example.com` and `foo@example.com` become two accounts —
  a trap for the account holder rather than a feature.
- **FR3** — A password is accepted only at 12 to 128 characters, measured after NFC
  normalization. No composition rules are imposed.
- **FR4** — An email address belongs to at most one account. Concurrent registrations of the same
  address resolve so that exactly one succeeds.
- **FR5** — Passwords are stored only as an argon2id digest, with OWASP's parameters: 19 MiB of
  memory, two iterations, one degree of parallelism. The plaintext is never persisted, logged, or
  returned.

**Tokens**

- **FR6** — `POST /auth/login` verifies credentials and returns an access token, a refresh token,
  and each token's remaining lifetime **in seconds** (`expiresIn`, `refreshExpiresIn`). Relative
  seconds rather than absolute timestamps, so a client whose clock is skewed still renews on time.
  Every failure returns one indistinguishable rejection.
- **FR7** — Access tokens live 15 minutes, refresh tokens 7 days, and a session may not be
  extended beyond an absolute ceiling of 30 days. All three are configuration with those defaults.
- **FR8** — Access tokens are JWTs signed RS256 with a key whose `kid` is its RFC 7638 thumbprint,
  carrying the account id as subject, the account's email as an informational claim, plus issuer,
  audience, and expiry. Issuer and audience are configuration; both default to the service's own
  base URL.
- **FR9** — `GET /.well-known/jwks.json` publishes every currently trusted verification key,
  without authentication, with an explicit cache lifetime.
- **FR10** — All identifiers — account ids and refresh-token ids — are UUIDv7 (RFC 9562): 36
  characters, hexadecimal with hyphens, time-ordered. The fixed shape is what lets FR14 bound the
  segments precisely, and the ordering keeps an account's tokens grouped by time when a human
  inspects storage.

**Access control**

- **FR11** — Route access is denied by default. Exactly six routes are public: register, login,
  refresh, the key set, liveness, and the API contract. Every other route requires a valid access
  token.
- **FR12** — Token verification pins RS256, requires a `kid` present in the trusted set, and
  validates issuer, audience, and expiry. A token presenting any other algorithm is refused.
- **FR13** — `GET /auth/me` returns the authenticated caller's account id and email, both resolved
  from the token; the route performs no storage read. The email travels as an **informational
  claim**: no authorization decision anywhere reads it, and authorization is by subject alone. A
  later email change revokes the account's refresh tokens through the same generation counter that
  replay detection uses, so a stale claim can outlive the change by at most one access-token
  lifetime. That bound is only safe while the claim stays informational, which is why the
  prohibition is stated here rather than left to judgement.

**Refresh and revocation**

- **FR14** — A refresh token is presented as three base64url segments — account id, token id,
  secret — parsed into a typed value at the trust boundary before any storage key is built. The
  two id segments must match the UUIDv7 shape exactly and the secret must be the expected length
  for 256 bits; anything else is refused there.
- **FR15** — Only a SHA-256 digest of the refresh secret is stored, and it is compared in
  constant time.
- **FR16** — `POST /auth/refresh` retires the presented token and issues a successor in one atomic
  operation, conditioned on the account's revocation generation being unchanged. A partial outcome
  is not possible.
- **FR17** — A successor's expiry is the earlier of the refresh lifetime and the account's
  absolute session ceiling, so no token is issued that the ceiling would later refuse.
- **FR18** — Presenting an already-retired token is classified by its successor: if the successor
  is still the live, unrotated tip, the call is refused alone and recorded as an anomaly; if the
  successor has itself been rotated, every outstanding refresh token for the account is revoked.
  The classification travels out of the use case as a value; the presentation layer is what emits
  the anomaly event, so recording it never puts a logger inside the application layer.
- **FR19** — Revocation is a single atomic increment of a generation counter on the account.
  Tokens minted under an earlier generation are refused.

**Time and storage**

- **FR20** — Token expiry, the session ceiling, and every other time comparison read from an
  injected clock, never from the system clock directly.
- **FR21** — Expiry is enforced in application logic. Storage-level expiry is treated as cleanup
  only, and a stored item that is past its expiry but not yet collected is still refused.
- **FR22** — All items live in one table whose name is configuration.
- **FR23** — No storage-engine error reaches the caller. Adapters translate every failure into a
  typed domain or infrastructure error.

**Contract, transport, observability**

- **FR24** — Every error response is an RFC 9457 problem document (`type`, `title`, `status`,
  `detail`, `instance`) carrying an additional `code` drawn from a closed, enumerated set —
  `EMAIL_ALREADY_REGISTERED`, `PASSWORD_LENGTH_INVALID`, `EMAIL_INVALID`, `INVALID_CREDENTIALS`,
  `INVALID_REFRESH_TOKEN`, `INVALID_ACCESS_TOKEN`, `SERVICE_UNAVAILABLE`. Because the contract is
  generated from the same schemas that validate requests, that set is published as a discriminated
  union and a client can handle it exhaustively.
- **FR25** — `GET /health` reports liveness without reading storage or acquiring a signing key.
- **FR26** — The OpenAPI document is generated from the same schemas that validate requests and is
  served at a public route.
- **FR27** — The function handler returns a well-formed load-balancer response envelope for every
  outcome, including a failure to initialize the application.
- **FR28** — Logs are structured JSON emitting only allow-listed fields, and carry a correlation
  id taken from the inbound trace header only when it matches the expected grammar, generated
  otherwise.

## Acceptance Criteria

- **AC-1** — Given no account for `merchant@example.com`, when a client posts that address with a
  valid password to `/auth/register`, then the response is `201` carrying the new account id and
  the normalized email, with no token and no password material in the body.
- **AC-2** — Given an existing account for an address, when a client registers the same address
  differing only in case or surrounding whitespace, then the response is `409` with code
  `EMAIL_ALREADY_REGISTERED` and no second account exists.
- **AC-3** — Given a password of 11 characters, and separately one of 129, when either is posted
  to `/auth/register`, then the response is `422` with code `PASSWORD_LENGTH_INVALID`, and no
  account is created.
- **AC-4** — Given two clients registering the same address simultaneously, when both requests are
  in flight, then exactly one receives `201`, the other receives `409`, and storage holds one
  account and one email lock.
- **AC-5** — Given a registered account, when the correct credentials are posted to `/auth/login`,
  then the response is `200` carrying an access token, a refresh token, and both remaining
  lifetimes in seconds.
- **AC-6** — Given a registered account, when the wrong password is posted, and separately when an
  unregistered address is posted, then both responses are `401` with an identical body, including
  the same code `INVALID_CREDENTIALS`.
- **AC-7** — Given an account created moments earlier, when its first sign-in is attempted, then it
  succeeds — the read path does not miss a just-committed account.
- **AC-8** — Given an access token from a successful sign-in, when it is sent to `GET /auth/me`,
  then the response is `200` carrying that account's id and email, and no storage read occurs
  while serving it.
- **AC-9** — Given no credential, when `GET /auth/me` is called, then the response is `401`.
- **AC-10** — Given the public key fetched from the published key set, when a token is signed
  HS256 using that key as the secret and sent to `GET /auth/me`, then the response is `401`.
- **AC-11** — Given a token whose `kid` is absent from the trusted set, and separately a token
  past its expiry, when either is sent to a guarded route, then the response is `401`.
- **AC-12** — Given a route that is not on the public list, when it is called without a
  credential, then it is refused — the default is denial, not permission.
- **AC-13** — Given no authentication, when `GET /.well-known/jwks.json` is fetched, then the
  response is `200` carrying every trusted verification key, each with a `kid` equal to its RFC
  7638 thumbprint, and an explicit cache lifetime header.
- **AC-14** — Given a valid refresh token, when it is posted to `/auth/refresh`, then the response
  is `200` with a new pair, and posting the original token again no longer yields a new pair.
- **AC-15** — Given a refresh token that has been rotated once and whose successor has not been
  used, when the original is presented again, then the response is `401`, the successor still
  works, and the event is recorded as an anomaly.
- **AC-16** — Given a refresh token that has been rotated and whose successor has also been
  rotated, when the original is presented again, then the response is `401` and every outstanding
  refresh token for that account, including the live tip, is subsequently refused.
- **AC-17** — Given two requests presenting the same valid refresh token simultaneously, when both
  are in flight, then exactly one receives a new pair, the other is refused, and no second live
  chain exists.
- **AC-18** — Given a refresh token past its expiry, and separately a session that has reached the
  absolute ceiling, when either is presented, then the response is `401`, including when the
  stored item has not yet been collected by storage-level expiry.
- **AC-19** — Given a session close to its absolute ceiling, when the token is renewed, then the
  successor's remaining lifetime does not extend past the ceiling.
- **AC-20** — Given a refresh token string that is malformed — wrong segment count, an id segment
  that is not a UUIDv7, or a secret of the wrong length — when it is posted to `/auth/refresh`,
  then the response is `401` with code `INVALID_REFRESH_TOKEN` and no storage-engine error text
  appears in the response or the logs.
- **AC-21** — Given a refresh token whose account id names one account and whose token id belongs
  to another, when it is presented, then the response is `401` and no data from either account is
  returned.
- **AC-22** — Given a running application, when `GET /health` is called, then the response is
  `200` and no storage read and no key acquisition occurs while serving it.
- **AC-23** — Given the application fails to initialize, when the handler is invoked with a
  load-balancer event, then it returns a well-formed response envelope with status `503` rather
  than throwing — a failed start is unavailability the balancer may retry, not a request error.
- **AC-24** — Given a request carrying a trace header that does not match the expected grammar,
  when it is handled, then the emitted correlation id is a generated one and the supplied value is
  not used.
- **AC-25** — Given a successful sign-in and a successful renewal, when the emitted logs are
  inspected, then no password, access token, refresh token, authorization header, or password
  digest appears in any field.
- **AC-26** — Given the running application, when the OpenAPI document is fetched without a
  credential, then it is served, describes every route in this specification, and enumerates the
  error codes as a closed set.
- **AC-27** — Given any rejected request handled by an application route, when its response body
  is inspected, then it is an RFC 9457 problem document whose `code` is a member of the enumerated
  set and whose `status` matches the HTTP status line. A request to an unmatched route (no
  application route exists) is out of this contract's scope — it returns Nest's own 404 shape,
  not a problem document.

## Out of Scope

- Sign-out, password reset, email verification, account deletion, and email change. All are
  excluded; the first three require a mail path the product does not have, and the remaining two
  require an optimistic-concurrency guard that is introduced with the operations that need it
  rather than left behind unused.
- Multi-user merchants, roles, and permissions. An account is a merchant.
- Revoking an access token before it expires. Revocation reaches refresh tokens only, so it takes
  effect within one access-token lifetime.
- Detecting an attacker who renews a stolen token *before* the legitimate client does. `AC-15` and
  `AC-16` cover the attacker who replays second; the one who arrives first is indistinguishable
  from the legitimate holder, which is a known limit of the mechanism, bounded by the session
  ceiling and made visible by the anomaly record.
- Key rotation as an operation. The design fixes the order it must follow and the contract serves
  a set rather than a single key, so rotation is possible; performing one is not part of this
  feature.
- Rate limiting of any kind, including per-account lockout — `specs/002-request-throttling`.
- Products, pagination, and cursors — `specs/003-product-catalog`.
- Infrastructure as code, deployment, and the load-balancer routing rules this feature depends on
  — `specs/004-cloud-infrastructure`.
- Any user interface — `specs/005-catalog-console`.
- Email enumeration is not mitigated. Registration reports duplicates, so an address can be
  probed; the decision is recorded rather than defended, and is revisited in
  `specs/002-request-throttling`.
