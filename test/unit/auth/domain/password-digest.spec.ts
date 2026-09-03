import { inspect } from 'node:util';

import {
  PasswordDigest,
  InvalidPasswordDigestError,
} from '../../../../src/auth/domain/password-digest';

const HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaGVkdmFsdWU';

describe('PasswordDigest', () => {
  it('exposes the wrapped hash through expose()', () => {
    const digest = PasswordDigest.fromHash(HASH);

    expect(digest.expose()).toBe(HASH);
  });

  it('rejects an empty string', () => {
    expect(() => PasswordDigest.fromHash('')).toThrow(
      InvalidPasswordDigestError,
    );
  });

  it('rejects a non-string input', () => {
    expect(() => PasswordDigest.fromHash(123)).toThrow(
      InvalidPasswordDigestError,
    );
  });

  it('never renders the hash in a string conversion', () => {
    const digest = PasswordDigest.fromHash(HASH);

    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- asserting PasswordDigest.toString() override does not leak the hash via interpolation
    const stringified = `${digest}`;

    expect(stringified).not.toContain(HASH);
    expect(String(digest)).not.toContain(HASH);
  });

  it('never renders the hash in JSON serialization', () => {
    const digest = PasswordDigest.fromHash(HASH);

    const serialized = JSON.stringify({ digest });

    expect(serialized).not.toContain(HASH);
  });

  it('never renders the hash in a console/util inspection', () => {
    const digest = PasswordDigest.fromHash(HASH);

    const inspected = inspect(digest);

    expect(inspected).not.toContain(HASH);
  });
});
