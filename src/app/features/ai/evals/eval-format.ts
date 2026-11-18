import { CostDto } from '../../../api/ai/models/cost-dto';
import { formatMoney } from '../spend/spend-model';
import { Metric } from './eval-sets';

const numberFormats = new Map<string, Intl.NumberFormat>();

function numberFormat(lang: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${lang}|${JSON.stringify(options)}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(lang, options);
    numberFormats.set(key, format);
  }
  return format;
}

/**
 * One score as the page shows it: a share as a percent with one decimal, milliseconds as ms (or
 * seconds from 10 s on), a mean with two decimals (signed for a bias), a count as is. `—` when the
 * run has nothing to divide by.
 */
export function formatMetric(metric: Pick<Metric, 'value' | 'format'>, lang: string): string {
  const { value, format } = metric;
  if (value === null || !Number.isFinite(value)) return '—';
  switch (format) {
    case 'rate':
      return numberFormat(lang, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value);
    case 'ms':
      return value >= 10_000
        ? `${numberFormat(lang, { maximumFractionDigits: 1 }).format(value / 1000)} s`
        : `${numberFormat(lang, { maximumFractionDigits: 0 }).format(value)} ms`;
    case 'signed':
      return numberFormat(lang, {
        signDisplay: 'exceptZero',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    case 'levels':
      return numberFormat(lang, { maximumFractionDigits: 2 }).format(value);
    case 'count':
      return numberFormat(lang, { maximumFractionDigits: 0 }).format(value);
  }
}

/** A run's cost in its currency; `—` when a call had no price. */
export function formatCost(cost: CostDto | null, lang: string): string {
  return cost ? formatMoney(cost.micros, cost.currency, lang) : '—';
}

/** How long a run took, from its start to its end (or to now while it runs). */
export function formatElapsed(
  startedAt: string,
  finishedAt: string | null,
  now = Date.now(),
): string {
  const start = Date.parse(startedAt);
  const end = finishedAt ? Date.parse(finishedAt) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '—';
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${seconds % 60} s`;
}

/** The start of a UUID: enough to tell attempts apart in a table, the whole id is in `title`. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}
