import { SystemClock } from '../../../../../src/auth/infrastructure/crypto/system-clock';

describe('SystemClock', () => {
  it('returns non-decreasing Dates across calls (FR20)', () => {
    const clock = new SystemClock();

    const first = clock.now();
    const second = clock.now();

    // >= not >: two calls a few milliseconds apart can land in the same
    // millisecond, so strict ordering would make this test flaky.
    expect(second.getTime()).toBeGreaterThanOrEqual(first.getTime());
  });
});
