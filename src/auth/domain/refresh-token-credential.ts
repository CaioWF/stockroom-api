/**
 * The parsed wire form of a refresh token (FR14): `<accountId>.<tokenId>.<secret>`,
 * where both ids are UUIDv7 (RFC 9562) and the secret carries 256 bits of
 * randomness. Both ids end up in a storage key, so parsing is strict:
 * exactly three segments, each id matching the UUIDv7 layout exactly, and
 * the secret exactly the length base64url gives 256 bits. Anything else is
 * refused here (AC-20) — an unbounded segment reaching a storage key could
 * exceed the engine's partition-key limit, turning a bad request into an
 * infrastructure error.
 *
 * Segment encoding: every segment is restricted to the base64url alphabet
 * (`[A-Za-z0-9_-]`), which by construction excludes '.'. That is what makes
 * splitting the wire string on '.' unambiguous — a segment can never smuggle
 * an extra separator into what looks like the middle of the token.
 *
 * @example
 * // wireToken === `${accountId}.${tokenId}.${secret}`
 * RefreshTokenCredential.parse(wireToken).getAccountId() // the first segment
 */

const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// 256 bits at 6 bits/char (base64url, unpadded) is ceil(256 / 6) = 43 chars.
const SECRET_LENGTH = 43;
const SECRET_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${SECRET_LENGTH}}$`);

export type RefreshTokenCredentialRejectionReason =
  | 'segment-count'
  | 'invalid-account-id'
  | 'invalid-token-id'
  | 'invalid-secret';

export class InvalidRefreshTokenCredentialError extends Error {
  constructor(public readonly reason: RefreshTokenCredentialRejectionReason) {
    super(`invalid refresh token credential: ${reason}`);
    this.name = 'InvalidRefreshTokenCredentialError';
  }
}

export class RefreshTokenCredential {
  private constructor(
    private readonly accountId: string,
    private readonly tokenId: string,
    private readonly secret: string,
  ) {}

  static parse(wireToken: unknown): RefreshTokenCredential {
    if (typeof wireToken !== 'string') {
      throw new InvalidRefreshTokenCredentialError('segment-count');
    }

    const segments = wireToken.split('.');
    if (segments.length !== 3) {
      throw new InvalidRefreshTokenCredentialError('segment-count');
    }

    // noUncheckedIndexedAccess makes each element `string | undefined`; the
    // length check above guarantees all three are present at runtime.
    const [accountId, tokenId, secret] = segments;
    if (
      accountId === undefined ||
      tokenId === undefined ||
      secret === undefined
    ) {
      throw new InvalidRefreshTokenCredentialError('segment-count');
    }

    this.validateSegment(accountId, UUID_V7_PATTERN, 'invalid-account-id');
    this.validateSegment(tokenId, UUID_V7_PATTERN, 'invalid-token-id');
    this.validateSegment(secret, SECRET_PATTERN, 'invalid-secret');

    return new RefreshTokenCredential(accountId, tokenId, secret);
  }

  // Shared by all three segment checks in parse() (AC-20): each segment must
  // match its pattern exactly or the whole wire token is rejected with the
  // matching typed reason.
  private static validateSegment(
    value: string,
    pattern: RegExp,
    reason: RefreshTokenCredentialRejectionReason,
  ): void {
    if (!pattern.test(value)) {
      throw new InvalidRefreshTokenCredentialError(reason);
    }
  }

  getAccountId(): string {
    return this.accountId;
  }

  getTokenId(): string {
    return this.tokenId;
  }

  getSecret(): string {
    return this.secret;
  }
}
