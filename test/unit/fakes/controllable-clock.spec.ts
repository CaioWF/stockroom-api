import { ControllableClock } from '../../fakes/controllable-clock';

describe('ControllableClock', () => {
  it('returns the date it was constructed with', () => {
    const initial = new Date('2026-09-01T00:00:00.000Z');

    const clock = new ControllableClock(initial);

    expect(clock.now()).toEqual(initial);
  });

  it('returns a new value after setNow moves it', () => {
    const clock = new ControllableClock(new Date('2026-09-01T00:00:00.000Z'));
    const moved = new Date('2026-09-08T00:00:00.000Z');

    clock.setNow(moved);

    expect(clock.now()).toEqual(moved);
  });

  it('advances by the given number of milliseconds', () => {
    const clock = new ControllableClock(new Date('2026-09-01T00:00:00.000Z'));

    clock.advanceBy(60_000);

    expect(clock.now()).toEqual(new Date('2026-09-01T00:01:00.000Z'));
  });

  it('accumulates successive advances', () => {
    const clock = new ControllableClock(new Date('2026-09-01T00:00:00.000Z'));

    clock.advanceBy(1_000);
    clock.advanceBy(2_000);

    expect(clock.now()).toEqual(new Date('2026-09-01T00:00:03.000Z'));
  });
});
