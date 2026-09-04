import { SequentialIdGenerator } from '../../fakes/sequential-id-generator';

// Mirrors refresh-token-credential.ts's UUID_V7_PATTERN exactly (version
// nibble '7', variant nibble in 8-b) — the shape RefreshTokenCredential.parse
// validates downstream, so ids minted here must satisfy it too.
const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('SequentialIdGenerator', () => {
  it('mints a UUIDv7-shaped id', () => {
    const generator = new SequentialIdGenerator();

    const id = generator.newId();

    expect(id).toMatch(UUID_V7_PATTERN);
  });

  it('mints distinct ids on successive calls', () => {
    const generator = new SequentialIdGenerator();

    const first = generator.newId();
    const second = generator.newId();

    expect(first).not.toBe(second);
  });

  it('mints ids in ascending lexicographic order, inspectable as a sequence', () => {
    const generator = new SequentialIdGenerator();

    const first = generator.newId();
    const second = generator.newId();
    const third = generator.newId();

    expect([first, second, third]).toEqual([first, second, third].sort());
    expect(first < second).toBe(true);
    expect(second < third).toBe(true);
  });
});
