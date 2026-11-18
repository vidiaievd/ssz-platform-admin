/**
 * Student seats as the panel shows them (plan 90, phase 4, step 6). The rule is organization's
 * (`seat-policy.vo.ts`): up to `limit` is fine, past it a grace of `ceil(limit × 10 %)` runs with
 * a warning, and at the ceiling a new learner is refused. `limit: null` = no limit.
 */
export type SeatLevel = 'none' | 'ok' | 'near' | 'warning' | 'full';

/** The share of the limit from which the list calls a school "near" (organization's filter). */
const NEAR_RATIO = 0.9;
const GRACE_RATIO = 0.1;

export function seatCeiling(limit: number): number {
  return limit + Math.ceil(limit * GRACE_RATIO);
}

/** `none` without a numeric limit; `near` ≥ 90 % but not over; `warning` in the grace; `full` at the ceiling. */
export function seatLevel(used: number, limit: number | null): SeatLevel {
  if (limit === null) return 'none';
  if (used >= seatCeiling(limit)) return 'full';
  if (used > limit) return 'warning';
  return used >= limit * NEAR_RATIO ? 'near' : 'ok';
}

/** `87 / 100`; a school without a limit shows just `87`. */
export function seatsText(used: number, limit: number | null): string {
  return limit === null ? `${used}` : `${used} / ${limit}`;
}

/** Tailwind classes of the text, by level. */
export function seatLevelClass(level: SeatLevel): string {
  switch (level) {
    case 'full':
      return 'font-semibold text-red-600 dark:text-red-400';
    case 'warning':
      return 'font-semibold text-amber-600 dark:text-amber-400';
    case 'near':
      return 'text-amber-600 dark:text-amber-400';
    default:
      return '';
  }
}
