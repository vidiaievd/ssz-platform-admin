import { CapabilitySpendDto } from '../../../api/ai/models/capability-spend-dto';
import { MoneyDto } from '../../../api/ai/models/money-dto';
import { ModelSpendDto } from '../../../api/ai/models/model-spend-dto';
import { PlatformSpendResponseDto } from '../../../api/ai/models/platform-spend-response-dto';

/**
 * What "AI → Spend" shows, computed from `GET admin/ai/spend`. Money comes as decimal strings
 * with six places; sums and shares go through integer micros so nothing drifts like a float.
 * The chart and the share are in USD (what every provider in the registry bills in); another
 * currency is listed beside it, never converted.
 */

export const MAIN_CURRENCY = 'USD';

/** "12.345678" → 12345678; "-" or garbage → 0. */
export function toMicros(amount: string): number {
  const match = /^(-)?(\d+)(?:\.(\d{1,6}))?$/.exec(amount.trim());
  if (!match) return 0;
  const micros = Number(match[2]) * 1_000_000 + Number((match[3] ?? '').padEnd(6, '0'));
  return match[1] ? -micros : micros;
}

/** The amount in one currency, in micros; 0 when the list has none of it. */
export function microsIn(cost: readonly MoneyDto[], currency: string = MAIN_CURRENCY): number {
  return cost
    .filter((m) => m.currency === currency)
    .reduce((sum, m) => sum + toMicros(m.amount), 0);
}

/** Currencies other than the main one, as they came. */
export function otherMoney(cost: readonly MoneyDto[]): MoneyDto[] {
  return cost.filter((m) => m.currency !== MAIN_CURRENCY && toMicros(m.amount) !== 0);
}

/** The smallest amount shown as itself; below it the cell reads "< $0.0001". */
const SMALLEST_SHOWN = 0.0001;

const moneyFormats = new Map<string, Intl.NumberFormat>();

/**
 * Money in the panel's language. Two to four decimals — AI calls cost fractions of a cent, and
 * "$0.00" for a priced call would read as free. A positive amount under $0.0001 is "< $0.0001".
 */
export function formatMoney(micros: number, currency: string, lang: string): string {
  const key = `${lang}|${currency}`;
  let format = moneyFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(lang, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
    moneyFormats.set(key, format);
  }
  const value = micros / 1_000_000;
  if (value > 0 && value < SMALLEST_SHOWN) return `< ${format.format(SMALLEST_SHOWN)}`;
  return format.format(value);
}

/** Audio in hours with up to two decimals (Azure Speech is billed per hour). */
export function audioHours(ms: number): number {
  return Math.round((ms / 3_600_000) * 100) / 100;
}

/** The counters a model row and its capability rows share. */
export interface SpendFigures {
  readonly calls: number;
  readonly failed: number;
  readonly fallbackCalls: number;
  readonly unpricedCalls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly audioMs: number;
  readonly characters: number;
  /** USD, micros. */
  readonly usdMicros: number;
  /** Other currencies, as the server sent them. */
  readonly other: readonly MoneyDto[];
  /** Part of the period's USD total, 0–1; null when the period cost nothing in USD. */
  readonly share: number | null;
}

export interface CapabilitySpendRow extends SpendFigures {
  readonly capability: string;
}

export interface ModelSpendRow extends SpendFigures {
  readonly modelId: string;
  /** Display name, or the id when the registry no longer has the model. */
  readonly name: string;
  /** The model was removed from the registry; its calls stay in the ledger. */
  readonly removed: boolean;
  readonly modality: 'llm' | 'speech' | 'tts' | null;
  readonly status: 'active' | 'deprecated' | 'disabled' | null;
  readonly providerName: string | null;
  readonly region: string | null;
  /** `primary: review_draft`-like pairs: where the model answers now. */
  readonly boundTo: readonly { capability: string; role: 'primary' | 'fallback' }[];
  readonly byCapability: readonly CapabilitySpendRow[];
}

function figures(
  dto: Pick<
    CapabilitySpendDto,
    | 'calls'
    | 'failed'
    | 'fallbackCalls'
    | 'unpricedCalls'
    | 'inputTokens'
    | 'outputTokens'
    | 'cacheReadTokens'
    | 'cacheWriteTokens'
    | 'audioMs'
    | 'characters'
    | 'cost'
  >,
  totalUsd: number,
): SpendFigures {
  const usdMicros = microsIn(dto.cost);
  return {
    calls: dto.calls,
    failed: dto.failed,
    fallbackCalls: dto.fallbackCalls,
    unpricedCalls: dto.unpricedCalls,
    inputTokens: dto.inputTokens,
    outputTokens: dto.outputTokens,
    cacheReadTokens: dto.cacheReadTokens,
    cacheWriteTokens: dto.cacheWriteTokens,
    audioMs: dto.audioMs,
    characters: dto.characters,
    usdMicros,
    other: otherMoney(dto.cost),
    share: totalUsd > 0 ? usdMicros / totalUsd : null,
  };
}

