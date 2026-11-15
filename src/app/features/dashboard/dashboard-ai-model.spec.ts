import { AdminUsageDto } from '../../api/analytics/models/admin-usage-dto';
import { agentChart, aiKpi, previousRange } from './dashboard-ai-model';

const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const figures = (credits: string) => ({ calls: 1, credits, unpricedCalls: 0, tokens });

function weeks(...byWeek: Record<string, string>[]): AdminUsageDto {
  return {
    from: '2026-10-01',
    to: '2026-10-31',
    groupBy: 'week',
    payerType: null,
    total: figures('0.000000'),
    items: byWeek.map((caps, i) => ({
      week: `2026-W4${i}`,
      from: `2026-10-0${i + 1}`,
      to: `2026-10-0${i + 1}`,
      ...figures('0.000000'),
      byCapability: Object.entries(caps).map(([capability, credits]) => ({
        capability,
        ...figures(credits),
      })),
    })),
  };
}

const usage = (credits: string): AdminUsageDto => ({ ...weeks(), total: figures(credits) });

describe('previousRange', () => {
  it('is the same number of days right before the period', () => {
    const now = new Date('2026-11-15T10:00:00Z');
    expect(previousRange(7, now)).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(previousRange(30, now)).toEqual({ from: '2026-09-17', to: '2026-10-16' });
  });
});

describe('aiKpi', () => {
  it('gives the change to the previous period as a ratio', () => {
    expect(aiKpi(usage('150.000000'), usage('120.000000')).change).toBeCloseTo(0.25);
    expect(aiKpi(usage('60.000000'), usage('120.000000')).change).toBeCloseTo(-0.5);
  });

  it('has no ratio to an empty previous period, and says it was empty', () => {
    const k = aiKpi(usage('10.000000'), usage('0.000000'));
    expect(k.change).toBeNull();
    expect(k.previousEmpty).toBe(true);
  });

  it('has no change while the previous period is unknown', () => {
    const k = aiKpi(usage('10.000000'), null);
    expect(k).toMatchObject({ change: null, previousEmpty: false, creditMicros: 10_000_000 });
  });
});

describe('agentChart', () => {
  it('stacks capabilities by week, biggest of the period first, zeros where a week had none', () => {
    const chart = agentChart(weeks({ a: '1.000000', b: '5.000000' }, { a: '2.000000' }))!;
    expect(chart.series.map((s) => [s.capability, s.slot, s.values])).toEqual([
      ['b', 0, [5, 0]],
      ['a', 1, [1, 2]],
    ]);
    expect(chart.weeks.map((w) => w.week)).toEqual(['2026-W40', '2026-W41']);
  });

  it('folds everything past the limit into a grey "others", ties by name', () => {
    const caps = { a: '1.000000', b: '1.000000', c: '3.000000', d: '4.000000' };
    const chart = agentChart(weeks(caps), 2)!;
    expect(chart.series.map((s) => [s.capability, s.slot, s.values])).toEqual([
      ['d', 0, [4]],
      ['c', 1, [3]],
      [null, null, [2]],
    ]);
  });

  it('shows one capability past the limit as itself rather than an "others" of one', () => {
    const chart = agentChart(weeks({ a: '3.000000', b: '2.000000', c: '1.000000' }), 2)!;
    expect(chart.series.map((s) => s.capability)).toEqual(['a', 'b', 'c']);
  });

  it('is null when nothing was charged', () => {
    expect(agentChart(weeks({}, { a: '0.000000' }))).toBeNull();
  });
});
