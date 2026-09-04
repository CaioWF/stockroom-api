import { UuidV7Generator } from '../../../../../src/auth/infrastructure/crypto/uuid-v7-generator';

// Same pattern refresh-token-credential.ts's own UUID_V7_PATTERN validates —
// minted ids flow back through that parser on the wire, so the two must
// agree on shape exactly.
const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('UuidV7Generator', () => {
  const generator = new UuidV7Generator();

  it('produces ids matching the UUIDv7 shape refresh-token-credential.ts requires', () => {
    const id = generator.newId();

    expect(id).toMatch(UUID_V7_PATTERN);
  });

  it('produces distinct ids across back-to-back calls', () => {
    const first = generator.newId();
    const second = generator.newId();

    expect(first).not.toBe(second);
  });

  it('orders ids by real wall-clock time in their timestamp segment', async () => {
    const earlier = generator.newId();
    // A real, non-frozen delay: RFC 9562's whole point is wall-clock
    // ordering, so this asserts against actual elapsed time rather than an
    // injected clock (per the brief's explicit rationale for not using Clock
    // here).
    await new Promise((resolve) => setTimeout(resolve, 5));
    const later = generator.newId();

    const earlierTimestampHex = earlier.replace(/-/g, '').slice(0, 12);
    const laterTimestampHex = later.replace(/-/g, '').slice(0, 12);

    expect(laterTimestampHex >= earlierTimestampHex).toBe(true);
  });
});
