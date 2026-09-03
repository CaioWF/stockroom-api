import {
  RefreshTokenCredential,
  InvalidRefreshTokenCredentialError,
} from '../../../../src/auth/domain/refresh-token-credential';

// Fixture ids: UUIDv7-shaped (version nibble '7', variant nibble in 8-b) but
// not tied to any real account — synthetic test fixtures, not real ids.
const ACCOUNT_ID = '018f1c9a-1234-7abc-89ab-0123456789ab';
const TOKEN_ID = '018f1c9a-5678-7def-9abc-fedcba987654';

// 43 base64url characters = the unpadded encoding of 32 bytes (256 bits).
// Not a real secret — a fixed, clearly-synthetic character run.
const SECRET = 'A'.repeat(43);

const wireToken = (
  accountId: string,
  tokenId: string,
  secret: string,
): string => `${accountId}.${tokenId}.${secret}`;

describe('RefreshTokenCredential', () => {
  it('parses a well-formed wire token into its three segments', () => {
    const credential = RefreshTokenCredential.parse(
      wireToken(ACCOUNT_ID, TOKEN_ID, SECRET),
    );

    expect(credential.getAccountId()).toBe(ACCOUNT_ID);
    expect(credential.getTokenId()).toBe(TOKEN_ID);
    expect(credential.getSecret()).toBe(SECRET);
  });

  it('rejects a non-string input', () => {
    expect(() => RefreshTokenCredential.parse(42)).toThrow(
      InvalidRefreshTokenCredentialError,
    );
  });

  it('rejects the wrong segment count — too few (AC-20)', () => {
    expect(() =>
      RefreshTokenCredential.parse(`${ACCOUNT_ID}.${TOKEN_ID}`),
    ).toThrow(InvalidRefreshTokenCredentialError);
  });

  it('rejects the wrong segment count — too many (AC-20)', () => {
    expect(() =>
      RefreshTokenCredential.parse(
        wireToken(ACCOUNT_ID, TOKEN_ID, SECRET) + '.extra',
      ),
    ).toThrow(InvalidRefreshTokenCredentialError);
  });

  it('rejects a malformed account id segment (AC-20)', () => {
    expect(() =>
      RefreshTokenCredential.parse(wireToken('not-a-uuid', TOKEN_ID, SECRET)),
    ).toThrow(InvalidRefreshTokenCredentialError);
  });

  it('rejects an account id with the wrong UUID version nibble', () => {
    const wrongVersion = '018f1c9a-1234-4abc-89ab-0123456789ab'; // version '4', not '7'

    expect(() =>
      RefreshTokenCredential.parse(wireToken(wrongVersion, TOKEN_ID, SECRET)),
    ).toThrow(InvalidRefreshTokenCredentialError);
  });

  it('rejects a token id with the wrong UUID variant nibble', () => {
    const wrongVariant = '018f1c9a-5678-7def-1abc-fedcba987654'; // variant '1', not in 8-b

    expect(() =>
      RefreshTokenCredential.parse(wireToken(ACCOUNT_ID, wrongVariant, SECRET)),
    ).toThrow(InvalidRefreshTokenCredentialError);
  });

  it('rejects an oversized secret (AC-20)', () => {
    const oversized = 'A'.repeat(2048);

    expect(() =>
      RefreshTokenCredential.parse(wireToken(ACCOUNT_ID, TOKEN_ID, oversized)),
    ).toThrow(InvalidRefreshTokenCredentialError);
  });

  it('rejects an undersized secret', () => {
    const undersized = 'A'.repeat(10);

    expect(() =>
      RefreshTokenCredential.parse(wireToken(ACCOUNT_ID, TOKEN_ID, undersized)),
    ).toThrow(InvalidRefreshTokenCredentialError);
  });

  it('rejects a secret containing a character outside the base64url alphabet', () => {
    const withPlus = '+'.repeat(43);

    expect(() =>
      RefreshTokenCredential.parse(wireToken(ACCOUNT_ID, TOKEN_ID, withPlus)),
    ).toThrow(InvalidRefreshTokenCredentialError);
  });

  it('rejects a token whose id segment embeds an extra "." meant to smuggle a fourth segment', () => {
    const smuggled = `${ACCOUNT_ID}.${TOKEN_ID}.part1.part2`;

    expect(() => RefreshTokenCredential.parse(smuggled)).toThrow(
      InvalidRefreshTokenCredentialError,
    );
  });
});
