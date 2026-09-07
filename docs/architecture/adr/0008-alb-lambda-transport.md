---
type: adr
title: ALB Lambda transport
description: Stockroom reaches Lambda through an Application Load Balancer, accepting the idle cost to avoid changing the application event contract.
---

# ADR-0008: ALB Lambda transport

- **Status:** accepted
- **Date:** 2026-09-06
- **Decision makers:** caiowf

## Context

Feature 005 adds AWS infrastructure for the existing NestJS application without changing `src/` or
`test/`. The current Lambda adapter receives an ALB-shaped event in `src/lambda.ts`; replacing that
event with another gateway shape would make an infrastructure feature rewrite application code and
its tests.

The product constitution says idle costs should be zero unless a durable decision accepts the
cost. An Application Load Balancer has an always-on charge, roughly US$16 per month before traffic.
That cost is visible enough to deserve an ADR rather than a comment in Terraform.

The stack must also work before a domain and certificate exist. TLS can be added later through an
ACM certificate ARN, but the absence of that ARN cannot block a first deployment.

## Decision

We will expose the Lambda through an Application Load Balancer. The Terraform stack creates an ALB,
a Lambda target group, a listener, a scoped `aws_lambda_permission`, and a target-group attachment.

We accept the idle ALB cost because it keeps the application event contract intact. When
`certificate_arn` is null the stack serves plaintext HTTP on port 80. When `certificate_arn` is set
the stack serves HTTPS on 443 and redirects port 80 to it.

Authentication remains inside Stockroom. The infrastructure stores the existing RS256 key material
in SSM parameters and does not replace the application's auth flow with a managed identity product.

## Alternatives considered

- **API Gateway HTTP API** — rejected because it delivers `APIGatewayProxyEventV2`, which would
  force a rewrite of `src/lambda.ts` and its tests during an infrastructure-only feature.
- **Lambda Function URL** — rejected for the same event-contract reason: it also delivers
  `APIGatewayProxyEventV2`, so it changes application behavior instead of only provisioning AWS
  resources.
- **Amazon Cognito for authentication** — rejected because it would delete feature 001's local auth
  model, gut feature 002's credential-route throttling, moot ADR-0006, and remove the e2e suite's
  offline key-provider path. `test/e2e/auth/support/build-test-app.ts` injects in-memory RS256 keys
  today; Cognito has no open local emulator equivalent.

## Consequences

- **Positive:** the Lambda adapter and tests stay unchanged. The Terraform stack is responsible for
  transport only, so the feature remains infrastructure scoped.
- **Positive:** the same module can plan without a certificate and later plan with TLS by setting
  one variable.
- **Negative / trade-offs:** the load balancer creates a standing cost, currently about US$16 per
  month before traffic. That is worse than the near-zero idle cost of API Gateway HTTP API or
  Lambda Function URL.
- **Negative / trade-offs:** the default deployment is plaintext HTTP until the operator supplies
  an ACM certificate ARN.
- **Neutral:** authentication and token semantics remain owned by Stockroom rather than AWS.
