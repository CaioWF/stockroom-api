import {
  buildAccountKey,
  buildEmailLockKey,
  buildRefreshTokenKey,
} from '../../../../src/shared/persistence/table-keys';

describe('table-keys', () => {
  describe('buildAccountKey', () => {
    it('produces the documented USER#/PROFILE pair', () => {
      expect(buildAccountKey('018f2f3c-0000-7000-8000-000000000001')).toEqual({
        PK: 'USER#018f2f3c-0000-7000-8000-000000000001',
        SK: 'PROFILE',
      });
    });

    it('never collides across two different accounts', () => {
      const first = buildAccountKey('018f2f3c-0000-7000-8000-000000000001');
      const second = buildAccountKey('018f2f3c-0000-7000-8000-000000000002');
      expect(first).not.toEqual(second);
    });
  });

  describe('buildEmailLockKey', () => {
    it('produces the documented EMAIL#/EMAIL pair', () => {
      expect(buildEmailLockKey('person@example.com')).toEqual({
        PK: 'EMAIL#person@example.com',
        SK: 'EMAIL',
      });
    });

    it('maps a normalized address to exactly one lock key across calls', () => {
      const first = buildEmailLockKey('person@example.com');
      const second = buildEmailLockKey('person@example.com');
      expect(first).toEqual(second);
    });
  });

  describe('buildRefreshTokenKey', () => {
    const accountId = '018f2f3c-0000-7000-8000-000000000001';
    const tokenId = '018f2f3c-1111-7000-8000-000000000009';

    it('produces the documented USER#/REFRESH# pair', () => {
      expect(buildRefreshTokenKey(accountId, tokenId)).toEqual({
        PK: `USER#${accountId}`,
        SK: `REFRESH#${tokenId}`,
      });
    });

    it('scopes the refresh key under its own account partition, so a foreign token id addresses nothing', () => {
      const otherAccountId = '018f2f3c-0000-7000-8000-000000000002';
      const mineKey = buildRefreshTokenKey(accountId, tokenId);
      const foreignKey = buildRefreshTokenKey(otherAccountId, tokenId);
      expect(mineKey.PK).not.toEqual(foreignKey.PK);
    });
  });
});
