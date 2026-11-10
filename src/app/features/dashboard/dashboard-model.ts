import { EndingSoonDto } from '../../api/subscription/models/ending-soon-dto';
import { schoolTabLink } from '../schools/card/school-tabs';

/** Periods of the switch, in days; one switch for the whole page (§5, rule 4). */
export const PERIODS = [7, 30, 90, 365] as const;
export type Period = (typeof PERIODS)[number];
export const DEFAULT_PERIOD: Period = 30;

/** `?period=` → a known period; anything else is the default, so a hand-edited link still opens. */
export function parsePeriod(raw: string | null): Period {
  const n = Number(raw);
  return (PERIODS as readonly number[]).includes(n) ? (n as Period) : DEFAULT_PERIOD;
}

const dayOf = (date: Date) => date.toISOString().slice(0, 10);

/** UTC days, both ends inclusive: the last `days` days ending today. */
export function periodRange(days: Period, now: Date = new Date()): { from: string; to: string } {
  const start = new Date(now.getTime() - (days - 1) * 86_400_000);
  return { from: dayOf(start), to: dayOf(now) };
}

/** The window of the attention queue, days (the queue does not follow the period switch). */
export const ATTENTION_DAYS = 7;

export type AttentionKind = 'grantEnds' | 'grantOffEnds' | 'trialEnds' | 'subscriptionEnds';

export interface AttentionItem {
  readonly id: string;
  readonly kind: AttentionKind;
  /** The payer: a school id, or a user id (self-study student). */
  readonly payerId: string;
  readonly payerType: 'workspace' | 'user';
  /** For grants the feature key, for subscriptions the plan name. */
  readonly subject: string;
  readonly at: string;
  /** The tab of the school's card; none for a user (the panel has no user card yet). */
  readonly link: string[] | null;
}

/** The queue from the subscription stats, soonest end first. Only what the stats say. */
export function attentionItems(ending: EndingSoonDto): AttentionItem[] {
  const linkOf = (type: 'workspace' | 'user', id: string) =>
    type === 'workspace' ? schoolTabLink(id, 'plan') : null;
  const items: AttentionItem[] = [
    ...ending.grants.map((g): AttentionItem => ({
      id: `grant:${g.grantId}`,
      kind: g.enabled ? 'grantEnds' : 'grantOffEnds',
      payerId: g.externalId,
      payerType: g.accountType,
      subject: g.featureKey,
      at: g.endsAt,
      link: linkOf(g.accountType, g.externalId),
    })),
    ...ending.subscriptions.map((s): AttentionItem => ({
      id: `subscription:${s.subscriptionId}`,
      kind: s.status === 'trial' ? 'trialEnds' : 'subscriptionEnds',
      payerId: s.externalId,
      payerType: s.accountType,
      subject: s.planName,
      at: s.periodEnd,
      link: linkOf(s.accountType, s.externalId),
    })),
  ];
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

/** Points of a sparkline polyline in a `width` × `height` box; empty below two values. */
export function sparkPoints(values: readonly number[], width: number, height: number): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const step = width / (values.length - 1);
  return values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`)
    .join(' ');
}
