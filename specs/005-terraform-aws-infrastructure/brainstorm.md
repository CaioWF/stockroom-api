---
status: draft
feature: 005-terraform-aws-infrastructure
date: 2026-09-06
---

# Terraform AWS Infrastructure — Brainstorm

## Understanding

- Stand up the deployed environment for Stockroom as Terraform code in this repository: the
  Lambda that runs the Nest application, the ALB that fronts it, the DynamoDB table it reads and
  writes, the two SSM parameters that hold the RS256 key material, and the IAM that binds them.
- Verification is `terraform fmt`/`validate`/`plan` only. There is no AWS account in play, so no
  acceptance criterion may depend on a real `apply`. This is a decision, not a limitation to work
  around: the design is shaped so that a plan runs correctly without credentials.
- The stack is single-environment and applied by hand. CI/CD, dev/prod separation, and packaging
  the deployment artifact inside Terraform are out of scope, each a candidate for its own feature.
- Terraform runs through the pinned `hashicorp/terraform` Docker image, version 1.11 or later.
  No `terraform` binary is installed on this machine and none is expected to be — the version
  belongs to the repository, not to a workstation.
- The challenge this project answers requires Terraform for the infrastructure and DynamoDB for
  persistence, so this feature is the one that closes a mandatory requirement rather than an
  optional one.

## Investigation

- `src/lambda.ts` types its handler `Handler<ALBEvent, ALBResult>` and translates the event
  through `@codegenie/serverless-express`. The transport the infrastructure publishes is therefore
  already decided by the application: an ALB target group, not an API Gateway stage.
- `.specify/memory/constitution.md` states the load balancer is the one always-on component and
  that it "has to earn its standing cost in an ADR". No such ADR exists — `docs/architecture/adr/`
  holds 0001 through 0007 and none covers transport or idle cost. The debt is real and this
  feature pays it.
- `src/shared/config/environment.schema.ts` requires 24 variables, of which `TABLE_NAME`,
  `AWS_REGION`, `JWT_ISSUER`, `JWT_AUDIENCE`, `SIGNING_KEY_PARAMETER_NAME` and
  `VERIFICATION_KEYS_PARAMETER_NAME` have no default and must come from the stack. `toKeySource`
  is an allow-list: only the exact string `development` selects the on-disk PEM pair, so an unset
  `NODE_ENV` correctly routes the deployed function to Parameter Store.
- `scripts/create-table.ts` fixes the table shape the stack must reproduce: a string partition key
  and a string sort key, `PAY_PER_REQUEST` billing, and TTL enabled on the `ttl` attribute.
- The DynamoDB and SSM calls the code actually issues, re-derived from `src/` after the adversarial
  review found the first pass incomplete: `GetCommand`, `PutCommand`, `QueryCommand`,
  `UpdateCommand`, and `TransactWriteCommand` carrying `Put`, `ConditionCheck` **and** `Update`
  items — the refresh-token rotation transaction in
  `src/auth/infrastructure/dynamo/refresh-token.repository.ts` is `ConditionCheck` + `Update` +
  `Put`. `GetParameterCommand` for both key providers. No `Scan`, no `DeleteCommand`, no
  `BatchWrite`, and no GSI, so no `index/*` ARN is required.
- `src/auth/infrastructure/crypto/argon2-password-hasher.ts` runs argon2id at `memoryCost` of
  19 MiB and `timeCost` 2. That figure sizes the function: it is the reason the provider's default
  memory and timeout cannot stand.
- `.gitignore` has no Terraform entries at all — no `.terraform/`, no `*.tfstate`, no
  `.terraform.lock.hcl`, no `*.tfvars`. It must gain them before the first Terraform command runs
  in this tree, or state and a real tfvars become committable by accident.

## Approaches considered

- **Approach A — child modules per concern** (`modules/network`, `modules/compute`,
  `modules/edge`, `modules/data`). Duplicates every value across a variables/outputs boundary for
  no reuse. A module earns that plumbing when a second environment or a second caller consumes it,
  and multi-environment was cut from scope.
