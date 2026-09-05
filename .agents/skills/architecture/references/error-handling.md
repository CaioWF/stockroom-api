# Error handling (language-agnostic)

How failure is represented, where it is handled, and what it says. Generated code fails here
more than anywhere else in this guide set, and it fails in a specific direction: toward code
that *looks* like it handled the problem. A swallowed exception and a working path are
indistinguishable at a glance, and both make the tests pass.

## Expected failure vs bug

Two categories, handled differently. Confusing them is the root of most bad error code.

- **Expected failure** is part of the domain: the email is already taken, the balance is
  insufficient, the token expired. It has a name, the caller must deal with it, and it belongs
  in the signature — a result type, a typed error, a documented exception. Not an assertion.
- **Bug** is a broken assumption: a null that cannot be null, an unreachable branch, a
  malformed internal call. Nobody handles it locally. It propagates to the boundary, gets
  logged with context, and returns a generic response.

If you cannot say which of the two a `catch` is for, the `catch` is wrong.

## The rules that matter

**Never swallow.** An empty catch, a catch that only logs and continues, a default value
returned on failure — each converts a loud failure into a quiet wrong answer. If there is
genuinely nothing to do, the failure still propagates; handled means the caller's contract is
satisfied, not that the exception stopped moving.

**A fallback is a decision, not a reflex.** Returning empty on a failed fetch is correct when
empty is a truthful answer, and corrupting when the caller cannot tell none from unknown. Make
the difference visible in the type or the return, never by convention.

**Handle at the boundary, not in the middle.** Inner layers propagate; one place per entry
point (HTTP handler, CLI, job runner, message consumer) translates failure into a response. A
middle-layer try/catch that re-throws the same thing adds a stack frame and nothing else.

**Never catch broadly to keep going.** Catching the base error type around a block and
continuing discards the distinction above by construction. Catch the specific failure you can
answer for.

**Fail fast at the trust boundary.** Validate once, where untrusted data enters, and reject
with a message that says what was wrong. Downstream code re-checking the same thing is
asserting that validation does not work.

## What the message must contain

An error a human cannot act on costs a debugging session. Three things, always:

1. **What was being attempted** — the operation, not just the symptom.
2. **The offending value** — the actual input that failed, not "invalid input".
3. **The expected shape** — what would have been accepted.

```
bad:  Validation failed
bad:  Invalid date
good: parsing start_date: got '2026-13-01', expected YYYY-MM-DD with month 01-12
```

Never put secrets, tokens, or personal data in a message — that outweighs detail. Redact the
value rather than dropping the field.

## Context and wrapping

When an error crosses a layer, add what that layer knows and preserve the original: the cause
chain is the only record of where it started. Wrapping that discards the cause turns a
five-second diagnosis into a search. Wrapping that adds only a second message is noise — if the
layer has no context to contribute, let it propagate untouched.

## Red flags

- A catch with an empty body, or whose body is only a log statement.
- Returning null, an empty list, or false from a catch where the caller cannot distinguish that
  from a real result.
- A try wrapping an entire function body.
- The same failure caught and re-thrown in three layers.
- Messages built only from a constant string.
- Retry with no bound, no backoff, and no eventual failure.
- A boolean return for something that has more than one failure reason.

## How to apply

In plan-writer, list the expected failures per use case alongside the happy path — they are
part of the contract, and an acceptance criterion covering only success is incomplete. In
implement-feature, decide the representation (result type vs exception) once per project and
follow it; mixing both for the same category is how "did this throw or return?" becomes a
per-call-site question.

## Enforcement

Partly mechanical, partly not. Empty-catch and broad-catch patterns are lintable in most
languages (`no-empty`, `errcheck`, `bare-except`) and belong in a per-language pack. Whether a
fallback is truthful, and whether a message is actionable, is judgment — a review concern, and
the silent-failure angle of `code-review`.
