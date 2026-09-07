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

The copy arrives filled with working local defaults — none of them are real secrets. Only the
optional variables are left blank, and blank means "use the default declared in
`src/shared/config/environment.schema.ts`". `specs/001-authentication/contract.md`'s Environment
section explains what each one is for.

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

## 8. Browse or exercise the API

```sh
bash scripts/swagger-ui.sh
```

Serves the running app's OpenAPI document in a local Swagger UI at `http://localhost:8080`,
reverse-proxied so `Authorize` and try-it-out calls hit the real routes without a CORS error.
Restart the script after changing a route or a schema — the spec is a snapshot taken at startup.

`example-requests.http` has the same three routes (register, login, list products) chained with
REST Client's request-variable syntax, for editors that support running `.http` files directly.

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

## AWS deployment runbook

These commands create the AWS infrastructure declared in `terraform/`, write the real RS256 key
material, exercise the deployed endpoint, redeploy code, and tear the stack down. They need real
AWS credentials and a `terraform` binary; the repository's own `npm run infra:check` needs neither
and never applies anything.

**Read this before applying.** Without `certificate_arn` the stack serves `POST /auth/login`,
`POST /auth/refresh` and `GET /.well-known/jwks.json` over **plaintext HTTP** — passwords and
refresh tokens travel in the clear, and the JWKS document is substitutable in transit. That default
exists so the repository is complete without a domain. Anything beyond a throwaway stack should set
`certificate_arn`. The reasoning is in
[ADR-0008](docs/architecture/adr/0008-alb-lambda-transport.md).

### 1. Build the deployment artifact

`nest build` transpiles and bundles nothing, so the archive needs production dependencies too.
`@node-rs/argon2` ships a platform-specific native binary and the function pins `x86_64`, so the
install has to resolve the linux-x64 build even when you are on macOS or arm64.

```sh
rm -f lambda.zip          # zip appends; a stale archive would keep old entries
npm ci
npm run build
npm ci --omit=dev --cpu=x64 --os=linux
(cd dist && zip -qr ../lambda.zip .)
zip -qr lambda.zip node_modules
```

The archive lands at the repository root, not in `dist/`, because `nest-cli.json` sets
`deleteOutDir` and the next build would delete it. `terraform.tfvars.example` points
`lambda_package_path` at `../lambda.zip` to match.

The archive root then holds `src/lambda.js` and `node_modules/`, which is why the function's
handler is `src/lambda.handler`: `tsconfig.build.json` excludes only `test`, so `scripts/` is
compiled too and the emitted tree is `dist/src/...`, not `dist/...`.

### 2. Choose your variables

```sh
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
```

Edit it. `lambda_package_path` has no default and must point at the zip from step 1. Uncomment
`certificate_arn` unless you accept the plaintext default described above. `jwt_issuer` is baked
into every access token and checked by `JwtAuthGuard`, so changing it later invalidates every
outstanding token — pick it once.

`terraform.tfvars` is gitignored. Do not commit it.

### 3. Initialize against the state bucket

The bucket is a prerequisite Terraform cannot create for itself, since it holds Terraform's own
state.

```sh
terraform -chdir=terraform init \
  -backend-config="bucket=<state-bucket>" \
  -backend-config="key=stockroom/terraform.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="encrypt=true" \
  -backend-config="use_lockfile=true"
```

### 4. Review and apply

```sh
terraform -chdir=terraform plan -var-file=terraform.tfvars
terraform -chdir=terraform apply -var-file=terraform.tfvars
```

### 5. Write the real key material

Terraform creates the two SSM parameters with inert placeholders and never learns their real
contents — that is what keeps the private key out of the state file. **Generate a key pair for this
deployment; do not reuse `keys/private.pem`,** which `npm run keys:generate` writes for local
development and which sits unencrypted in every developer's working tree.