- **Approach B — one `main.tf`**. Around thirty resources in a single file, past the 400-line
  ceiling in the constitution's size limits, with no conceptual owner per region of the file.
- **Chosen: C — flat root module, files split by concern** (`network.tf`, `data.tf`, `compute.tf`,
  `edge.tf`). Each file has one owner, `terraform plan` stays one command over one state, and
  nothing is indirected through a module interface that has a single caller. Splitting into
  modules later is mechanical; un-splitting a premature module hierarchy is not.

Transport was the other fork, resolved before the approaches above:

- **API Gateway HTTP API** and **Lambda Function URL** both cost nothing when idle, which the
  constitution's "Idle costs nothing" prefers, and both deliver TLS without a certificate of our
  own. Both also deliver `APIGatewayProxyEventV2`, which means rewriting `src/lambda.ts` and its
  tests — application code changed by an infrastructure feature.
- **Chosen: ALB.** It is what the constitution names, what the handler is typed for, and what
  keeps a path open for future targets that are not Lambda. The ~US$16/month idle cost is the
  price, and ADR-0008 is where it is recorded rather than absorbed silently.

A third option was raised and rejected during brainstorming: **replacing the project's own
authentication with Amazon Cognito.** Cognito issues JWTs and would satisfy the letter of the
challenge's "autenticação via JWT" requirement, but the challenge evaluates logic, code
organization and test coverage, and authentication is the largest body of testable logic in the
deliverable. Handing it to a managed service would delete feature 001 outright, gut the
credential-route throttling in feature 002, moot ADR-0006, and end the suite's ability to run
offline — `test/e2e/auth/support/build-test-app.ts` currently injects an in-memory RS256 pair so
no AWS account is needed, and Cognito has no open emulator. ADR-0008 records Cognito as
considered and rejected, with that reasoning.

## Open Decisions

None. Both points previously open were closed during the adversarial review:

- **TLS is optional at the variable level, not absent.** `var.certificate_arn` defaults to null:
  null yields an HTTP listener only, a supplied ARN yields an HTTPS listener plus a redirect from
  port 80. One stack serves both the never-applied case and a real deployment with a domain, and
  `plan` proves both paths.
- **SSM secrets use write-only arguments**, which removes the leak the placeholder pattern had.
  See the Data and secrets section.

## Outline of the solution

### Layout

A single root module in `terraform/`, files by concern: `versions.tf` (`required_version >= 1.11`,
pinned `aws` provider, `backend "s3"` with partial configuration), `providers.tf`, `variables.tf`,
`network.tf`, `data.tf`, `compute.tf`, `edge.tf`, `outputs.tf`, and `terraform.tfvars.example`.

### Topology

Internet reaches an ALB in a purpose-built VPC across two availability zones; the listener forwards
to a target group of `target_type = "lambda"`; the function reaches DynamoDB and SSM over the
public AWS endpoints.

The function is deliberately **not** attached to the VPC. An ALB invokes a Lambda target through
the Lambda API rather than over the network, so the target needs no ENI. Attaching it would force
either a NAT Gateway or interface endpoints purely so the function could reach DynamoDB and SSM,
which multiplies both cost and the number of network resources under management. Keeping it out
leaves the ALB as the only component with a network footprint.

The VPC is created rather than borrowed. The default VPC is only reachable through a
`data "aws_vpc"` lookup, which calls the AWS API and would break a credential-less plan.

Three pieces of the wiring are easy to omit and each breaks the stack:

- **`aws_lambda_permission`** with principal `elasticloadbalancing.amazonaws.com` and the target
  group ARN as `source_arn`. Only the console adds this implicitly; without it, registering the
  function with the target group fails at apply. The attachment carries an explicit `depends_on`
  against it, because argument references alone do not order the two and the race is a known
  intermittent failure.
- **`health_check`** is written out, not defaulted. The provider defaults health checks to
  enabled with path `/`, which is the opposite of the AWS default for `lambda` target groups. The
  application has no route at `/` — its only liveness route is `/health` — so the default leaves
  the target permanently unhealthy while invoking (and billing) the function on every check
  interval. The block sets `path = "/health"` and `matcher = "200"`.
