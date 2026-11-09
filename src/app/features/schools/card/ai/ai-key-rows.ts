import { PayerFeatureUsageDto } from '../../../../api/ai/models/payer-feature-usage-dto';
import { GrantResponseDto } from '../../../../api/subscription/models/grant-response-dto';
import { Language } from '../../../../core/i18n/languages';

/**
 * Where a key's state comes from: the plan, a grant that switches it on, a grant that switches it
 * off, or nothing gives it. `null` = the grants could not be read, the source is unknown.
 */
export type KeySource = 'plan' | 'grant_on' | 'grant_off' | 'none';

/**
 * What the row's button does (`admin`+):
 * - `switch_off` — a disabling grant (it applies last, so it wins over the plan and any grant);
 * - `switch_on` — an enabling grant (only when no disabling grant is in force, see below);
 * - `revoke_off` — the key is off by a disabling grant: a new enabling grant would change nothing
 *   (the disabling one still applies last), so the way back is to revoke it.
 * `null` — no safe action: the key is off and the grants are unknown.
 */
export type KeyAction = 'switch_off' | 'switch_on' | 'revoke_off';

export interface AiKeyRow {
  readonly usage: PayerFeatureUsageDto;
  readonly source: KeySource | null;
  readonly action: KeyAction | null;
  /** The disabling grant in force (the one `revoke_off` revokes). */
  readonly offGrant: GrantResponseDto | null;
  /** The next grant on this key that has not started yet. */
  readonly scheduled: GrantResponseDto | null;
  /** Spent beyond the period's credits (calls in flight when it ran out). */
  readonly overLimit: boolean;
}

/**
 * Joins ai-service's view of the keys (what the gate reads) with subscription's live grants
 * (why). `grants` is `null` while the account is unknown — loading or failed.
 */
export function aiKeyRows(
  features: readonly PayerFeatureUsageDto[],
  grants: readonly GrantResponseDto[] | null,
): AiKeyRow[] {
  return features.map((usage) => {
    const own = grants?.filter((g) => g.featureKey === usage.feature) ?? [];
    const active = own.filter((g) => g.state === 'active');
    const offGrant = active.find((g) => !g.enabled) ?? null;
    const scheduled =
      own
        .filter((g) => g.state === 'scheduled')
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;

    let source: KeySource | null = null;
    if (grants !== null) {
      if (offGrant) source = 'grant_off';
      else if (active.some((g) => g.enabled)) source = 'grant_on';
      else source = usage.enabled ? 'plan' : 'none';
    }

    let action: KeyAction | null;
    if (offGrant) action = 'revoke_off';
    else if (usage.enabled) action = 'switch_off';
    else action = grants === null ? null : 'switch_on';

    return { usage, source, action, offGrant, scheduled, overLimit: isOverLimit(usage) };
  });
}

function isOverLimit(usage: PayerFeatureUsageDto): boolean {
  if (usage.used === null || usage.total === null) return false;
  return Number(usage.used) > Number(usage.total);
}

const formats = new Map<Language, Intl.NumberFormat>();

/** Credits in the panel's language, at most two decimals (the ledger keeps six). */
export function formatCredits(value: string | null, lang: Language): string {
  if (value === null) return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  let format = formats.get(lang);
  if (!format) {
    format = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 });
    formats.set(lang, format);
  }
  return format.format(n);
}

/** Share of the period's credits spent, 0–100 (capped), for the bar; `null` when unmetered. */
export function usedPercent(usage: PayerFeatureUsageDto): number | null {
  if (usage.used === null || usage.total === null) return null;
  const total = Number(usage.total);
  if (!(total > 0)) return Number(usage.used) > 0 ? 100 : 0;
  return Math.min(100, Math.round((Number(usage.used) / total) * 100));
}
