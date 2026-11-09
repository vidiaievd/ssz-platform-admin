/**
 * Days of the "Plan" tab. An administrator picks a day; the server gets that day's 00:00 UTC.
 * A grant or a trial "until 15 Dec" therefore ends as 15 Dec begins (UTC) and reads back as
 * 15 Dec. Days are `YYYY-MM-DD`, as a native date input gives them.
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Today's UTC day. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** 00:00 UTC of the day as ISO, or `null` for anything that is not a real day. */
export function dayStartUtc(day: string): string | null {
  if (!DAY.test(day)) return null;
  const date = new Date(`${day}T00:00:00.000Z`);
  // `2026-02-30` parses into March; a real day survives the round trip.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) return null;
  return date.toISOString();
}

/** A day that is still ahead: its 00:00 UTC is after now. */
export function isFutureDay(day: string, now: Date = new Date()): boolean {
  return dayStartUtc(day) !== null && day > todayUtc(now);
}