/** Rows of the table, in the server's order (biggest USD spend first). */
export function modelSpendRows(spend: PlatformSpendResponseDto): ModelSpendRow[] {
  const totalUsd = microsIn(spend.totals.cost);
  return spend.models.map((m: ModelSpendDto) => ({
    ...figures(m, totalUsd),
    modelId: m.modelId,
    name: m.model?.displayName ?? m.modelId,
    removed: m.model === null,
    modality: m.model?.modality ?? null,
    status: m.model?.status ?? null,
    providerName: m.provider?.displayName ?? null,
    region: m.provider?.region ?? null,
    boundTo: m.boundTo,
    byCapability: m.byCapability.map((c) => ({
      ...figures(c, totalUsd),
      capability: c.capability,
    })),
  }));
}

/** The period's headline numbers. */
export interface SpendTotals {
  readonly usdMicros: number;
  readonly other: readonly MoneyDto[];
  readonly calls: number;
  readonly failed: number;
  readonly fallbackCalls: number;
  readonly unpricedCalls: number;
  /** Models whose calls had no price — named in the warning. */
  readonly unpricedModels: readonly string[];
  readonly credits: string;
  readonly audioMs: number;
  readonly characters: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export function spendTotals(spend: PlatformSpendResponseDto): SpendTotals {
  const t = spend.totals;
  return {
    usdMicros: microsIn(t.cost),
    other: otherMoney(t.cost),
    calls: t.calls,
    failed: t.failed,
    fallbackCalls: t.fallbackCalls,
    unpricedCalls: t.unpricedCalls,
    unpricedModels: spend.models
      .filter((m) => m.unpricedCalls > 0)
      .map((m) => m.model?.displayName ?? m.modelId),
    credits: t.credits,
    audioMs: t.audioMs,
    characters: t.characters,
    inputTokens: t.inputTokens,
    outputTokens: t.outputTokens,
  };
}

/**
 * The chart has at most this many model series; the rest fold into "Other". Eight is how many
 * categorical colours stay apart for colour-blind readers in a stack.
 */
export const MAX_CHART_SERIES = 8;

/** One stacked series: a model (or "other"), its USD per day in dollars, oldest day first. */
export interface SpendSeries {
  readonly key: string;
  /** Null for the folded "Other" series — the page names it. */
  readonly name: string | null;
  /** 0-based colour slot; "Other" has none (it is grey). */
  readonly slot: number | null;
  readonly values: readonly number[];
}

export interface SpendChart {
  readonly days: readonly string[];
  readonly series: readonly SpendSeries[];
  /** Some money was in another currency and is not on the chart. */
  readonly otherCurrency: boolean;
}

/**
 * Cost per day stacked by model, in USD. Only models that cost something get a series, in the
 * table's order (biggest first). Colour slots go by model id, not by rank, so a model keeps its
 * colour when another period reorders the same models.
 */
export function spendChart(spend: PlatformSpendResponseDto): SpendChart {
  const days = spend.daily.map((d) => d.day);
  const costly = spend.models.filter((m) => microsIn(m.cost) > 0);
  const shown = costly.length > MAX_CHART_SERIES ? costly.slice(0, MAX_CHART_SERIES - 1) : costly;
  const shownIds = new Set(shown.map((m) => m.modelId));
  const slots = [...shownIds].sort();

  const perDay = (pick: (modelId: string) => boolean) =>
    spend.daily.map(
      (d) =>
        d.byModel.filter((b) => pick(b.modelId)).reduce((sum, b) => sum + microsIn(b.cost), 0) /
        1_000_000,
    );

  const series: SpendSeries[] = shown.map((m) => ({
    key: m.modelId,
    name: m.model?.displayName ?? m.modelId,
    slot: slots.indexOf(m.modelId),
    values: perDay((id) => id === m.modelId),
  }));
  if (costly.length > shown.length) {
    series.push({
      key: 'other',
      name: null,
      slot: null,
      values: perDay((id) => !shownIds.has(id)),
    });
  }
  return { days, series, otherCurrency: otherMoney(spend.totals.cost).length > 0 };
}
