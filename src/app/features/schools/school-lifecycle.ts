import { SchoolStatus } from './schools-query';

/** Badge colour of a school status; one place for the list, the card and the palette. */
export const STATUS_SEVERITY: Record<SchoolStatus, 'success' | 'warn' | 'danger' | 'secondary'> = {
  active: 'success',
  suspended: 'warn',
  closed: 'danger',
  purged: 'secondary',
};

const DAY_MS = 86_400_000;

/** Whole days left until `iso` (rounded up); 0 once it is past — the timer runs next. */
export function daysUntil(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY_MS));
}

/** A closed school this close to its purge is shown red in the attention queue. */
export const PURGE_URGENT_DAYS = 7;
