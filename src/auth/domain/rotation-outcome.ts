/**
 * The five-branch outcome of POST /auth/refresh (AC-14 through AC-18), per
 * plan.md's Technical Decisions: a discriminated union rather than a
 * cluster of booleans, so a presentation-layer switch over `kind` is
 * exhaustively checked by the compiler instead of relying on nested
 * conditionals to have covered every case.
 *
 * Every member excludes raw token material — the plan is explicit that a
 * token never appears in a log-bound value — and the two anomaly-carrying
 * members (`benign-replay`, `reuse-detected`) are exactly what the
 * presentation layer logs when it renders them, per "the anomaly event
 * leaves through the outcome, not through a port": no logger inside the use
 * case that produces this value.
 */

/**
 * AC-14: success. Field names mirror the wire response POST /auth/login
 * already uses (`accessToken`, `refreshToken`, `expiresIn`,
 * `refreshExpiresIn`) — one name per concept across layers, per the plan's
 * naming decision.
 */
export interface RotatedOutcome {
  readonly kind: 'rotated';
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly refreshExpiresIn: number;
}

/** The presented token id does not exist in storage at all — distinct from expired or retired. */
export interface UnknownTokenOutcome {
  readonly kind: 'unknown';
}

/** AC-18: the token or the session ceiling has passed, decided against the injected clock (FR21), not storage-level expiry. */
export interface ExpiredOutcome {
  readonly kind: 'expired';
}

/** AC-15: a retired token was replayed but its successor is still the live, unrotated tip. */
export interface BenignReplayOutcome {
  readonly kind: 'benign-replay';
  readonly accountId: string;
}

/** AC-16: a retired token was replayed and its successor has itself been rotated — proof of a second chain. */
export interface ReuseDetectedOutcome {
  readonly kind: 'reuse-detected';
  readonly accountId: string;
}

export type RotationOutcome =
  | RotatedOutcome
  | UnknownTokenOutcome
  | ExpiredOutcome
  | BenignReplayOutcome
  | ReuseDetectedOutcome;
