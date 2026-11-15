import { TokenLifetimes } from '../../../core/auth/token-lifetimes.api';
import { durationParts, lifetimeRows, naturalUnit, parseLifetime } from './token-lifetime-rows';

const at = '2026-10-16T00:00:00Z';

const data: TokenLifetimes = {
  policies: [
    {
      role: 'student',
      clientType: 'web',
      refreshLifetimeHours: 168,
      updatedAt: at,
      updatedBy: null,
    },
    {
      role: 'zz_custom',
      clientType: 'web',
      refreshLifetimeHours: 5,
      updatedAt: at,
      updatedBy: null,
    },
    {
      role: 'platform_admin',
      clientType: 'admin',
      refreshLifetimeHours: 12,
      updatedAt: at,
      updatedBy: 'admin-1',
    },
    {
      role: 'alpha',
      clientType: 'mobile',
      refreshLifetimeHours: 2,
      updatedAt: at,
      updatedBy: null,
    },
  ],
  fallbackHours: 720,
  minHours: 1,
  maxHours: 2160,
};

describe('lifetimeRows', () => {
  it('lists known roles by privilege, then the others by name', () => {
    expect(lifetimeRows(data).map((r) => r.role)).toEqual([
      'platform_admin',
      'manager_platform',
      'school_admin',
      'teacher',
      'tutor',
      'student',
      'alpha',
      'zz_custom',
    ]);
  });

  it('marks own lifetimes, fallbacks and the admin client of other roles', () => {
    const rows = lifetimeRows(data);
    const admin = rows.find((r) => r.role === 'platform_admin')!;
    expect(admin.cells.admin).toMatchObject({ kind: 'set', hours: 12 });
    expect(admin.cells.web).toEqual({ kind: 'fallback', hours: 720 });

    const student = rows.find((r) => r.role === 'student')!;
    expect(student.cells.web).toMatchObject({ kind: 'set', hours: 168 });
    expect(student.cells.mobile).toEqual({ kind: 'fallback', hours: 720 });
    expect(student.cells.admin).toEqual({ kind: 'unused' });
  });

  it('shows a row the server has for the admin client of another role', () => {
    const odd: TokenLifetimes = {
      ...data,
      policies: [
        {
          role: 'tutor',
          clientType: 'admin',
          refreshLifetimeHours: 3,
          updatedAt: at,
          updatedBy: null,
        },
      ],
    };
    const tutor = lifetimeRows(odd).find((r) => r.role === 'tutor')!;
    expect(tutor.cells.admin).toMatchObject({ kind: 'set', hours: 3 });
  });
});

describe('durationParts / naturalUnit', () => {
  it('splits hours into days and the rest', () => {
    expect(durationParts(168)).toEqual({ days: 7, hours: 0 });
    expect(durationParts(36)).toEqual({ days: 1, hours: 12 });
    expect(durationParts(12)).toEqual({ days: 0, hours: 12 });
  });

  it('offers days only for whole days', () => {
    expect(naturalUnit(168)).toBe('days');
    expect(naturalUnit(36)).toBe('hours');
    expect(naturalUnit(12)).toBe('hours');
  });
});

describe('parseLifetime', () => {
  const bounds = { minHours: 1, maxHours: 2160 };

  it('turns days into hours', () => {
    expect(parseLifetime(' 7 ', 'days', bounds)).toEqual({ hours: 168 });
    expect(parseLifetime('90', 'days', bounds)).toEqual({ hours: 2160 });
    expect(parseLifetime('1', 'hours', bounds)).toEqual({ hours: 1 });
  });

  it('refuses empty, fractional and out-of-bounds values', () => {
    expect(parseLifetime('', 'hours', bounds)).toEqual({ error: 'required' });
    expect(parseLifetime('1.5', 'days', bounds)).toEqual({ error: 'wholeNumber' });
    expect(parseLifetime('-3', 'hours', bounds)).toEqual({ error: 'wholeNumber' });
    expect(parseLifetime('0', 'hours', bounds)).toEqual({ error: 'outOfBounds' });
    expect(parseLifetime('91', 'days', bounds)).toEqual({ error: 'outOfBounds' });
    expect(parseLifetime('2161', 'hours', bounds)).toEqual({ error: 'outOfBounds' });
  });
});
