import { RefreshToken } from '../../../../src/auth/domain/refresh-token';

// Fixture ids: UUIDv7-shaped (version nibble '7', variant nibble in 8-b) but
// not tied to any real account/token — synthetic test fixtures, not real ids.
const ACCOUNT_ID = '018f1c9a-1234-7abc-89ab-0123456789ab';
const TOKEN_ID = '018f1c9a-5678-7def-9abc-fedcba987654';
const SUCCESSOR_TOKEN_ID = '018f1c9a-9999-7aaa-8bbb-fedcba987654';

// A SHA-256 digest is 32 bytes, 64 hex characters. Not a real digest.
const DIGEST = 'a'.repeat(64);

describe('RefreshToken', () => {
  it('carries both ids, the digest, generation, and session/expiry timestamps as given, live by default', () => {
    const sessionStartedAt = new Date('2026-09-01T00:00:00.000Z');
    const expiresAt = new Date('2026-09-08T00:00:00.000Z');

    const token = new RefreshToken(
      ACCOUNT_ID,
      TOKEN_ID,
      DIGEST,
      0,
      sessionStartedAt,
      expiresAt,
      undefined,
      undefined,
    );

    expect(token.accountId).toBe(ACCOUNT_ID);
    expect(token.tokenId).toBe(TOKEN_ID);
    expect(token.digest).toBe(DIGEST);
    expect(token.tokenGeneration).toBe(0);
    expect(token.sessionStartedAt).toBe(sessionStartedAt);
    expect(token.expiresAt).toBe(expiresAt);
    expect(token.retiredAt).toBeUndefined();
    expect(token.successorTokenId).toBeUndefined();
  });

  it('carries the retirement timestamp and successor id once retired (FR18)', () => {
    const retiredAt = new Date('2026-09-02T00:00:00.000Z');

    const token = new RefreshToken(
      ACCOUNT_ID,
      TOKEN_ID,
      DIGEST,
      0,
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-08T00:00:00.000Z'),
      retiredAt,
      SUCCESSOR_TOKEN_ID,
    );

    expect(token.retiredAt).toBe(retiredAt);
    expect(token.successorTokenId).toBe(SUCCESSOR_TOKEN_ID);
  });
});
