---
status: approved
---

# Local key provider — Plan

## Architecture

Both key ports already exist and both already have a second implementation in the e2e suite, so
this adds adapters rather than abstractions. `SigningKeyProvider` and `VerificationKeySetProvider`
(`src/auth/domain/ports/`) each gain a filesystem adapter beside the Parameter Store one. The
adapters mirror the existing pair: memoize the promise on first use, derive `kid` through
`importPKCS8`/`importSPKI` then `exportJWK` then `calculateJwkThumbprint`, and let failures
propagate untyped, since `SERVICE_UNAVAILABLE` is deliberately untyped per
`src/auth/domain/errors.ts`.

The selection is normalized in `parseAppConfig` rather than spread through the module: the schema
reads `NODE_ENV` as an optional string and the mapper turns it into `AppConfig.keySource`, a
`'filesystem' | 'parameter-store'` union. `auth.module.ts`'s two factories then branch on an
already-decided union, so the raw environment value is tested in exactly one place, and that place
is a pure function a unit test can drive.

Data flow is unchanged. `AuthenticateAccount`, `Rs256AccessTokenSigner` and `JwtAuthGuard` keep
talking to the ports; only the injected adapter differs.

## File Structure

- `src/auth/infrastructure/keys/file-system-signing-key.provider.ts` — new
- `src/auth/infrastructure/keys/file-system-verification-key-set.provider.ts` — new
- `src/shared/config/environment.schema.ts` — `NODE_ENV` in the schema, `keySource` on `AppConfig`
- `src/auth/auth.module.ts` — the two factories branch on `config.keySource`
- `test/unit/auth/infrastructure/keys/file-system-key-providers.spec.ts` — new
- `test/unit/shared/config/environment.schema.spec.ts` — extend with the `keySource` cases

## Technical Decisions

- **Allow-list, not deny-list.** `keySource` is `'filesystem'` only when `NODE_ENV` is exactly
  `development`; everything else maps to `'parameter-store'`. The Lambda runtime does not set
  `NODE_ENV`, so an inverted test would put the deployed function on the local provider by default.
  This is the constitution's allow-list rule applied to key selection.
- **Fixed `keys/` directory**, matching `scripts/generate-dev-keys.ts`, which already hardcodes
  `join(process.cwd(), 'keys')`. No new configuration for a path that has one correct value.
- **No new problem code.** A missing or malformed PEM reaches the filter as a plain error and is
  answered `503`, identical to a Parameter Store failure today.
- **`NODE_ENV` stays optional in the schema.** Making it required would break every existing
  environment file and the deployed configuration to declare what was already the default.

## Testing Strategy

TDD, red first, behavior only — no assertions on mocks.

- `parseAppConfig`: `development` maps to `filesystem`; `production`, empty, unset, and
  `Development` map to `parameter-store`. This is the test that pins AC-2 and the fail-closed
  direction.
- Filesystem adapters: generate a real pair into a temp directory, load both providers, assert the
  two derive the same `kid` (AC-3); assert a missing file and a corrupt PEM reject (AC-4).
- No e2e change. The suite overrides both ports with an in-memory pair and must not begin depending
  on `keys/`. AC-1 is proven by hand against the running server.

## Risks

- The local adapters are a second production-capable code path. The only thing keeping them out of
  production is the `keySource` mapping, which is why that mapping is a pure function with its own
  test rather than an inline condition in the module.
- `keys/` is gitignored, so a deployment that somehow selected `filesystem` would fail to start
  rather than sign with a stale key. That is the intended failure direction, and worth keeping.
