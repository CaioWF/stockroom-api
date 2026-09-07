---
status: approved
feature: 005-terraform-aws-infrastructure
date: 2026-09-06
---

# Terraform AWS Infrastructure — Spec

## User Stories

- As a reviewer with no AWS account, I want to run one command and see the whole environment
  planned, so that I can judge the infrastructure without credentials and without applying
  anything. Accepted when `npm run infra:check` succeeds on a clean clone with no AWS credentials
  configured.
- As a reviewer, I want to read what the service is permitted to do in AWS, so that I can tell
  whether the execution role is scoped or whether it is a wildcard with extra steps. Accepted when
  the planned IAM policy lists only the actions the application issues, each bound to a named
  resource.
- As an operator, I want the deployment to describe itself, so that I can bring the environment up
  from a clean clone without inventing configuration. Accepted when the runbook takes an operator
  from clone to a reachable API using only Terraform and named CLI commands.
- As an operator, I want to deploy with TLS when I have a certificate and without one when I do
  not, so that the absence of a domain does not block the stack from existing. Accepted when the
  same configuration plans an HTTP-only listener with no certificate and an HTTPS listener plus a
  redirect with one.
- As the author, I want the private signing key to stay out of Terraform state, so that the state
  file is not a secret store. Accepted when the parameters holding key material are declared with
  write-only arguments and no plan or state records their value.
- As a future maintainer, I want the choice of an always-on load balancer written down, so that
  the standing cost is a decision I can re-examine rather than an accident. Accepted when an ADR
  records the transport decision, its cost, and the alternatives rejected.

## Functional Requirements

- FR1: The environment is declared as a single flat Terraform root module under `terraform/`, with
  files split by concern (`versions.tf`, `providers.tf`, `variables.tf`, `locals.tf`,
  `network.tf`, `data.tf`, `compute.tf`, `edge.tf`, `outputs.tf`). No child modules. Each file stays under 400 lines.
- FR2: `versions.tf` declares `required_version >= 1.11` (the floor for write-only arguments), a
  pinned `hashicorp/aws` provider constraint, and a `backend "s3"` block in partial-configuration
  form.
- FR3: The provider sets `skip_credentials_validation`, `skip_requesting_account_id` and
  `skip_metadata_api_check`, so that a plan runs without resolvable credentials. The region
  variable defaults to `us-east-1`.
- FR4: The configuration contains no data source that calls the AWS API. Availability zones are
  supplied by a variable defaulting to `["us-east-1a", "us-east-1b"]`, which carries a
  `validation` block asserting every zone begins with the configured region.
- FR4a: A `project_name` variable, defaulting to `stockroom`, prefixes every resource name, so the
  stack can stand twice in one account without collision.
- FR5: The stack creates its own VPC with an internet gateway, a route table, two public subnets in
  the two configured availability zones, and a security group for the load balancer. The default
  VPC is never referenced.
- FR6: The Lambda function is not attached to the VPC. No NAT gateway and no VPC interface
  endpoints are created.
- FR7: An Application Load Balancer sits in the two subnets, with a target group of
  `target_type = "lambda"` and an attachment registering the function.
- FR8: TLS is controlled by a nullable `certificate_arn` variable. When it is null the stack plans
  a single HTTP listener on port 80 forwarding to the target group. When it holds an ARN the stack
  plans an HTTPS listener on 443 using that certificate, and port 80 becomes a redirect to it.
- FR9: An `aws_lambda_permission` grants `lambda:InvokeFunction` to the
  `elasticloadbalancing.amazonaws.com` principal, scoped by `source_arn` to the target group. The
  target group attachment declares an explicit `depends_on` against that permission.
- FR10: The target group's health check is written explicitly: enabled, `path = "/health"`,
  `matcher = "200"`. The provider default (enabled at `/`) is never inherited.
- FR10a: The HTTPS listener sets `ssl_policy` explicitly. ELB's default,
  `ELBSecurityPolicy-2016-08`, still negotiates TLS 1.0 and 1.1; the one path in this stack that
  exists to be secure must not inherit it.
- FR11: `lambda_multi_value_headers_enabled` is set to `false` explicitly, with a comment
  recording why the value was chosen rather than inherited: the ALB event source in
  `@codegenie/serverless-express` truncates array-valued response headers to their first element
  regardless of the flag, so enabling it would change the inbound event shape without fixing the
  outbound truncation. The day this service emits a repeated response header, both sides need
  revisiting together.