```sh
mkdir -p .deploy-keys && chmod 700 .deploy-keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out .deploy-keys/private.pem
openssl rsa -in .deploy-keys/private.pem -pubout -out .deploy-keys/public.pem
```

The verification parameter takes a **JSON array of SPKI PEM strings**, not a bare PEM.
`parsePublicKeyPems` runs `JSON.parse`, rejects anything that is not an array, then rejects any
element that is not a string — hand it a bare PEM and every token verification fails. Build the
array with the Node you already have; this repository cannot produce the artifact without it, so
it is a safer assumption than `jq`:

```sh
node -e 'const fs=require("fs"); const dir=".deploy-keys";
  fs.writeFileSync(dir + "/verification-keys.json",
    JSON.stringify([fs.readFileSync(dir + "/public.pem", "utf8")]))'
```

Write both, reading the parameter names from the stack rather than re-deriving them:

```sh
aws ssm put-parameter --overwrite --type SecureString \
  --name "$(terraform -chdir=terraform output -raw signing_key_parameter_name)" \
  --value "file://.deploy-keys/private.pem"
aws ssm put-parameter --overwrite --type SecureString \
  --name "$(terraform -chdir=terraform output -raw verification_keys_parameter_name)" \
  --value "file://.deploy-keys/verification-keys.json"
```

Then move `.deploy-keys/private.pem` somewhere it belongs — a password manager, or a KMS-encrypted
bucket — and delete the local copy. It is the production signing key.

### 6. Exercise the endpoint

```sh
curl -fsS "http://$(terraform -chdir=terraform output -raw load_balancer_dns_name)/health"
```

Use `https://` instead if you supplied a certificate.

### 7. Redeploy application code

Terraform does not own the code-deploy loop: the function declares no `source_code_hash`, so a
rebuilt zip at the same path produces "No changes" while the deployed code goes stale. Publish code
directly instead, and never with `apply -replace` — replacing the function invalidates the ALB
permission and the target-group registration, and opens a 502 window.

```sh
aws lambda update-function-code \
  --function-name "$(terraform -chdir=terraform output -raw function_name)" \
  --zip-file fileb://lambda.zip
```

### 8. Tear the stack down

**This deletes the DynamoDB table and everything in it: every account, refresh token and throttle
counter. There is no backup step in this runbook.** The table deliberately carries no deletion
protection, because teardown is a documented goal of this stack; point-in-time recovery is enabled,
but a deleted table takes its PITR window with it.

The two SSM parameters carry `prevent_destroy`, so teardown refuses to run until they are released.
That guard exists because recreating a parameter overwrites your real signing key with the
placeholder, silently. Release them deliberately, tear the stack down, then remove them by hand:

```sh
terraform -chdir=terraform state rm aws_ssm_parameter.signing_key
terraform -chdir=terraform state rm aws_ssm_parameter.verification_keys
terraform -chdir=terraform apply -destroy -var-file=terraform.tfvars
aws ssm delete-parameter --name "/<project_name>/jwt/signing-key"
aws ssm delete-parameter --name "/<project_name>/jwt/verification-keys"
```

### Recovering from a lost or mismatched state file

Every resource name is a fixed string, so applying against an empty state fails with "already
exists" rather than adopting what is already there. Do **not** delete the live resources to get
past it — that destroys the table. Import them instead:

```sh
terraform -chdir=terraform import -var-file=terraform.tfvars \
  aws_dynamodb_table.stockroom "<project_name>-table"
```

Repeat for each resource the plan reports as new, then re-run `plan` until it comes back empty.

**Do not import the two SSM parameters.** Importing records no `value_wo_version` in state, while
`data.tf` declares `value_wo_version = 1`, so the next apply sees a version change and writes the
placeholder over your real signing key. `prevent_destroy` does not stop this: it guards destroy
and replacement, not an in-place update. Leave the parameters out of state — the running function
reads them from SSM directly and never consults Terraform — and if you have already imported one,
re-run step 5 to rewrite the real key material **before** the next apply.
