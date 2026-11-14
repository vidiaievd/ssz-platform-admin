import { AdminUsageDto } from '../../../api/analytics/models/admin-usage-dto';
import { AdminUsageFiguresDto } from '../../../api/analytics/models/admin-usage-figures-dto';
import { toMicros } from './spend-model';

/**
 * The second block of "AI → Spend" (plan 90, §6.7, step 17): what payers were charged, in
 * credits, from analytics' `GET admin/ai/usage` (folded from `ai.call.completed` into
 * `ai_usage_daily`). Credits come as decimal strings with six places; shares and bars go through
 * integer micros, like the money of the first block.
 */

export const PAYER_TYPES = ['workspace', 'user', 'platform'] as const;
export type PayerType = (typeof PAYER_TYPES)[number];

/** Rows of the top; the server allows up to 100. */
export const TOP_PAYERS = 20;

/** `?payer=` → the filter; anything else is "every payer". */
export function parsePayerType(raw: string | null): PayerType | null {
  return (PAYER_TYPES as readonly string[]).includes(raw ?? '') ? (raw as PayerType) : null;
}

/** The counters every row of the block shows. */
export interface UsageFigures {
  readonly calls: number;
  readonly unpricedCalls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly creditMicros: number;
  /** Of the block's total credits; null when nothing was charged. */
  readonly share: number | null;
}

function figuresOf(f: AdminUsageFiguresDto, totalMicros: number): UsageFigures {
  const creditMicros = toMicros(f.credits);
  return {
    calls: f.calls,
    unpricedCalls: f.unpricedCalls,
    inputTokens: f.tokens.input,
    outputTokens: f.tokens.output,
    creditMicros,
    share: totalMicros > 0 ? creditMicros / totalMicros : null,
  };
}

export function usageTotal(dto: AdminUsageDto): UsageFigures {
  const micros = toMicros(dto.total.credits);
  return figuresOf(dto.total, micros);
}

/** Names of payers, by id; a missing one shows as its id. */
export interface PayerNames {
  readonly schools: ReadonlyMap<string, { name: string; slug: string; kind: string }>;
  readonly users: ReadonlyMap<string, string>;
}

export interface PayerRow extends UsageFigures {
  readonly payerType: PayerType;
  readonly payerId: string;
  /** Null until (or unless) the name is read; the page then shows the id. */
  readonly name: string | null;
  /** A school's slug, to tell apart SOLO workspaces that all carry the default name. */
  readonly detail: string | null;
  /** `/schools/:id` for a school found in organization. */
  readonly link: string | null;
}

export function payerRows(dto: AdminUsageDto, names: PayerNames | null): PayerRow[] {
  const total = toMicros(dto.total.credits);
  return dto.items
    .filter((i) => i.payerType && i.payerId)
    .map((i) => {
      const payerType = i.payerType as PayerType;
      const payerId = i.payerId as string;
      const school = payerType === 'workspace' ? names?.schools.get(payerId) : undefined;
      const user = payerType === 'user' ? names?.users.get(payerId) : undefined;
      return {
        ...figuresOf(i, total),
        payerType,
        payerId,
        name: school?.name ?? user ?? null,
        detail: school ? school.slug : null,
        link: school ? `/schools/${payerId}` : null,
      };
    });
}

export interface OthersRow extends UsageFigures {
  readonly payers: number;
}

/** Everyone below the top, one row; null when the top holds every payer. */
export function othersRow(dto: AdminUsageDto): OthersRow | null {
  if (!dto.others) return null;
  return { ...figuresOf(dto.others, toMicros(dto.total.credits)), payers: dto.others.payers };
}

/** Ids to name, per kind of payer (the platform has no id to read). */
export function payerIds(dto: AdminUsageDto): { schools: string[]; users: string[] } {
  const of = (type: PayerType) => [
    ...new Set(dto.items.filter((i) => i.payerType === type).map((i) => i.payerId as string)),
  ];
  return { schools: of('workspace'), users: of('user') };
}

export interface CapabilityUsageRow extends UsageFigures {
  readonly capability: string;
}

export function capabilityUsageRows(dto: AdminUsageDto): CapabilityUsageRow[] {
  const total = toMicros(dto.total.credits);
  return dto.items.map((i) => ({ ...figuresOf(i, total), capability: i.capability ?? '—' }));
}

export interface WeekRow extends UsageFigures {
  readonly week: string;
  readonly from: string;
  readonly to: string;
  /** Bar length, 0–1 of the week with the most credits. */
  readonly bar: number;
}

export function weekRows(dto: AdminUsageDto): WeekRow[] {
  const total = toMicros(dto.total.credits);
  const max = Math.max(0, ...dto.items.map((i) => toMicros(i.credits)));
  return dto.items.map((i) => {
    const f = figuresOf(i, total);
    return {
      ...f,
      week: i.week ?? '',
      from: i.from ?? '',
      to: i.to ?? '',
      bar: max > 0 ? f.creditMicros / max : 0,
    };
  });
}

/** The smallest amount shown as itself; below it a positive amount reads "< 0.01". */
const SMALLEST_CREDITS = 0.01;
const creditFormats = new Map<string, Intl.NumberFormat>();

/** Credits in the panel's language, up to two decimals; a positive dust amount is "< 0.01". */
export function formatCredits(micros: number, lang: string): string {
  let format = creditFormats.get(lang);
  if (!format) {
    format = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 });
    creditFormats.set(lang, format);
  }
  const value = micros / 1_000_000;
  if (value > 0 && value < SMALLEST_CREDITS) return `< ${format.format(SMALLEST_CREDITS)}`;
  return format.format(value);
}