- FR12: The function declares `memory_size = 1024`, `timeout = 30` and
  `architectures = ["x86_64"]` explicitly. 1024 MB yields roughly 0.58 vCPU, which takes an
  argon2id hash at 19 MiB of memory cost out of the multi-second range; 30 seconds leaves room for
  a cold start that builds the Nest application inside the first invocation while staying under
  the load balancer's 60-second idle timeout. The provider defaults of 128 MB and 3 seconds are
  insufficient and are never inherited. The architecture is pinned because `@node-rs/argon2`
  ships a platform-specific native binary.
- FR13: The function's code comes from a `filename` variable pointing at a zip built outside
  Terraform. `source_code_hash` is not declared, so no plan reads the artifact.
- FR14: The function's environment carries every variable required by
  `src/shared/config/environment.schema.ts` except two: `AWS_REGION`, which Lambda reserves and
  the runtime injects, and `NODE_ENV`, whose absence selects the Parameter Store key provider.
  Variables with application-side defaults are exposed as Terraform variables carrying the same
  defaults.
- FR15: `JWT_ISSUER` is its own Terraform variable with a stable value, never interpolated from the
  load balancer's DNS name. The issuer is an identifier, not an address the service fetches: the
  application resolves verification keys through Parameter Store, so the value need not resolve in
  DNS. It must stay constant across infrastructure changes, because `JwtAuthGuard` checks `iss`
  and a changed issuer invalidates every outstanding access token.
- FR16: `TABLE_NAME` and the two SSM parameter-name variables are interpolated from the resources
  the stack creates, so no name is written twice.
- FR17: The DynamoDB table reproduces the shape in `scripts/create-table.ts` — a string partition
  key, a string sort key, `PAY_PER_REQUEST` billing, and TTL enabled on the `ttl` attribute — and
  additionally enables point-in-time recovery. Deletion protection and `prevent_destroy` are
  deliberately not set, because the documented runbook ends by tearing the stack down.
- FR18: Both SSM parameters are `SecureString` declared with the write-only arguments `value_wo`
  and `value_wo_version`. The `value` argument is never used for either, so the provider's read
  path does not persist the decrypted key material into state. The real key material is written
  outside Terraform.
- FR18a: Both SSM parameters carry `lifecycle { prevent_destroy = true }`. Write-only arguments
  keep the key out of state but do not stop Terraform from overwriting it: `name` is ForceNew, so
  renaming the project or re-applying against a lost state recreates the parameter and writes the
  placeholder over the operator's real signing key — and because write-only arguments are never
  read back, no later plan reports the drift. The guard turns a silent auth outage into an explicit
  plan error. It applies to the parameters only, never the table, and the teardown step it
  complicates is documented in the runbook rather than left to be discovered.
- FR19: One execution role carries one inline policy whose statements are:
  `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:Query`, `dynamodb:UpdateItem` and
  `dynamodb:ConditionCheckItem` on the table ARN; `ssm:GetParameter` on the two parameter ARNs;
  `logs:CreateLogGroup`, `logs:CreateLogStream` and `logs:PutLogEvents` on the log group; and
  `kms:Decrypt` constrained by a `kms:ViaService` condition naming the region's SSM endpoint. No
  statement grants `dynamodb:Scan`, `dynamodb:DeleteItem`, or an unconditioned wildcard resource.
- FR20: A CloudWatch log group named `/aws/lambda/<function name>` is created by the stack with
  `retention_in_days = 14`, and the function declares `depends_on` against it so the runtime does
  not create it first. The retention is set explicitly because the provider default never expires,
  which bills storage indefinitely.
- FR21: The stack exposes the load balancer DNS name, the table name and the function name as
  outputs.
- FR22: `npm run infra:check` delegates to `scripts/infra-check.sh`, which runs, in order,
  `terraform fmt -check -recursive`, `terraform init -backend=false`, `terraform validate`, and
  `terraform plan -refresh=false` (see FR23a for the exact `init` form) against the committed fixture
  `terraform/fixtures/check.tfvars`, with placeholder credentials, using a `hashicorp/terraform`
  Docker image pinned to an exact minor version at or above 1.11. It exits non-zero when any step
  fails.