- **`lambda_multi_value_headers_enabled`** is set explicitly to `false` rather than inherited.
  With it off, a repeated header or query parameter collapses to its last value. Nothing in `src/`
  emits a repeated response header today, so this is currently harmless — but the adapter at
  `@codegenie/serverless-express`'s ALB event source truncates array-valued headers to their first
  element regardless, so the day this service sets a cookie it would fail only under ALB and pass
  every local test. Writing the value down makes it a decision instead of an inheritance.

### TLS and the token issuer

`var.certificate_arn` defaults to null. Null produces a single HTTP listener on port 80. A supplied
ACM ARN produces an HTTPS listener on 443 with the certificate, and turns port 80 into a redirect.

`JWT_ISSUER` is its own variable with a stable default, never interpolated from the ALB DNS name.
An ALB DNS name carries a random suffix and changes whenever the load balancer is replaced — a
subnet change is enough — and since `JwtAuthGuard` checks `iss`, coupling the two would invalidate
every outstanding access token on an unrelated infrastructure edit.

Serving an authentication API over plaintext HTTP is a real exposure, not a footnote: credentials
on `/auth/login` and `/auth/register` travel in the clear and the JWKS document is substitutable in
transit. The null-certificate path exists so the repository is complete without a domain, and
ADR-0008 records that a real deployment sets `certificate_arn`.

### Configuration

Every application variable is set on the function from a Terraform variable whose default matches
the application default, with two deliberate exceptions:

- `AWS_REGION` is never written. Lambda reserves the name and rejects a deployment that sets it in
  `environment.variables`; the runtime injects it, which satisfies the schema.
- `NODE_ENV` is left unset, so `toKeySource`'s allow-list routes the function to Parameter Store.

`TABLE_NAME` and the two parameter names are interpolated from the resources themselves, so no
name is written twice.

### Sizing

`memory_size`, `timeout` and `architectures` are all set explicitly. The provider defaults —
128 MB and 3 seconds — cannot serve this application: argon2id at 19 MiB of memory cost gets
roughly a twelfth of a vCPU at 128 MB, and `src/lambda.ts` deliberately builds the entire Nest
application inside the first invocation, so a cold start followed by a password hash exceeds three
seconds and the ALB answers 502.

`architectures` is pinned rather than defaulted because `@node-rs/argon2` ships a platform-specific
native binary; a zip built for the wrong architecture fails at `require()` with no signal at plan
time. The build platform is documented alongside the pin.

### Data and secrets

The DynamoDB table mirrors `scripts/create-table.ts`: string partition and sort keys,
`PAY_PER_REQUEST`, TTL on `ttl`. Point-in-time recovery is enabled. Deletion protection and
`prevent_destroy` are deliberately **not** set: the documented runbook ends by tearing the stack
down, and a lifecycle guard that blocks the documented procedure is a guard in the wrong place.
The trade-off is explicit — a teardown deletes every account, refresh token and throttle counter.

Both SSM parameters are `SecureString` written through the provider's **write-only** arguments
(`value_wo` with `value_wo_version`), which require Terraform 1.11 or later. This is the load
bearing detail: with an ordinary `value`, the provider's read path calls `GetParameter` with
decryption and writes the result into state, so the RS256 private key would land in the state file
on the first refresh after the real key was put in place. `lifecycle { ignore_changes = [value] }`
does not prevent that — it suppresses the diff, not the refresh. With `value_wo` in use the read
path sets the value attribute to null instead, and the secret never reaches state. The parameters
are created with a placeholder and the real key material is written out of band with
`aws ssm put-parameter`.

### IAM

One execution role with one inline policy, scoped to the actions the code actually issues:

- `dynamodb:GetItem`, `PutItem`, `Query`, `UpdateItem` and `ConditionCheckItem` on the table ARN.
  No `Scan`, no `DeleteItem`.
