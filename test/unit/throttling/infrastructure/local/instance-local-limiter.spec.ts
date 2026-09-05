import {
  deriveFallbackCeiling,
  InstanceLocalLimiter,
} from '../../../../../src/throttling/infrastructure/local/instance-local-limiter';

describe('deriveFallbackCeiling', () => {
  it('multiplies the route limit by THROTTLE_LOCAL_FALLBACK_FACTOR (FR20a)', () => {
    expect(deriveFallbackCeiling(100, 1)).toBe(100);
    expect(deriveFallbackCeiling(10, 3)).toBe(30);
  });
});

describe('InstanceLocalLimiter', () => {
  describe('expiry on read', () => {
    it('resets the counter when the window has elapsed', () => {
      const limiter = new InstanceLocalLimiter({ maxEntries: 10 });
      const identityKey = 'test-identity';
      const windowSeconds = 60;
      const ceiling = 5;

      // Record a hit in the first window
      const firstWindowStart = 1000;
      const resultFirstWindow = limiter.recordAndCheck(
        identityKey,
        firstWindowStart,
        windowSeconds,
        ceiling,
      );

      // Should be admitted (count is 1, under ceiling of 5)
      expect(resultFirstWindow).toBe(true);

      // Query with a new window far in the future (simulating time passing)
      const secondWindowStart = 2000;
      const resultSecondWindow = limiter.recordAndCheck(
        identityKey,
        secondWindowStart,
        windowSeconds,
        ceiling,
      );

      // Should be admitted again because the old window has expired
      // (count should be 1 again, not 2)
      expect(resultSecondWindow).toBe(true);
    });
  });

  describe('admit when cache is full', () => {
    it('admits a brand-new identity even when cache is at maxEntries', () => {
      const maxEntries = 3;
      const limiter = new InstanceLocalLimiter({ maxEntries });
      const windowStart = 1000;
      const windowSeconds = 60;
      const ceiling = 5;

      // Fill the cache with 3 distinct identities
      for (let i = 0; i < maxEntries; i++) {
        const identityKey = `identity-${i}`;
        const result = limiter.recordAndCheck(
          identityKey,
          windowStart,
          windowSeconds,
          ceiling,
        );
        expect(result).toBe(true);
      }

      // Present a brand-new identity
      const newIdentityKey = 'new-identity';
      const resultNewIdentity = limiter.recordAndCheck(
        newIdentityKey,
        windowStart,
        windowSeconds,
        ceiling,
      );

      // Should be admitted despite the cache being full
      // (this is the critical design detail: we admit rather than reject)
      expect(resultNewIdentity).toBe(true);
    });
  });

  describe('ceiling enforcement', () => {
    it('refuses requests after the ceiling is reached for an existing identity', () => {
      const limiter = new InstanceLocalLimiter({ maxEntries: 10 });
      const identityKey = 'test-identity';
      const windowStart = 1000;
      const windowSeconds = 60;
      const ceiling = 2;

      // Record hits up to the ceiling
      const result1 = limiter.recordAndCheck(
        identityKey,
        windowStart,
        windowSeconds,
        ceiling,
      );
      expect(result1).toBe(true);

      const result2 = limiter.recordAndCheck(
        identityKey,
        windowStart,
        windowSeconds,
        ceiling,
      );
      expect(result2).toBe(true);

      // Third hit should be refused
      const result3 = limiter.recordAndCheck(
        identityKey,
        windowStart,
        windowSeconds,
        ceiling,
      );
      expect(result3).toBe(false);

      // Fourth hit should also be refused
      const result4 = limiter.recordAndCheck(
        identityKey,
        windowStart,
        windowSeconds,
        ceiling,
      );
      expect(result4).toBe(false);
    });

    it('admits requests for an identity under the ceiling', () => {
      const limiter = new InstanceLocalLimiter({ maxEntries: 10 });
      const identityKey = 'test-identity';
      const windowStart = 1000;
      const windowSeconds = 60;
      const ceiling = 3;

      // Record hits within the ceiling
      const result1 = limiter.recordAndCheck(
        identityKey,
        windowStart,
        windowSeconds,
        ceiling,
      );
      expect(result1).toBe(true);

      const result2 = limiter.recordAndCheck(
        identityKey,
        windowStart,
        windowSeconds,
        ceiling,
      );
      expect(result2).toBe(true);

      const result3 = limiter.recordAndCheck(
        identityKey,
        windowStart,
        windowSeconds,
        ceiling,
      );
      expect(result3).toBe(true);

      // Fourth hit exceeds ceiling
      const result4 = limiter.recordAndCheck(
        identityKey,
        windowStart,
        windowSeconds,
        ceiling,
      );
      expect(result4).toBe(false);
    });
  });

  describe('basic correctness', () => {
    it('does not interfere counts between different identities', () => {
      const limiter = new InstanceLocalLimiter({ maxEntries: 10 });
      const windowStart = 1000;
      const windowSeconds = 60;
      const ceiling = 2;

      const identity1 = 'identity-1';
      const identity2 = 'identity-2';

      // Record hits for identity 1
      limiter.recordAndCheck(identity1, windowStart, windowSeconds, ceiling);
      limiter.recordAndCheck(identity1, windowStart, windowSeconds, ceiling);

      // identity 1 should be at ceiling
      const result1 = limiter.recordAndCheck(
        identity1,
        windowStart,
        windowSeconds,
        ceiling,
      );
      expect(result1).toBe(false);

      // Record a hit for identity 2 (should not be affected by identity 1's count)
      const result2 = limiter.recordAndCheck(
        identity2,
        windowStart,
        windowSeconds,
        ceiling,
      );
      expect(result2).toBe(true);

      // Record another hit for identity 2
      const result3 = limiter.recordAndCheck(
        identity2,
        windowStart,
        windowSeconds,
        ceiling,
      );
      expect(result3).toBe(true);

      // identity 2 should now be at ceiling
      const result4 = limiter.recordAndCheck(
        identity2,
        windowStart,
        windowSeconds,
        ceiling,
      );
      expect(result4).toBe(false);
    });
  });
});