- FR22a: `scripts/infra-check.sh` accepts an optional path to a variables file as its first
  argument, defaulting to the committed fixture. Without it AC-5 and AC-7 have no runnable command,
  since both prove behavior that only appears under a different set of variable values.
- FR23: Before running `init`, the check writes a `backend_override.tf` selecting the local
  backend, and removes it once the run finishes, including when a step fails. Without it, the
  declared S3 backend makes `plan` fail with "Backend initialization required".
- FR23a: The `init` step initializes that local backend rather than skipping backend
  initialization. An earlier draft of FR22 said `init -backend=false`, which is wrong and was
  caught during implementation: with the override in place the backend is still declared but
  uninitialized, so `plan` fails exactly as it would without the override. The check runs
  `init -reconfigure -backend-config=path=<throwaway>` instead, pointing state at a path inside
  the container's temporary directory. The S3 backend is never contacted and no credential is
  needed.
- FR24: The Docker invocation runs as the invoking user's uid and gid, provides a writable `HOME`,
  and mounts a persistent `TF_PLUGIN_CACHE_DIR`, so no root-owned files are left in the working
  tree and the provider is downloaded once rather than per run.
- FR25: `npm run infra:check` is invoked on demand and by this feature's verification contract. It
  is deliberately not registered in `.specify/gates/run-gates.sh`, because `terraform init`
  requires network access and a pre-commit gate that cannot run offline would block every commit
  in the repository.
- FR26: `.gitignore` covers `.terraform/`, `*.tfstate`, `*.tfstate.backup`, `backend_override.tf`
  and `*.tfvars`, with explicit negations for the two files that must be committed:
  `terraform/terraform.tfvars.example` and `terraform/fixtures/check.tfvars`. Without those
  negations FR22 and FR26 contradict each other — the check needs a fixture the ignore rule would
  keep out of the repository. `.terraform.lock.hcl` is committed.
- FR27: `docs/architecture/adr/0008-*.md` records the transport decision: ALB over API Gateway HTTP
  API and Lambda Function URL, the idle cost accepted, Amazon Cognito considered and rejected for
  authentication, and the plaintext-HTTP default with `certificate_arn` as its remedy.
- FR28: The README gains a deploy runbook covering: building the artifact, initializing against
  the state bucket, applying, writing the real RS256 material into the two SSM parameters,
  exercising the endpoint, redeploying code with `aws lambda update-function-code`, and tearing
  the stack back down.

## Acceptance Criteria

> AC-3 through AC-15 are verified by reading the plan the check produces and recording the verdict
> in `contract.md`. That is a deliberate choice over automated assertions on `terraform show -json`
> (see Out of Scope): each verdict holds for the moment it was taken and nothing re-checks it
> afterwards, so a later edit that removes a health check or widens the policy is caught by review
> rather than by a failing test.

- AC-1: Given a clean clone, Docker available, and no AWS credentials in the environment, when
  `npm run infra:check` runs, then it exits zero and reports a successful plan.
- AC-2: Given the configuration, when `terraform fmt -check -recursive` runs, then it reports no
  file needing formatting.
- AC-3: Given the configuration, when the plan is produced, then it enumerates the VPC, the two
  subnets, the load balancer, the target group, the listener, the Lambda function, the Lambda
  permission, the DynamoDB table, both SSM parameters, the execution role with its policy, and the
  log group.
- AC-4: Given the configuration, when it is searched for AWS-API data sources, then no
  `aws_caller_identity`, `aws_availability_zones`, `aws_vpc`, `aws_region` or comparable lookup is
  present.
- AC-5: Given a throwaway variables file that holds an availability zone outside the configured
  region, when a plan is attempted against it, then Terraform fails with the variable's validation
  message rather than producing a plan. The committed fixture is not modified for this check.
- AC-6: Given `certificate_arn` unset, when the plan is produced, then it contains exactly one
  listener, on port 80, forwarding to the target group, and no listener certificate.
- AC-7: Given `certificate_arn` set to a syntactically valid ARN, when the plan is produced, then
  it contains a listener on 443 carrying that certificate and a listener on 80 whose default
  action is a redirect.
