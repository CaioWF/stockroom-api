---
type: gotchas
title: Gotchas
description: Traps in this repo and the way past each one.
---

## dispatch-parallel worktree isolation uses a stale base pre-commit

Symptom: an `isolation: "worktree"` dispatch silently builds against an old tree, producing a
weaker implementation or a false BLOCKED report. Cause: this project commits only at milestone
boundaries, so a worktree created "at HEAD" predates any uncommitted task work. Fix: do not use
`isolation: "worktree"` for dispatch-parallel until the feature's first real commit lands; dispatch
solo in the main worktree instead.

## rtk truncates long Bash output silently

Symptom: `npx jest ... | tail -N` through the `rtk` proxy shows only the first ~2000 chars,
cutting off the actual pass/fail summary without any visible truncation marker beyond a short
`[full output: ...]` line. Fix: use `rtk proxy <cmd>` to bypass filtering when you need the real
tail of a long-running command's output (e.g. a full e2e run).

## Jest's positional test filter matches file paths, not test names

Symptom: `npm run test:e2e -- me` (intending to target `me.e2e-spec.ts`) runs every e2e file
instead. Cause: Jest's bare positional argument is a path-substring match, and this checkout lives
under `/home/...`, which contains "me". Fix: use a longer, disambiguating substring like
`-- auth/me`.

## eval-spec-fidelity.mjs excludes scripts/ from its SPEC_DEVIATION count

A `SPEC_DEVIATION` comment inside `scripts/*.ts` never inflates the gate's reported total — its
`SKIP` set deliberately excludes `scripts/`. A lower-than-expected count there is correct gate
behavior, not a sign the marker was missed.

## serverless-express shadows Express req.ip

Symptom: trusting Express `req.ip` under the Lambda transport gives an empty or caller-controlled
identity instead of the ALB-appended hop. Cause: `@codegenie/serverless-express` assigns its own
`ip` property on the request object, shadowing Express's prototype getter, and ALB events do not
carry the `requestContext.identity.sourceIp` field that assignment reads. Fix: derive the throttle
identity directly from the right-most `X-Forwarded-For` entry.

## DynamoDBDocumentClient leaves failed-condition items raw

Symptom: a failed conditional write with `ReturnValuesOnConditionCheckFailure: 'ALL_OLD'` returns
an `Item`, but mapper code sees raw DynamoDB `AttributeValue` fields rather than plain document
values. Cause: `DynamoDBDocumentClient` unmarshalls successful responses, not the `Item` attached
to `ConditionalCheckFailedException`. Fix: explicitly `unmarshall` that exception item before
branching on rollover or saturation.
