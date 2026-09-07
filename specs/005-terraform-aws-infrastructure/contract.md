# Terraform AWS Infrastructure — Verification Contract

> One caveat governs this whole document: **no AWS account is in play and the stack is never
> applied.** Every proof below runs against a plan, a configuration file, or a document. Nothing
> here proves the environment works in AWS, and no status in this file should ever be read as
> saying it does.
>
> AC-3 through AC-15 are read by a human from the plan the check produces, a choice made during
> `clarify` over asserting on `terraform show -json`. Their verdicts are point-in-time: nothing
> re-runs them, so a later edit that removes a health check is caught by review, not by a failure.
> `status: PASS` on those lines means "read and confirmed on the run that stamped it".

## Environment

- **start**: `docker info` must succeed — the check runs Terraform in a container and does not use
  a host binary. Nothing else is brought up; DynamoDB Local is irrelevant to this feature.
- **env**: none. The check supplies placeholder AWS credentials itself and the provider's skip
  flags keep them from being validated. Do not export real credentials for these commands.
- **fixtures**: `terraform/fixtures/check.tfvars`, committed. AC-5 additionally needs a throwaway
  variables file holding a deliberately mismatched availability zone; it is created in a temporary
  directory and is never committed.
- **credentials**: N/A — no AWS account, no test user, no token.
- **teardown**: the check removes its own `backend_override.tf` on every exit path. After a run,
  `git status --porcelain` must be empty and `find terraform -user root` must print nothing.

## AC-1 — Check succeeds without credentials

- **proof**: `scripts/infra-check.sh` end to end
- **command**: `env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_PROFILE npm run infra:check`
- **observable**: exit code 0, and the plan's closing summary line reporting resources to add with
  no error
- **status**: PASS

## AC-2 — Formatting is canonical

- **proof**: the `fmt` step inside the check
- **command**: `npm run infra:check`
- **observable**: `terraform fmt -check -recursive` names no file
- **status**: PASS

## AC-3 — Plan enumerates every resource

- **proof**: manual read of the plan
- **command**: `npm run infra:check`
- **observable**: the plan lists the VPC, two subnets, internet gateway, route table, security
  group, load balancer, target group, listener(s), Lambda function, Lambda permission, target group
  attachment, DynamoDB table, two SSM parameters, IAM role, IAM role policy, and log group
- **status**: PASS

## AC-4 — No AWS-API data sources

- **proof**: static search of the configuration
- **command**: `grep -rn '^\s*data "aws_' terraform/`
- **observable**: no matches
- **status**: PASS

## AC-5 — Availability zones are validated against the region

- **proof**: manual — plan against a throwaway tfvars whose zone is outside `var.region`
- **command**: `printf 'availability_zones = ["eu-west-1a","eu-west-1b"]\n' > /tmp/bad-az.tfvars && bash scripts/infra-check.sh /tmp/bad-az.tfvars`
- **observable**: non-zero exit, Terraform prints the variable's validation message, and no plan is
  produced
- **status**: PASS

## AC-6 — No certificate yields HTTP only

- **proof**: manual read of the plan produced from the committed fixture, in which
  `certificate_arn` is null
- **command**: `npm run infra:check`
- **observable**: exactly one `aws_lb_listener`, `port = 80`, `protocol = "HTTP"`, default action
  forwarding to the target group, and no `certificate_arn` on it
- **status**: PASS

## AC-7 — A certificate yields HTTPS plus redirect

- **proof**: manual — plan against a throwaway tfvars supplying a syntactically valid ACM ARN
- **command**: `cp terraform/fixtures/check.tfvars /tmp/tls.tfvars && printf 'certificate_arn = "arn:aws:acm:us-east-1:000000000000:certificate/00000000-0000-0000-0000-000000000000"\n' >> /tmp/tls.tfvars && bash scripts/infra-check.sh /tmp/tls.tfvars`
- **observable**: an `aws_lb_listener` on 443 carrying the ARN, and a listener on 80 whose default
  action type is `redirect`
- **status**: PASS

## AC-8 — ALB is permitted to invoke the function

- **proof**: manual read of the plan
- **command**: `npm run infra:check`
- **observable**: `aws_lambda_permission` with `principal = "elasticloadbalancing.amazonaws.com"`
  and `source_arn` referencing the target group; the attachment declares `depends_on` against it
- **status**: PASS

## AC-9 — Health check points at a route that exists