- AC-8: Given the planned Lambda permission, when it is inspected, then its principal is
  `elasticloadbalancing.amazonaws.com` and its `source_arn` is the target group, and the target
  group attachment depends on it.
- AC-9: Given the planned target group, when its health check is inspected, then it is enabled
  with `path = "/health"` and `matcher = "200"`.
- AC-10: Given the planned function, when its sizing is inspected, then `memory_size` is 1024,
  `timeout` is 30, and `architectures` is `["x86_64"]`.
- AC-11: Given the planned function's environment, when it is compared against
  `src/shared/config/environment.schema.ts`, then every required variable is present except
  `AWS_REGION` and `NODE_ENV`, and neither of those two appears.
- AC-12: Given the planned DynamoDB table, when it is compared against `scripts/create-table.ts`,
  then the key schema, attribute types, billing mode and TTL attribute match, and point-in-time
  recovery is enabled.
- AC-13: Given the two SSM parameter declarations, when they are inspected, then each uses
  `value_wo` with `value_wo_version` and neither declares `value`; and when the plan output is
  searched, then it contains no parameter value — the write-only argument is reported as such
  rather than printed.
- AC-14: Given the planned IAM policy, when its statements are inspected, then the action set is
  exactly the one FR19 lists, no statement grants `dynamodb:Scan` or `dynamodb:DeleteItem`, and
  the only wildcard resource is the `kms:Decrypt` statement carrying a `kms:ViaService` condition.
- AC-15: Given the planned log group and function, when they are inspected, then the group's name
  is `/aws/lambda/` followed by the function's name and the function depends on the group.
- AC-16: Given a completed `npm run infra:check`, whether it passed or failed, when the working
  tree is inspected, then no `backend_override.tf` remains, `git status` reports no untracked
  Terraform artifacts, and no file in the tree is owned by root.
- AC-17: Given the repository, when `docs/architecture/adr/` is listed, then ADR-0008 exists and
  names the alternatives rejected — API Gateway HTTP API, Lambda Function URL, and Cognito — with
  the reason for each.
- AC-18: Given the README, when the deploy runbook is followed as written by a reader, then every
  step is a Terraform command or a named CLI command, and no step instructs the reader to use the
  AWS console.
- AC-19: Given the configuration, when it is searched for network attachments on the function,
  then no `vpc_config` block, no `aws_nat_gateway` and no `aws_vpc_endpoint` is present. This is
  the criterion that keeps FR6 honest: without it, adding any of the three would leave every other
  check green while multiplying the stack's standing cost.
- AC-20: Given the configuration, when each `.tf` file's length is measured, then none exceeds 400
  lines.

## Out of Scope

- Applying the stack. No `apply`, no live endpoint, no teardown is performed or proven; the
  runbook documents the procedure and nothing verifies it.
- CI/CD: no workflow planning on a pull request or applying on merge.
- Multiple environments: one stack, one state, no workspaces, no per-environment variable files.
- Packaging the deployment artifact inside Terraform. No `archive_file`, no build step in the
  configuration, and code redeployment is `aws lambda update-function-code` rather than
  `terraform apply` — a consequence of FR13 that the runbook states plainly.
- Bootstrapping remote state: the S3 bucket backing the backend is a prerequisite the stack cannot
  create for itself.
- Custom domains and DNS: no Route 53 records and no certificate issuance. The stack accepts a
  certificate ARN; obtaining one is the operator's job.
- WAF, CloudWatch alarms, dashboards, and tracing. The stack creates a log group and nothing else
  for observability.
- Provisioned concurrency and cold-start mitigation beyond sizing the function.
- Automated assertions over the plan. Verifying AC-3 through AC-15 by parsing
  `terraform show -json` in a test suite was considered and rejected for this phase: the verdicts
  are read by a human and recorded in `contract.md` instead. The consequence is stated in the
  Acceptance Criteria preamble — these are point-in-time verifications, not regression tests — and
  turning them into assertions is a candidate for a later feature.
- Replacing the project's own authentication with Amazon Cognito. Rejected during brainstorming;
  ADR-0008 records the reasoning rather than leaving it to be relitigated.
- Dependencies: features `001-authentication`, `002-request-throttling`, `003-catalog-listing` and
  `004-local-key-provider` are all shipped and supply the configuration surface this stack must
  satisfy. None is blocked by this feature.
