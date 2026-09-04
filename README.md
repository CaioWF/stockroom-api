# Stockroom — Authentication Service

A NestJS authentication service: registration, sign-in, refresh-token rotation, and a published
JWKS for neighbouring services to verify tokens without being able to issue them. See
`specs/001-authentication/spec.md` for the full functional spec and
`specs/001-authentication/contract.md` for how each acceptance criterion is proven.

This README takes a clean clone to a running application and a passing test suite. It was
verified by actually following it, step by step, on a fresh clone with no `node_modules`, no
`keys/`, and no containers already running — see "The local dev server's real limitation" below
for the one thing that does **not** work out of the box.

## Prerequisites

- Node.js and npm (verified with Node v24.15.0 / npm 11.12.1 — no other version is pinned by this
  repo, but that combination is the known-good baseline)
- Docker with the `docker compose` plugin (verified with Docker 29.4.3 / Compose v5.1.3), for
  local DynamoDB

## 1. Install dependencies

```sh
npm install
```

## 2. Bring up local DynamoDB

```sh
docker compose up -d
```

Starts `dynamodb-local` (service `dynamodb` in `docker-compose.yml`) on the fixed host port
`8000`, in-memory only — no volume, so `docker compose down` (or a container restart) wipes it.

If `docker compose up -d` fails with "port is already allocated", something else on the host is
already bound to `8000` (for example, a container from a previous run of this same project that
was never stopped). Stop whatever holds the port, or run `docker compose down` first, then retry.

## 3. Configure environment variables

```sh
cp .env.example .env
```

Then fill in every value `.env.example` lists — none of them are real secrets, they are just
names. `specs/001-authentication/contract.md`'s Environment section explains what each one is for.

**`.env` is not loaded automatically.** This project parses configuration straight from
`process.env` (`src/shared/config/environment.schema.ts` → `configuration.module.ts`) — there is
no `dotenv` dependency and no framework wiring that reads a `.env` file for you. Every command
below that touches configuration (`db:create-table`, `start:dev`) needs those variables actually
exported into the shell that runs it, e.g.:

```sh
set -a
source .env
set +a
```