- `ssm:GetParameter` on the two parameter ARNs.
- `kms:Decrypt` on `"*"`, constrained by
  `Condition { StringEquals = { "kms:ViaService" = "ssm.<region>.amazonaws.com" } }`. The obvious
  form — an alias — does not work: an alias in a policy `Resource` applies to the alias, not to the
  key behind it, and a bare `alias/aws/ssm` is not an ARN at all, so IAM rejects the document. The
  correct key ARN needs both the account id and the managed key id, and both are only obtainable
  through AWS-API data sources the plan-without-credentials constraint forbids. The `ViaService`
  condition scopes the wildcard to exactly the calls this service makes.
- `logs:CreateLogGroup`, `logs:CreateLogStream` and `logs:PutLogEvents`. The log group is created
  as `/aws/lambda/<function name>` — the name is not free, since the runtime writes to that path
  and a mismatch loses every log with no error surfaced anywhere — and the function carries a
  `depends_on` against it so the runtime does not create it first and collide.

### Deploying code

`aws_lambda_function` takes `filename` from a variable pointing at a zip built outside Terraform,
and omits `source_code_hash` so that no plan depends on a built artifact. The consequence is
sharper than "Terraform will not detect a code change": the provider only updates code when
`filename`, `code_sha256` or `source_code_hash` change, and it deliberately does not refresh
`filename` from the API, so a rebuilt zip at the same path produces "No changes" forever while the
deployed code goes stale.

Terraform therefore does not own the code-deploy loop. It creates the function; subsequent code
deployments are `aws lambda update-function-code`, documented in the runbook. `apply -replace` is
explicitly the wrong recovery, since replacing the function invalidates the permission and the
target-group registration and opens a 502 window.

### Verification

An on-demand command, `npm run infra:check`, invoked by the feature's verification contract and by
`implement-and-evaluate` — **not** wired into the pre-commit gate. It shells out to the pinned
Docker image and runs `fmt -check -recursive`, `init -backend=false`, `validate`, then
`plan -refresh=false` against a fixture tfvars with fake credentials.

Keeping it out of `run-gates.sh` is a deliberate trade-off against this project's own rule that
quality gates run before every commit: `terraform init` needs network access for a ~130 MB
provider download, and a gate that cannot run offline would block every commit in the repository,
including commits that touch no infrastructure. The cost is that a broken `.tf` can reach a commit;
the feature's `contract.md` is what covers that during the work.

Four properties are load-bearing and are requirements rather than preferences:

1. **No data source that calls the AWS API.** Availability zones arrive as a variable, guarded by
   a `validation` block asserting each one starts with the region string — otherwise region/AZ
   drift produces a clean plan and a failed apply, in the one place the gate is blind.
2. **The provider sets `skip_credentials_validation`, `skip_requesting_account_id` and
   `skip_metadata_api_check`**, without which a plan attempts to authenticate and fails.
3. **A transient `backend_override.tf`.** A `backend "s3"` block plus `init -backend=false` makes
   `plan` fail outright with "Backend initialization required", and initializing the S3 backend for
   real needs credentials to read remote state — `-refresh=false` skips resource refresh, not state
   retrieval, so there is no configuration in which the declared backend and a credential-less plan
   coexist. The check writes an override file selecting the local backend, runs, and removes it;
   Terraform's `*_override.tf` merge is the documented mechanism for exactly this.
4. **No `source_code_hash`**, so no plan depends on a built artifact.

The Docker invocation is designed rather than assumed: the container runs as the invoking uid so
`.terraform/` is not left root-owned in the bind mount, with a writable `HOME` (which `init`
requires) and a mounted `TF_PLUGIN_CACHE_DIR` so the provider is downloaded once. `.gitignore`
gains `.terraform/`, `*.tfstate`, `*.tfstate.backup`, `*.tfvars` (excepting the example),
`backend_override.tf`, and `.terraform.lock.hcl` is committed.

### Documentation

ADR-0008 records the transport decision: ALB over API Gateway and Function URL, the idle cost it
accepts, Cognito considered and rejected for authentication, and the plaintext-HTTP default with
the certificate variable as its remedy. The README gains the deploy runbook — build the zip, apply,
put the real key material into the two SSM parameters, exercise the endpoint, tear the stack down —
as a documented procedure rather than a proven acceptance criterion.
