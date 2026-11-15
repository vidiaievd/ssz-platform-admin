import { AdminStatsDayDto } from '../../api/organization/models/admin-stats-day-dto';
import { PlanStatsDto } from '../../api/subscription/models/plan-stats-dto';

/** How the days of the period are grouped into bars: a year of daily bars cannot be read. */
export type GrowthStep = 'day' | 'week' | 'month';

/** Up to a month — a bar a day; up to a quarter — a bar per 7 days; longer — a bar per month. */
export function growthStep(days: number): GrowthStep {
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

export interface GrowthBucket {
  /** First and last UTC day of the bar, `YYYY-MM-DD`, both inclusive. */
  readonly from: string;
  readonly to: string;
  /** Workspaces created in the bar's days. */
  readonly schools: number;
  /** People who first became a student in the bar's days. */
  readonly students: number;
}

/**
 * The server's `daily[]` (every day, zeros included, oldest first) grouped into bars. Weeks are
 * 7-day chunks counted back from the last day, so the newest bar is always whole and the
 * oldest one may be short; months are UTC calendar months, the first and last may be partial.
 * The bars add up to the period's totals: nothing is dropped at the edges.
 */
export function growthBuckets(
  daily: readonly AdminStatsDayDto[],
  step: GrowthStep = growthStep(daily.length),
): GrowthBucket[] {
  const days = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  const groups: AdminStatsDayDto[][] = [];
  if (step === 'day') {
    for (const d of days) groups.push([d]);
  } else if (step === 'week') {
    for (let end = days.length; end > 0; end -= 7)
      groups.unshift(days.slice(Math.max(0, end - 7), end));
  } else {
    for (const d of days) {
      const last = groups.at(-1);
      if (last && last[0].date.slice(0, 7) === d.date.slice(0, 7)) last.push(d);
      else groups.push([d]);
    }
  }
  return groups.map((g) => ({
    from: g[0].date,
    to: g[g.length - 1].date,
    schools: g.reduce((n, d) => n + d.schools, 0),
    students: g.reduce((n, d) => n + d.students, 0),
  }));
}

export interface PlanBar {
  readonly code: string;
  readonly name: string;
  readonly audience: PlanStatsDto['audience'];
  readonly archived: boolean;
  readonly currentVersion: number;
  readonly subscribers: number;
  readonly trial: number;
  /** Subscribers on the current version and on any older one (not moved yet). */
  readonly onCurrent: number;
  readonly onOlder: number;
  /** Bar lengths, 0–100, against the plan with the most subscribers (all plans share a scale). */
  readonly currentPct: number;
  readonly olderPct: number;
}

/**
 * One bar per plan in the server's order (audience, then code), archived plans included.
 * `byVersion` decides what is on the current version; anything else on the plan is "older" —
 * so the two parts always add up to `subscribers`, even if a version row were missing.
 */
export function planBars(plans: readonly PlanStatsDto[]): PlanBar[] {
  const max = Math.max(0, ...plans.map((p) => p.subscribers));
  const pct = (n: number) => (max > 0 ? (n / max) * 100 : 0);
  return plans.map((p) => {
    const current = p.byVersion.find((v) => v.version === p.currentVersion)?.count ?? 0;
    const onCurrent = Math.min(current, p.subscribers);
    const onOlder = p.subscribers - onCurrent;
    return {
      code: p.code,
      name: p.name,
      audience: p.audience,
      archived: p.status === 'archived',
      currentVersion: p.currentVersion,
      subscribers: p.subscribers,
      trial: p.trial,
      onCurrent,
      onOlder,
      currentPct: pct(onCurrent),
      olderPct: pct(onOlder),
    };
  });
}