(`set -a` marks every variable `source` assigns for export, so this is equivalent to hand-writing
an `export` line per variable; run it in the same shell you'll run the next commands in, or export
per-command with `env $(cat .env | xargs) <command>` if you'd rather not touch the current shell.)

**Two more variables are needed that are not in `.env.example`, and are not part of this app's own
config schema at all:** `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. The AWS SDK v3 credential
chain refuses to send a request — even to the local `dynamodb-local` container, which does not
validate credentials — without something present. Any non-empty value works locally:

```sh
export AWS_ACCESS_KEY_ID=local
export AWS_SECRET_ACCESS_KEY=local
```

## 4. Create the local table

```sh
npm run db:create-table
```

Runs `scripts/create-table.ts` directly against `process.env` (`TABLE_NAME`, `AWS_REGION`,
`DYNAMODB_ENDPOINT`) — needs step 3's variables exported first, same reason as above. Idempotent:
safe to run again against an existing table.

## 5. Generate a local RS256 dev key pair

```sh
npm run keys:generate
```

Writes `keys/private.pem` and `keys/public.pem` (gitignored) and prints the key's RFC 7638
thumbprint (`kid`). Nothing in this repo's local dev path currently consumes these two files
automatically — see "The local dev server's real limitation" below for why, and what the
thumbprint is for if you do wire up a Parameter Store equivalent yourself.

## 6. Run the test suites

```sh
npm run test:unit
npm run test:integration
npm run test:e2e
```

- `test:unit` needs nothing else running — pure unit tests, no network calls.
- `test:integration` and `test:e2e` need the local DynamoDB container from step 2 up (they create
  the table themselves on first use via `ensureTableExists`, so step 4 is not strictly required
  before them, though running it first is harmless).
- `test:e2e` does **not** need your `.env` file or step 3's exports: every e2e spec transitively
  imports `test/e2e/auth/support/set-test-environment.ts` first, which fills in every variable
  `ConfigurationModule` needs with dummy/local values (`setIfAbsent`, so a real value you did
  export is not overridden). The signing/verification key providers are also swapped for an
  in-memory double for the whole e2e run (`test/e2e/auth/support/build-test-app.ts`), so no AWS
  account is needed for any test suite.
- A single spec file can be targeted with a positional filter, e.g. `npm run test:e2e -- login` or
  `npm run test:unit -- raw-password` — matches `contract.md`'s per-AC commands.

**Known intermittent failure on a genuinely fresh table:** if `test:e2e` is the very first thing to
touch a brand-new table (TTL not yet enabled on it), running the full suite in parallel can produce
a `TimeToLive is already enabled` `ValidationException` in one spec, because more than one Jest
worker's `ensureTableExists` call races the same table's `DescribeTimeToLiveCommand` /
`UpdateTimeToLiveCommand` pair at once. It is transient — rerunning `npm run test:e2e` succeeds
once TTL is enabled, and `npm run test:e2e -- <spec>` (targeting one file) or
`npm run test:e2e -- --runInBand` (forcing sequential workers) avoids it outright on a fresh table.
This is a pre-existing race in the shared table bootstrap, not a step this README got wrong.

## 7. Start the local dev server

```sh
npm run start:dev
```

Boots `src/main.ts` with the variables from step 3 exported in the same shell. **Read the next
section before expecting a full login flow to work.**

## The local dev server's real limitation

`GET /health`, `POST /auth/register`, and `GET /openapi.json` work against nothing but the local
DynamoDB container — verified directly against a running `start:dev` instance on a clean clone:

```
GET  /health            -> 200 {"status":"ok"}
POST /auth/register      -> 201 {accountId, email}
GET  /openapi.json       -> 200
```

`POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`, and `GET /.well-known/jwks.json` do
**not** work locally out of the box, and this is by design, not a bug to fix. Verified directly:

```
POST /auth/login -> 503 {"code":"SERVICE_UNAVAILABLE","detail":"The security token included in
                     the request is invalid."}
GET  /.well-known/jwks.json -> 503 (same code)
```

`SigningKeyProvider`/`VerificationKeySetProvider`'s production adapters
(`src/auth/infrastructure/keys/parameter-store-*.provider.ts`) read from real AWS Systems Manager
Parameter Store — there is no local Parameter Store emulator in this repo (`docker-compose.yml`
only runs DynamoDB Local), and `src/auth/auth.module.ts` wires the real
`ParameterStoreSigningKeyProvider`/`ParameterStoreVerificationKeySetProvider` for `start:dev`
exactly as it does for production; nothing swaps them locally the way
`test/e2e/auth/support/build-test-app.ts` does for the test suite. `POST /auth/refresh` and
`GET /auth/me` share the same access-token-signer / verification-key-set dependency chain
(`src/auth/auth.module.ts`'s `accessTokenSignerProvider` and `jwtAuthGuardProvider`), so they fail
the same way even though they weren't hit with a valid credential in this verification.

To make the full login flow work locally, put a real RS256 private key and its matching public-key
array into two real AWS SSM `SecureString` parameters, in an AWS account you have credentials for,
named exactly what `SIGNING_KEY_PARAMETER_NAME` and `VERIFICATION_KEYS_PARAMETER_NAME` in your
`.env` say (a personal/sandbox account works fine — `npm run keys:generate`'s output is exactly
the key material and `kid` those two parameters expect), and export real AWS credentials for that
account instead of `local`/`local` before `npm run start:dev`. No such account was set up as part
of writing this README — this is documented as the correct, current state rather than something
this task is meant to route around: **the full test suite (unit, integration, e2e) needs no AWS
account and runs completely standalone; only the live local dev server's login/refresh/me/jwks
routes need real AWS SSM access.** This is expected for a Lambda-behind-Parameter-Store production
design (`src/lambda.ts`), where the real target for a login flow is a deployed environment, not a
laptop.

## Troubleshooting

- **`docker compose up -d` fails with "port is already allocated"** — see step 2.
- **`db:create-table` or `start:dev` fails with `TABLE_NAME environment variable is required` (or
  similarly for another variable)** — the shell running the command doesn't have step 3's
  variables exported; `.env` on disk is not enough by itself.
- **`db:create-table` or `start:dev` fails with `CredentialsProviderError: Could not load
  credentials from any providers`** — export the two dummy AWS credential variables from step 3;
  they are not in `.env.example` because they aren't part of this app's own config schema, only
  the AWS SDK's.
- **`test:e2e` fails once with a `TimeToLive is already enabled` error on a brand-new table** —
  see step 6's note; rerun the command.
