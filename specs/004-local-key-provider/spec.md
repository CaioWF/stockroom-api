---
status: approved
feature: 004-local-key-provider
date: 2026-09-06
---

# Local key provider — Spec

## User Stories

- As a developer running the app on a laptop, I want `npm run start:dev` to serve login, refresh,
  `/auth/me` and JWKS without an AWS account, so that the local server exercises the same routes
  the deployed one does. Accepted when a registered account can log in and call `/products` with
  the returned token, against local DynamoDB and no Parameter Store.

## Functional Requirements

- FR1: The auth module reads its RS256 signing key and verification key set from one of two
  sources: AWS Parameter Store, or the local PEM pair `npm run keys:generate` writes under `keys/`.
- FR2: The source is decided once, at environment parse time, and exposed on the parsed config as
  a two-value union. No other module tests the raw environment variable.
- FR3: `NODE_ENV` selects the source by allow-list: the exact value `development` selects the local
  pair, and every other value — including unset, empty, and a differently-cased spelling — selects
  Parameter Store. The Lambda runtime does not set `NODE_ENV`, so the deployed function must land
  on Parameter Store by default rather than by configuration.
- FR4: The local providers derive the `kid` exactly as the Parameter Store ones do, by RFC 7638
  thumbprint, so a token signed locally verifies locally.
- FR5: A missing or unparseable PEM fails the same way a Parameter Store fetch failure does, as an
  untyped error surfacing as `503 SERVICE_UNAVAILABLE`. This feature adds no problem code.
- FR6: The published contract, the routes, the use cases and the domain are unchanged. Only which
  adapter the composition root injects changes.

## Acceptance Criteria

- AC-1: Given `NODE_ENV=development` and a key pair under `keys/`, when an account registers and
  logs in against the locally running server with no AWS credentials for SSM, then login answers
  `200` with a token, and that token is accepted by `GET /products`.
- AC-2: Given a parsed environment, when `NODE_ENV` is `development`, then the config's key source
  is the local one; and when it is `production`, empty, unset, or `Development`, then the config's
  key source is Parameter Store.
- AC-3: Given a local key pair, when the signing provider and the verification provider both load
  it, then they derive the same `kid`.
- AC-4: Given `NODE_ENV=development` and a missing or malformed `keys/private.pem`, when a route
  that needs the signing key is called, then the response is `503` with code `SERVICE_UNAVAILABLE`
  and no new problem code appears.

## Out of Scope

- Key rotation, and more than one entry in the local verification key set.
- Any change to `SSMClient`'s construction. `AWS_ENDPOINT_URL_SSM` already reaches a local
  Parameter Store stand-in with no code change, and stays the option for anyone who wants one.
- Changing the e2e suite, which overrides both ports with an in-memory pair and must not start
  depending on `keys/`.
- Writing the local PEMs anywhere but `keys/`, and any new configuration for that path.