- **proof**: manual read of the plan, cross-checked against `src/health/health.controller.ts`
- **command**: `npm run infra:check`
- **observable**: the target group's `health_check` is enabled with `path = "/health"` and
  `matcher = "200"`
- **status**: PASS

## AC-10 — Function sizing is explicit

- **proof**: manual read of the plan
- **command**: `npm run infra:check`
- **observable**: `memory_size = 1024`, `timeout = 30`, `architectures = ["x86_64"]`
- **status**: PASS

## AC-11 — Environment matches the application schema

- **proof**: manual — compare the planned `environment.variables` against
  `src/shared/config/environment.schema.ts`
- **command**: `npm run infra:check`
- **observable**: every variable the schema requires is present; `AWS_REGION` and `NODE_ENV` are
  both absent
- **status**: PASS

## AC-12 — Table matches the creation script

- **proof**: manual — compare the planned table against `scripts/create-table.ts`
- **command**: `npm run infra:check`
- **observable**: matching key schema and attribute types, `PAY_PER_REQUEST`, TTL on `ttl`, and
  point-in-time recovery enabled
- **status**: PASS

## AC-13 — Key material never reaches state or plan

- **proof**: static check of the declarations plus a search of the plan output
- **command**: `grep -n 'value_wo\|value_wo_version\|^\s*value ' terraform/data.tf` and
  `npm run infra:check`
- **observable**: both parameters declare `value_wo` and `value_wo_version`; neither declares
  `value`; the plan shows the write-only argument as such and prints no parameter value
- **status**: PASS

## AC-14 — Execution policy is an allow-list

- **proof**: manual read of the planned IAM policy document
- **command**: `npm run infra:check`
- **observable**: the DynamoDB statement holds exactly `GetItem`, `PutItem`, `Query`, `UpdateItem`,
  `ConditionCheckItem`; no `Scan` or `DeleteItem` appears anywhere; the only `"*"` resource is the
  `kms:Decrypt` statement, and it carries a `kms:ViaService` condition
- **status**: PASS

## AC-15 — Log group is declared and ordered before the function

- **proof**: manual read of the plan
- **command**: `npm run infra:check`
- **observable**: the group's name is `/aws/lambda/` plus the function's name,
  `retention_in_days = 14`, and the function declares `depends_on` against the group
- **status**: PASS

## AC-16 — The check leaves the tree clean

- **proof**: inspection after both a passing and a deliberately failing run
- **command**: `npm run infra:check; git status --porcelain; ls terraform/backend_override.tf; find terraform -user root`
- **observable**: no `backend_override.tf`, empty `git status`, and no root-owned file — after the
  passing run and after a run made to fail
- **status**: PASS

## AC-17 — The transport decision is recorded

- **proof**: the ADR document
- **command**: `ls docs/architecture/adr/0008-*.md && grep -c 'API Gateway\|Function URL\|Cognito' docs/architecture/adr/0008-*.md`
- **observable**: the file exists and names all three rejected alternatives with a reason for each
- **status**: PASS

## AC-18 — The runbook needs no console

- **proof**: manual read of the README's runbook section
- **command**: `grep -n -i 'console\|click\|navigate to' README.md`
- **observable**: no step instructs the reader to use the AWS console; every step is a Terraform
  command or a named CLI command
- **status**: PASS

## AC-19 — The function stays out of the VPC

- **proof**: static search of the configuration
- **command**: `grep -rn 'vpc_config\|aws_nat_gateway\|aws_vpc_endpoint' terraform/`
- **observable**: no matches. A match means the stack acquired a network footprint the cost
  argument in `brainstorm.md` assumed it would not have
- **status**: PASS

## AC-20 — No file exceeds the size limit

- **proof**: static measurement
- **command**: `over=""; for f in terraform/*.tf; do n=$(wc -l < "$f"); [ "$n" -gt 400 ] && { echo "$f: $n"; over=1; }; done; [ -z "$over" ]`
- **observable**: no file is printed and the command exits zero. An earlier version of this check
  parsed `wc -l`'s multi-file output and filtered the summary row by the literal `total`; this
  environment's `wc` prints `Σ` instead, so the summary row survived the filter and the check
  failed on a compliant configuration. Anything reading `wc`'s summary row is fragile — measure
  each file separately
- **status**: PASS

## Full-Suite Check

- **command**: `npm run infra:check && npm run test:unit && npm run test:integration && npm run test:e2e && .specify/gates/run-gates.sh`
- **observable**: the check passes, all three suites pass unchanged (evidence the feature touched
  no application code), and the gates report green
- **status**: PASS
