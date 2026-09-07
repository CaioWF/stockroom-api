# Product Requirements Document (PRD)

> Product context (who the user is, what the product is, the north-star metric) lives in the
> brief at `.specify/memory/product.md`. This PRD **references** that brief and records only what
> is specific to THIS feature.

## Problem

- Stockroom exists as a working application with no environment to run in. Four features have
  shipped — authentication, throttling, catalog listing, local key loading — and every one of them
  is reachable only from a laptop. The service has never been deployed, and nothing in the
  repository describes how it would be.
- The brief's north-star is weekly active integrations: distinct API clients that read the catalog
  at least once in a rolling week. That number is structurally zero until an address exists that a
  client outside this machine can call. No amount of further feature work moves it.
- The gap is not only "we have not deployed yet". It is that the deployment has no definition.
  A console-built environment cannot be reviewed, cannot be rebuilt after an accident, and cannot
  be handed to anyone else — which is why the constitution requires infrastructure to be Terraform
  and reproducible from a clean clone.

## Hypothesis

- Declaring the whole environment as Terraform in this repository turns deployment from an
  undocumented act into a reviewable artifact: the topology, the permissions, and the
  configuration become code that a reader can audit and a gate can check.
- It should work because the application was built for this shape rather than retrofitted into it.
  `src/lambda.ts` is already an ALB-event handler, the key providers already read Parameter Store,
  and `scripts/create-table.ts` already fixes the table's shape. The stack encodes decisions the
  code has been making since feature 001; it does not invent new ones.
- The second half of the hypothesis is that a stack can be trusted without ever being applied.
  `terraform validate` and a credential-less `plan` catch reference errors, type errors and
  missing arguments — the failure modes that dominate a first-draft configuration — while the
  failures they cannot catch are named explicitly instead of being discovered later.

## User/Context

- Inherits the target user from the product brief. This feature adds one reader who is not that
  user: the operator applying the stack, who is the author or a reviewer, and whose only interface
  is the runbook and the variables file.
- Scenario A — a reviewer clones the repository and wants to know what gets created in AWS and
  with what permissions, without an AWS account and without applying anything.
- Scenario B — an operator with an AWS account runs the runbook end to end and gets a reachable
  API, then tears it back down.
- Constraint that shapes everything: **no AWS account is available while this feature is built.**
  Success is defined against `fmt`, `validate` and `plan`, never against `apply`. The design in
  `brainstorm.md` is bent around that constraint — no AWS-API data sources, provider skip flags,
  a transient local-backend override — and those are requirements, not preferences.
- Constraint from the challenge this project answers: Terraform for the infrastructure and
  DynamoDB for persistence are mandatory, so this feature closes a required deliverable.

## Success Metric

- **Primary:** from a clean clone with Docker available and no AWS credentials, one command
  (`npm run infra:check`) produces a formatted, valid, fully planned configuration — a plan that
  enumerates every resource the environment needs and errors on none of them.
- **Secondary:** the deploy runbook contains zero manual console steps. Every resource is created
  by Terraform or by a named CLI command; nothing is "click here". The two exceptions are stated
  as prerequisites, not omissions: the remote-state bucket, and the RS256 key material that must
  stay out of Terraform state.
- **Evaluation:** each acceptance criterion in `spec.md` names a command and an observable in
  `contract.md`. A criterion that could only be proven by applying the stack is not written as a
  criterion — it goes to the runbook, and the PRD says so here rather than letting the gap look
  like an oversight.

## Dependencies & Interfaces

**Consumes (inputs)** — what this feature depends on to work:

- `specs/001-authentication` → the environment-variable contract in
  `src/shared/config/environment.schema.ts`, the two SSM parameter names the key providers read,
  and the `NODE_ENV` allow-list that decides which key provider is wired.
- `specs/002-request-throttling` → the throttle configuration variables the function must carry.
- `specs/003-catalog-listing` → the read path that determines which DynamoDB actions the execution
  role needs.
- `scripts/create-table.ts` → the table's authoritative shape: key schema, billing mode, TTL
  attribute.
- The build pipeline (`npm run build`) → the deployment artifact. This feature consumes a zip; it
  does not produce one.
- An operator-supplied ACM certificate ARN, when a real deployment wants TLS. Absent by default.

**Exposes (outputs)** — what this feature now offers to others:

- A deployable environment definition in `terraform/`, with the ALB DNS name, the table name and
  the function name as Terraform outputs.
- `npm run infra:check` — the on-demand verification command, consumed by this feature's
  verification contract and by `implement-and-evaluate`.
- The deploy runbook in the README, consumed by the operator.
- ADR-0008, which records the transport decision, its idle cost, and the alternatives rejected —
  consumed by anyone who later asks why this is an ALB and not API Gateway, or why authentication
  is not Cognito.

**Dependencies** — couplings with explicit direction:

- `specs/001-authentication`, `specs/002-request-throttling`, `specs/003-catalog-listing`,
  `specs/004-local-key-provider` — all shipped; each supplies part of the configuration surface
  this stack must satisfy. None is blocked by this feature.
- No sibling feature is blocked by this one. A real deployment is, and so is any future feature
  that needs a running environment to be proven.
- External prerequisite, out of this feature's control: the S3 bucket backing remote state must
  exist before the stack is first initialized against it. Terraform cannot create the bucket that
  holds its own state.

## Out of Scope

- **Applying the stack.** No `apply`, no live endpoint, no teardown. The runbook documents the
  procedure; nothing proves it here.
- **CI/CD.** No workflow running plan on a pull request or apply on merge.
- **Multiple environments.** One stack, one state, no workspaces, no per-environment variable
  files.
- **Packaging the artifact inside Terraform.** No `archive_file`, no build step in the
  configuration. The zip is built and published outside it, and code redeployment is
  `aws lambda update-function-code`, not `terraform apply`.
- **Bootstrapping remote state.** The state bucket and any lock configuration are a prerequisite.
- **Custom domain and DNS.** No Route 53 records, no certificate issuance. The stack accepts a
  certificate ARN; it does not obtain one.
- **WAF, alarms, dashboards, tracing.** CloudWatch gets a log group and nothing else.
- **Provisioned concurrency and any cold-start mitigation** beyond sizing the function correctly.
- **Replacing the project's own authentication with Cognito.** Considered during brainstorming and
  rejected; recorded in ADR-0008 rather than reopened here.
