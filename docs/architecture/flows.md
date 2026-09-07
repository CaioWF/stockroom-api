---
type: flow
title: Request flows — login and product listing
description: Sequence diagrams for the two flows the challenge asks for — user authentication and the paginated, rate-limited product listing.
---

# Request flows

Sequence diagrams for the two flows the SWE Challenge brief asks for: signing in securely, and
reading the catalog through the protected, paginated, rate-limited endpoint.

## Login

`POST /auth/login` is public but IP-throttled (`credentials` group). Both rejection branches —
unknown email and wrong password — return the same `401` with a dummy argon2 verify on the
unknown-email path, so failed attempts cannot be used to enumerate accounts by timing (see
[ADR-0006](adr/0006-accept-email-enumeration-at-registration.md) for the related registration
trade-off).

```mermaid
sequenceDiagram
    actor Client
    participant TG as ThrottleGuard (ip, credentials)
    participant AC as AuthController
    participant UC as AuthenticateAccount
    participant UR as UserRepository (DynamoDB)
    participant PH as PasswordHasher (argon2id)
    participant TS as AccessTokenSigner (RS256)
    participant RR as RefreshTokenRepository (DynamoDB)

    Client->>TG: POST /auth/login {email, password}
    TG->>TG: count this IP in the "credentials" window
    alt rate limit exceeded
        TG-->>Client: 429 Too Many Requests (Retry-After)
    else admitted
        TG->>AC: forward request
        AC->>UC: execute(email, password)
        UC->>UR: findByEmail(email)
        UR-->>UC: account or undefined
        UC->>PH: verify(password, digest)
        alt invalid credentials (unknown email or wrong password)
            UC-->>AC: InvalidCredentialsError
            AC-->>Client: 401 Unauthorized (uniform body, no enumeration)
        else valid
            UC->>TS: sign({accountId, email})
            TS-->>UC: accessToken (RS256, kid, exp)
            UC->>RR: issue(refreshToken digest, ttl)
            UC-->>AC: {accessToken, refreshToken, expiresIn, refreshExpiresIn}
            AC-->>Client: 200 OK
        end
    end
```

Every other route defaults to protected. `JwtAuthGuard` is registered globally and runs before any
handler, verifying the access token against the current JWKS before letting the request through:

```mermaid
sequenceDiagram
    actor Client
    participant JG as JwtAuthGuard
    participant JWKS as VerificationKeySetProvider
    participant Route as Protected route

    Client->>JG: GET /products (Authorization: Bearer token)
    JG->>JG: extract bearer token
    JG->>JWKS: getVerificationKeys()
    JWKS-->>JG: trusted keys by kid
    alt token invalid, expired, wrong alg, or unknown kid
        JG-->>Client: 401 Unauthorized (uniform, no reason leaked)
    else verified
        JG->>JG: attach authClaims {accountId, email} to the request
        JG->>Route: allow
    end
```

## Product listing (paginated, rate-limited)

`GET /products` sits behind `JwtAuthGuard` (above) and `AccountThrottleInterceptor`
(account-scoped, not IP-scoped — the caller is already known). Admission is decided by a weighted
sliding-window counter in DynamoDB; if that store is slow or unreachable, the use case fails open
to a coarse per-instance limiter rather than blocking every caller on one dependency
([ADR-0002](adr/0002-approximate-sliding-window-counter-in-dynamodb.md),
[ADR-0003](adr/0003-fail-open-when-the-throttling-path-fails.md)).

```mermaid
sequenceDiagram
    actor Client
    participant JG as JwtAuthGuard
    participant TI as AccountThrottleInterceptor
    participant RL as DecideRequestAdmissionUseCase
    participant CC as CatalogController
    participant LU as ListCatalog
    participant PR as ProductRepository (DynamoDB)

    Client->>JG: GET /products?limit=25&cursor=... (Bearer token)
    JG->>JG: verify token, attach authClaims
    JG->>TI: allow
    TI->>RL: decide({scope: "account", identity: accountId, routeGroup: "default"})
    RL->>RL: weighted sliding-window count in DynamoDB
    alt store degraded (timeout or error)
        RL->>RL: fall back to per-instance local limiter (fail-open)
    end
    alt over limit
        RL-->>TI: refused(retryAfterSeconds)
        TI-->>Client: 429 Too Many Requests (Retry-After)
    else admitted
        RL-->>TI: admitted
        TI->>CC: forward request
        CC->>LU: execute({limit, cursor})
        LU->>LU: validate limit (1-100) and decode cursor
        LU->>PR: list({limit, cursor})
        PR-->>LU: {items, nextCursor}
        LU-->>CC: {items, nextCursor}
        CC-->>Client: 200 OK {items, nextCursor}
    end
```
