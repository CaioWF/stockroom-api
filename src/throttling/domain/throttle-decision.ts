/**
 * The outcome of an admission decision (`throttle-policy.ts#decideAdmission`).
 * A refusal cannot be constructed without its retry hint — a discriminated
 * union over `kind` rather than a boolean-plus-optional-fields (TypeScript
 * lens) — so there is no code path where a caller can render "refused"
 * without also having a `Retry-After` value to emit.
 */
export type ThrottleDecision =
  | { readonly kind: 'admitted' }
  | { readonly kind: 'refused'; readonly retryAfterSeconds: number };
