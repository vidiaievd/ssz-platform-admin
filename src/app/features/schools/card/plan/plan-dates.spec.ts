import { dayStartUtc, isFutureDay, todayUtc } from './plan-dates';

describe('plan dates', () => {
  const now = new Date('2026-11-09T22:30:00.000Z');

  it('reads today in UTC', () => {
    expect(todayUtc(now)).toBe('2026-11-09');
    expect(todayUtc(new Date('2026-11-09T23:59:59.999+05:00'))).toBe('2026-11-09');
  });

  it('turns a day into its 00:00 UTC', () => {
    expect(dayStartUtc('2026-12-15')).toBe('2026-12-15T00:00:00.000Z');
  });

  it('refuses what is not a real day', () => {
    expect(dayStartUtc('')).toBeNull();
    expect(dayStartUtc('2026-02-30')).toBeNull();
    expect(dayStartUtc('15.12.2026')).toBeNull();
  });

  it('counts only days after today as ahead', () => {
    expect(isFutureDay('2026-11-10', now)).toBe(true);
    expect(isFutureDay('2026-11-09', now)).toBe(false);
    expect(isFutureDay('2026-01-01', now)).toBe(false);
    expect(isFutureDay('nonsense', now)).toBe(false);
  });
});
