import {
  isValidRange,
  parseDay,
  parseSpendRange,
  presetOf,
  presetParams,
  presetRange,
  rangeDays,
} from './spend-period';

const now = new Date('2026-11-14T15:00:00.000Z');

describe('spend period', () => {
  it('reads only real calendar days', () => {
    expect(parseDay('2026-11-14')).toBe('2026-11-14');
    expect(parseDay('2026-02-30')).toBeNull();
    expect(parseDay('2026-1-4')).toBeNull();
    expect(parseDay(null)).toBeNull();
  });

  it('counts both ends', () => {
    expect(rangeDays({ from: '2026-11-14', to: '2026-11-14' })).toBe(1);
    expect(rangeDays({ from: '2026-10-16', to: '2026-11-14' })).toBe(30);
  });

  it('gives presets as UTC days ending today; the month starts on its first day', () => {
    expect(presetRange('7', now)).toEqual({ from: '2026-11-08', to: '2026-11-14' });
    expect(presetRange('30', now)).toEqual({ from: '2026-10-16', to: '2026-11-14' });
    expect(presetRange('90', now)).toEqual({ from: '2026-08-17', to: '2026-11-14' });
    expect(presetRange('month', now)).toEqual({ from: '2026-11-01', to: '2026-11-14' });
  });

  it('refuses a reversed range and one longer than the server allows', () => {
    expect(isValidRange('2026-11-01', '2026-11-14')).toBe(true);
    expect(isValidRange('2026-11-14', '2026-11-01')).toBe(false);
    expect(isValidRange('2025-11-14', '2026-11-14')).toBe(true); // 366 days
    expect(isValidRange('2025-11-13', '2026-11-14')).toBe(false);
    expect(isValidRange('2026-11-01', null)).toBe(false);
  });

  it('falls back to the last 30 days on a bad URL', () => {
    expect(parseSpendRange('2026-11-01', '2026-11-03', now)).toEqual({
      from: '2026-11-01',
      to: '2026-11-03',
    });
    expect(parseSpendRange('garbage', '2026-11-03', now)).toEqual(presetRange('30', now));
    expect(parseSpendRange(null, null, now)).toEqual(presetRange('30', now));
  });

  it('knows which preset a range is, and writes nothing for the default', () => {
    expect(presetOf(presetRange('90', now), now)).toBe('90');
    expect(presetOf({ from: '2026-11-02', to: '2026-11-03' }, now)).toBeNull();
    expect(presetParams('30', now)).toEqual({ from: null, to: null });
    expect(presetParams('month', now)).toEqual({ from: '2026-11-01', to: '2026-11-14' });
  });
});
