# Tasks — Terraform AWS Infrastructure

## Implementation Checklist

> Every task declares `[scope: terraform/**, …]` covering `terraform/variables.tf`, because every
> task adds its own variables to that one file. That is not padding — it is the shared-file gravity
> the plan identified, and it is why this feature runs as a chain rather than in
> `dispatch-parallel`. The scopes are honest, and their overlap is the reason for the ordering.

- [x] Task 1: Lay the foundation — `.gitignore` Terraform entries with the two negations, and a
      resource-free configuration (`versions.tf`, `providers.tf`, a minimal `variables.tf`,
      `fixtures/check.tfvars`), establishing the flat-root-module layout FR1 requires
      [scope: .gitignore, terraform/**]
- [x] Task 2: Build the verification harness — `scripts/infra-check.sh` (taking an optional
      variables-file argument) and the `infra:check` npm script, with the transient backend
      override cleaned up on every exit path, and deliberately NOT registered in
      `.specify/gates/run-gates.sh` per FR25 (AC-1, AC-2, AC-16, AC-20)
      [scope: scripts/infra-check.sh, package.json, terraform/**]
- [x] Task 3: Declare the network — VPC, internet gateway, two public subnets, route table and
      associations, load balancer security group, and the availability-zone validation; no NAT
      gateway and no VPC endpoints, per FR6 (AC-4, AC-5, AC-19) [scope: terraform/**]
- [x] Task 4: Declare the data layer — the DynamoDB table and both write-only SSM parameters
      (AC-12, AC-13) [scope: terraform/**]
- [x] Task 5: Declare compute — log group, execution role with its inline policy, and the Lambda
      function with its environment and sizing, carrying no `vpc_config` per FR6 (AC-10, AC-11,
      AC-14, AC-15, AC-19) [scope: terraform/**]
- [x] Task 6: Declare the edge — load balancer across the two subnets, `lambda` target group with
      its health check and attachment (FR7), the certificate-conditional listeners, and the Lambda
      permission (AC-6, AC-7, AC-8, AC-9) [scope: terraform/**]
- [x] Task 7: Close the interface — outputs, `terraform.tfvars.example`, and the committed
      `.terraform.lock.hcl` (AC-3) [scope: terraform/**]
- [x] Task 8: Write ADR-0008 recording the transport decision and its rejected alternatives
      (AC-17) [scope: docs/architecture/adr/**, docs/okf-index.json]
- [x] Task 9: Write the deploy runbook into the README (AC-18) [scope: README.md]
- [x] Task 10: Final verification — full `npm run infra:check`, the three test suites,
      `.specify/gates/run-gates.sh`, and a read of the plan stamping every verdict into
      `contract.md` [scope: specs/005-terraform-aws-infrastructure/**]

## Subtasks

### Task 1
- [ ] Add `.terraform/`, `*.tfstate`, `*.tfstate.backup`, `backend_override.tf` and `*.tfvars` to
      `.gitignore`, with negations for `terraform/terraform.tfvars.example` and
      `terraform/fixtures/check.tfvars` (FR26)
- [ ] `versions.tf`: `required_version >= 1.11`, pinned `hashicorp/aws` constraint, `backend "s3"`
      in partial-configuration form (FR2)
- [ ] `providers.tf`: the `aws` provider with `skip_credentials_validation`,
      `skip_requesting_account_id`, `skip_metadata_api_check` (FR3)
- [ ] `variables.tf`: `region` (default `us-east-1`), `availability_zones` (default
      `["us-east-1a", "us-east-1b"]`), `project_name` (default `stockroom`) (FR3, FR4, FR4a)
- [ ] `fixtures/check.tfvars`: the values the check plans against

### Task 2
- [ ] `scripts/infra-check.sh` following the shape of `scripts/swagger-ui.sh`: pinned image tag,
      bind mount, `-u $(id -u):$(id -g)`, writable `HOME`, mounted `TF_PLUGIN_CACHE_DIR` (FR24)
- [ ] Accept an optional variables-file path as `$1`, defaulting to
      `terraform/fixtures/check.tfvars` (FR22a). AC-5 and AC-7 have no runnable command without it
- [ ] Do NOT add the check to `.specify/gates/run-gates.sh` or `pack.d/` (FR25). The omission is
      the requirement; a later reviewer who "fixes" it is reverting a recorded decision
- [ ] Write `backend_override.tf` selecting the local backend before `init`, and remove it from a
      `trap` so it goes on every exit path including failure (FR23)
- [ ] Run `fmt -check -recursive`, `init -backend=false`, `validate`, `plan -refresh=false`, in
      that order, exiting non-zero on the first failure (FR22)
- [ ] Add `infra:check` to `package.json` scripts
- [ ] Verify: the command exits zero on the resource-free config, `git status` stays clean, no
      file in the tree is owned by root, and no `.tf` exceeds 400 lines (AC-1, AC-2, AC-16, AC-20)

### Task 3
- [ ] VPC, internet gateway, route table with its default route and subnet associations, two
      public subnets across the configured zones (FR5)
- [ ] Security group admitting inbound 80 and 443 to the load balancer
- [ ] `validation` block on `availability_zones` asserting each zone starts with `var.region`
- [ ] Verify: no `data "aws_…"` lookup anywhere in the configuration (AC-4); a throwaway tfvars
      with a mismatched zone fails with the validation message (AC-5); no `aws_nat_gateway` and no
      `aws_vpc_endpoint` anywhere (AC-19)

### Task 4
- [ ] DynamoDB table: string partition and sort keys, `PAY_PER_REQUEST`, TTL on `ttl`,
      point-in-time recovery enabled, no deletion protection and no `prevent_destroy` (FR17)
- [ ] Two `SecureString` parameters using `value_wo` and `value_wo_version`, never `value` (FR18)
- [ ] Verify against `scripts/create-table.ts` field by field (AC-12); confirm the plan prints no
      parameter value (AC-13)

### Task 5
- [ ] Log group `/aws/lambda/${function name}` with `retention_in_days = 14` (FR20)
- [ ] Execution role and inline policy with exactly the actions FR19 lists, the `kms:Decrypt`
      statement carrying its `kms:ViaService` condition, and no `Scan`/`DeleteItem` (FR19)
- [ ] Lambda function: `filename` from a variable, no `source_code_hash`, `memory_size = 1024`,
      `timeout = 30`, `architectures = ["x86_64"]`, `depends_on` the log group (FR12, FR13, FR20)
- [ ] Environment block carrying every variable `environment.schema.ts` requires except
      `AWS_REGION` and `NODE_ENV`, with `JWT_ISSUER` from its own variable and `TABLE_NAME` plus
      the parameter names interpolated from the resources (FR14, FR15, FR16)
- [ ] Verify sizing, environment, policy and log group against the plan (AC-10, AC-11, AC-14,
      AC-15), and that the function carries no `vpc_config` (AC-19)

### Task 6
- [ ] Load balancer in the two subnets with the security group
- [ ] Target group `target_type = "lambda"`, `lambda_multi_value_headers_enabled = false` with the
      comment FR11 requires, and an explicit `health_check` at `/health` matching `200` (FR10,
      FR11)
- [ ] Listeners conditional on `var.certificate_arn`: null yields HTTP-only on 80; an ARN yields
      HTTPS on 443 plus a redirect on 80 (FR8)
- [ ] `aws_lambda_permission` for `elasticloadbalancing.amazonaws.com` scoped by `source_arn` to
      the target group, and the attachment with `depends_on` against it (FR9)
- [ ] Verify both certificate paths plan correctly (AC-6, AC-7) and the permission and health
      check are as specified (AC-8, AC-9)

### Task 7
- [ ] `outputs.tf`: load balancer DNS name, table name, function name (FR21)
- [ ] `terraform.tfvars.example` covering every variable an operator must set
- [ ] Commit `.terraform.lock.hcl`
- [ ] Verify the plan enumerates every resource the spec lists (AC-3)

### Task 8
- [ ] `docs/architecture/adr/0008-alb-lambda-transport.md` via the `adr-writer` skill: ALB chosen,
      the idle cost accepted, API Gateway HTTP API and Lambda Function URL rejected with reasons,
      Cognito rejected for authentication with its reason, and the plaintext-HTTP default with
      `certificate_arn` as the remedy (FR27)
- [ ] Regenerate the OKF index (`.specify/gates/okf-build-index.mjs build docs`)
- [ ] Verify the ADR exists and names all three rejected alternatives (AC-17)

### Task 9
- [ ] README runbook: build the artifact, `init` against the state bucket, `apply`, write the real
      RS256 material into the two parameters with `aws ssm put-parameter`, exercise the endpoint,
      redeploy code with `aws lambda update-function-code`, tear the stack down (FR28)
- [ ] Verify every step is a Terraform or named CLI command, with no console instruction (AC-18)

### Task 10
- [ ] `npm run infra:check` end to end
- [ ] `npm run test:unit`, `npm run test:integration`, `npm run test:e2e` — all three unchanged and
      passing, evidence the feature touched no application code
- [ ] `.specify/gates/run-gates.sh`
- [ ] Read the plan and stamp every AC verdict into `contract.md`

## Blockers

- Docker must be running and able to reach `registry.terraform.io` on the first
  `npm run infra:check`. Later runs use the mounted plugin cache and need no network.
- No AWS account and no credentials are available. Nothing in this checklist applies the stack;
  every apply, teardown and live-endpoint step exists only as documentation in Task 9.
- The exact `hashicorp/terraform` image tag must be confirmed against the registry at Task 2 time
  rather than assumed — the requirement is an exact minor pin at or above 1.11, not `latest`.

## Notes

- Tasks run in order, inline. They are not parallelizable: every one of them writes to
  `terraform/variables.tf`, and Tasks 5, 6 and 7 reference resources the earlier tasks declare.
- After Task 2, every subsequent task ends with `npm run infra:check` green. That is the feature's
  red-green rhythm: see the resource absent from the plan, declare it, see it appear. There is no
  application code here and therefore no unit test to fail first — the plan says so explicitly
  rather than dressing the difference up.
- Subagents dispatched for any task implement, verify and report only. They never commit.
- `contract.md` records AC-3 through AC-15 as human reads of the plan. Those verdicts are
  point-in-time and nothing re-checks them later; that trade-off was chosen in `clarify` and is
  recorded in the spec.
