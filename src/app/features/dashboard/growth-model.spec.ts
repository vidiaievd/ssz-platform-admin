import { AdminStatsDayDto } from '../../api/organization/models/admin-stats-day-dto';
import { PlanStatsDto } from '../../api/subscription/models/plan-stats-dto';
import { growthBuckets, growthStep, planBars } from './growth-model';

/** `n` consecutive UTC days ending on `last`, with one new school and two students a day. */
function days(n: number, last = '2026-11-15'): AdminStatsDayDto[] {
  const end = Date.parse(`${last}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(end - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10),
    schools: 1,
    students: 2,
    teachers: 0,
  }));
}

const plan = (over: Partial<PlanStatsDto>): PlanStatsDto => ({
  code: 'school',
  name: 'School',
  audience: 'workspace',
  status: 'active',
  currentVersion: 2,
  subscribers: 0,
  trial: 0,
  byVersion: [],
  ...over,
});

describe('growthStep', () => {
  it('is a day up to a month, 7 days up to a quarter, a month beyond', () => {
    expect([7, 30, 31].map(growthStep)).toEqual(['day', 'day', 'day']);
    expect([32, 90, 120].map(growthStep)).toEqual(['week', 'week', 'week']);
    expect([121, 365].map(growthStep)).toEqual(['month', 'month']);
  });
});

describe('growthBuckets', () => {
  it('keeps a bar a day for a short period, oldest first', () => {
    const daily = days(7).reverse();
    const bars = growthBuckets(daily);
    expect(bars).toHaveLength(7);
    expect(bars[0]).toEqual({ from: '2026-11-09', to: '2026-11-09', schools: 1, students: 2 });
    expect(bars[6].to).toBe('2026-11-15');
  });

  it('counts weeks back from the last day: the newest is whole, the oldest is short', () => {
    const bars = growthBuckets(days(90));
    expect(bars).toHaveLength(13);
    expect(bars.at(-1)).toEqual({ from: '2026-11-09', to: '2026-11-15', schools: 7, students: 14 });
    expect(bars[0].schools).toBe(6);
    expect(bars.reduce((n, b) => n + b.schools, 0)).toBe(90);
  });

  it('groups a year by calendar month, partial at both edges, nothing dropped', () => {
    const bars = growthBuckets(days(365));
    expect(bars).toHaveLength(13);
    expect(bars[0]).toMatchObject({ from: '2025-11-16', to: '2025-11-30', schools: 15 });
    expect(bars.at(-1)).toMatchObject({ from: '2026-11-01', to: '2026-11-15', schools: 15 });
    expect(bars.reduce((n, b) => n + b.students, 0)).toBe(730);
  });

  it('has no bars without days', () => {
    expect(growthBuckets([])).toEqual([]);
  });
});

describe('planBars', () => {
  it('splits subscribers into the current version and older ones on one shared scale', () => {
    const [school, tutor] = planBars([
      plan({
        subscribers: 40,
        trial: 3,
        byVersion: [
          { version: 2, count: 30 },
          { version: 1, count: 10 },
        ],
      }),
      plan({ code: 'tutor_pro', subscribers: 10, byVersion: [{ version: 2, count: 10 }] }),
    ]);
    expect(school).toMatchObject({
      onCurrent: 30,
      onOlder: 10,
      currentPct: 75,
      olderPct: 25,
      trial: 3,
    });
    expect(tutor).toMatchObject({ onCurrent: 10, onOlder: 0, currentPct: 25, olderPct: 0 });
  });

  it('counts a plan with no row for its current version as all older', () => {
    const [bar] = planBars([plan({ subscribers: 5, byVersion: [{ version: 1, count: 5 }] })]);
    expect(bar).toMatchObject({ onCurrent: 0, onOlder: 5, olderPct: 100 });
  });

  it('marks archived plans and draws nothing when nobody subscribes', () => {
    const [bar] = planBars([plan({ status: 'archived' })]);
    expect(bar).toMatchObject({ archived: true, currentPct: 0, olderPct: 0 });
  });
});
