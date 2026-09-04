/**
 * The SHA-256 digest of a refresh token's secret, hex-encoded (FR15). A
 * plain string, not an opaque wrapper like `PasswordDigest`: the secret it
 * hashes is 256 bits of `crypto.randomBytes` output, not a low-entropy
 * human-chosen password, so a digest reaching a log line carries none of the
 * offline-guessing risk a password digest would — the opacity ceremony
 * exists to blunt that risk, and there is none to blunt here.
 */
export type RefreshTokenDigest = string;

/**
 * The refresh token entity (FR14-FR19): both ids, the stored digest, the
 * generation it was minted under, the session-start and expiry timestamps
 * AC-19's ceiling math needs, and the retirement state the replay branch
 * (FR18) reads. Fields arrive already validated — by
 * `RefreshTokenCredential.parse`, the hasher, and repository reads — so this
 * layer carries them rather than re-validating them.
 *
 * `retiredAt`/`successorTokenId` are `undefined` while this token is the
 * live tip, and both are set together, once, when it is rotated away. A
 * plain data carrier: deciding *whether* a token is expired or which replay
 * branch applies is `RotateRefreshToken`'s job (Task 9), not this entity's.
 *
 * @example
 * new RefreshToken(accountId, tokenId, digest, 0, sessionStart, expiry, undefined, undefined).retiredAt // undefined
 */
export class RefreshToken {
  constructor(
    public readonly accountId: string,
    public readonly tokenId: string,
    public readonly digest: RefreshTokenDigest,
    public readonly tokenGeneration: number,
    public readonly sessionStartedAt: Date,
    public readonly expiresAt: Date,
    public readonly retiredAt: Date | undefined,
    public readonly successorTokenId: string | undefined,
  ) {}
}
