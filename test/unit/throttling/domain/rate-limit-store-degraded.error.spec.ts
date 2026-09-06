import { RateLimitStoreDegradedError } from '../../../../src/throttling/domain/rate-limit-store-degraded.error';

describe('RateLimitStoreDegradedError', () => {
  it('names itself', () => {
    const error = new RateLimitStoreDegradedError();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RateLimitStoreDegradedError');
  });

  it('produces an identical, non-identifying message on every construction', () => {
    const first = new RateLimitStoreDegradedError();
    const second = new RateLimitStoreDegradedError();

    expect(first.message).toBe(second.message);
    expect(first.message.length).toBeGreaterThan(0);
  });
});
