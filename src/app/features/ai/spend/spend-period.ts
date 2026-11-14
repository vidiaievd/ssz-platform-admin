/**
 * The period of "AI → Spend" (plan 90, §6.7, step 5). It lives in the URL as `from` / `to`
 * (UTC days `YYYY-MM-DD`, both ends inclusive, as `GET admin/ai/spend` reads them). The default —
 * the last 30 days — is not written; a bad or too long range falls back to it silently, so a
 * hand-edited link still opens.
 */

export const SPEND_PRESETS = ['7', '30', '90', 'month'] as const;
export type SpendPreset = (typeof SPEND_PRESETS)[number];
export const DEFAULT_SPEND_PRESET: SpendPreset = '30';

/** The server refuses a longer period with 400. */
export const MAX_SPEND_DAYS = 366;

export interface SpendRange {
  readonly from: string;
  readonly to: string;
}

const DAY_MS = 86_400_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const dayOf = (date: Date) => date.toISOString().slice(0, 10);

/** A real calendar day in `YYYY-MM-DD`, or null. */
export function parseDay(raw: string | null | undefined): string | null {
  if (!raw || !DAY.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && dayOf(date) === raw ? raw : null;
}

/** Days in the range, both ends counted. */
export function rangeDays(range: SpendRange): number {
  return Math.round((Date.parse(range.to) - Date.parse(range.from)) / DAY_MS) + 1;
}

/** The range a preset means today: the last N days, or this month from its first day. */
export function presetRange(preset: SpendPreset, now: Date = new Date()): SpendRange {
  const to = dayOf(now);
  if (preset === 'month') return { from: `${to.slice(0, 8)}01`, to };
  const start = new Date(now.getTime() - (Number(preset) - 1) * DAY_MS);
  return { from: dayOf(start), to };
}

/** Both ends valid, in order and not longer than the server allows. */
export function isValidRange(from: string | null, to: string | null): from is string {
  if (!parseDay(from) || !parseDay(to)) return false;
  const range = { from: from as string, to: to as string };
  return range.from <= range.to && rangeDays(range) <= MAX_SPEND_DAYS;
}

/** `?from=&to=` → the range to read; anything else is the default. */
export function parseSpendRange(
  from: string | null,
  to: string | null,
  now: Date = new Date(),
): SpendRange {
  return isValidRange(from, to)
    ? { from, to: to as string }
    : presetRange(DEFAULT_SPEND_PRESET, now);
}

/** The preset that gives exactly this range today, or null for a range picked by hand. */
export function presetOf(range: SpendRange, now: Date = new Date()): SpendPreset | null {
  return (
    SPEND_PRESETS.find((p) => {
      const r = presetRange(p, now);
      return r.from === range.from && r.to === range.to;
    }) ?? null
  );
}

/** Query params for a preset: the default writes nothing, so its link keeps moving with the days. */
export function presetParams(
  preset: SpendPreset,
  now: Date = new Date(),
): { from: string | null; to: string | null } {
  return preset === DEFAULT_SPEND_PRESET ? { from: null, to: null } : presetRange(preset, now);
}
