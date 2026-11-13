import { Language } from '../../../../core/i18n/languages';

/** Actions the panel has a text for; any other action is shown as it was written. */
export const KNOWN_ACTIONS = [
  'subscription.assigned',
  'subscription.canceled',
  'grant.issued',
  'grant.revoked',
  'payer_policy.changed',
] as const;

export function isKnownAction(action: string): boolean {
  return (KNOWN_ACTIONS as readonly string[]).includes(action);
}

const formats = new Map<Language, Intl.DateTimeFormat>();

/** Day and time in the panel's language; an invalid input is an empty string. */
export function formatMoment(iso: string, lang: Language): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  let format = formats.get(lang);
  if (!format) {
    format = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' });
    formats.set(lang, format);
  }
  return format.format(date);
}

/** A `before` / `after` snapshot as indented JSON; `null` (nothing there) is "—". */
export function formatSnapshot(value: object | null): string {
  return value === null ? '—' : JSON.stringify(value, null, 2);
}
