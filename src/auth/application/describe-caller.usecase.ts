/**
 * Backs `GET /auth/me` (FR13, AC-8). The caller's id and email are already
 * on the verified access token the guard checked before this use case ever
 * runs, so there is no storage read here at all — `execute` only renames the
 * token's claim fields into the wire response shape, kept as a use case
 * purely so the controller has the same "controller calls a use case" shape
 * every other route in this feature already has, per the constitution's
 * layering, even though the behavior itself is a field rename.
 *
 * Takes a structural `{ accountId; email }` shape rather than importing the
 * presentation layer's `AuthClaims` type — the application layer does not
 * depend on presentation, per the architecture's dependency rule.
 */

export interface DescribeCallerResult {
  readonly accountId: string;
  readonly email: string;
}

export class DescribeCaller {
  execute(claims: { accountId: string; email: string }): DescribeCallerResult {
    return { accountId: claims.accountId, email: claims.email };
  }
}
