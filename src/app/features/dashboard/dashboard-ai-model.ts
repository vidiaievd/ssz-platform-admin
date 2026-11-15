import { AdminUsageDto } from '../../api/analytics/models/admin-usage-dto';
import { toMicros } from '../ai/spend/spend-model';
import { Period } from './dashboard-model';

/**
 * The AI blocks of the dashboard (plan 90, phase 8, step 9). Credits come from analytics'
 * `admin/ai/usage` (what payers were charged, folded into `ai_usage_daily`); money comes from
 * ai-service's `admin/ai/spend` (what providers bill). Credits are decimal strings with six
 * places, so sums and shares go through integer micros.
 */

const dayOf = (date: Date) => date.toISOString().slice(0, 10);

/** The same number of days right before `periodRange(days)` — for "change to the previous period". */
export function previousRange(days: Period, now: Date = new Date()): { from: string; to: string } {
  const end = new Date(now.getTime() - days * 86_400_000);
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  return { from: dayOf(start), to: dayOf(end) };
}

export interface AiKpi {
  readonly creditMicros: number;
  readonly calls: number;
  readonly unpricedCalls: number;
  /** Credits per ISO week the period touches, oldest first (micros) — the sparkline. */
  readonly weekly: readonly number[];
  /**
   * Change of credits to the previous period, as a ratio (0.25 = +25 %). Null while the
   * previous period is unknown, or when it had no credits (a ratio to zero says nothing).
   */
  readonly change: number | null;
  /** The previous period was read and had no credits at all. */
  readonly previousEmpty: boolean;
}

export function aiKpi(weeks: AdminUsageDto, previous: AdminUsageDto | null): AiKpi {
  const creditMicros = toMicros(weeks.total.credits);
  const before = previous ? toMicros(previous.total.credits) : null;
  return {
    creditMicros,
    calls: weeks.total.calls,
    unpricedCalls: weeks.total.unpricedCalls,
    weekly: weeks.items.map((i) => toMicros(i.credits)),
    change: before !== null && before > 0 ? (creditMicros - before) / before : null,
    previousEmpty: before === 0,
  };
}

/** Series of the per-agent chart; the rest fold into "others" (§6.8, step 9). */
export const MAX_AGENT_SERIES = 6;

export interface AgentSeries {
  /** Null for the folded "others". */
  readonly capability: string | null;
  /** Colour slot in the chart palette; null = the grey of "others". */
  readonly slot: number | null;
  /** Credits per week (whole credits as a number for the chart), oldest week first. */
  readonly values: readonly number[];
}

export interface AgentChart {
  readonly weeks: readonly { week: string; from: string; to: string }[];
  readonly series: readonly AgentSeries[];
}

/**
 * Weeks × capability, stacked. The biggest capabilities of the whole period keep their own
 * series (most credits first, ties by name, so a colour does not jump between reads of the same
 * data); everything else is "others". Null when nothing was charged — the page says so instead
 * of drawing empty bars.
 */
export function agentChart(weeks: AdminUsageDto, max = MAX_AGENT_SERIES): AgentChart | null {
  const totals = new Map<string, number>();
  for (const w of weeks.items) {
    for (const c of w.byCapability ?? []) {
      totals.set(c.capability, (totals.get(c.capability) ?? 0) + toMicros(c.credits));
    }
  }
  const ranked = [...totals.entries()]
    .filter(([, micros]) => micros > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([capability]) => capability);
  if (ranked.length === 0) return null;

  // With one capability past the limit, it is shown itself: "others" of one name hides nothing.
  const own = ranked.length <= max + 1 ? ranked : ranked.slice(0, max);
  const ownSet = new Set(own);
  const perWeek = (pick: (capability: string) => boolean) =>
    weeks.items.map(
      (w) =>
        (w.byCapability ?? [])
          .filter((c) => pick(c.capability))
          .reduce((n, c) => n + toMicros(c.credits), 0) / 1_000_000,
    );

  const series: AgentSeries[] = own.map((capability, slot) => ({
    capability,
    slot,
    values: perWeek((c) => c === capability),
  }));
  if (own.length < ranked.length) {
    series.push({ capability: null, slot: null, values: perWeek((c) => !ownSet.has(c)) });
  }
  return {
    weeks: weeks.items.map((w) => ({ week: w.week ?? '', from: w.from ?? '', to: w.to ?? '' })),
    series,
  };
}

/** Rows of the dashboard's top of schools by credits. */
export const TOP_SCHOOLS = 5;
