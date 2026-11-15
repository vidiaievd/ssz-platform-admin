import { PlanDetailsResponseDto } from '../../api/subscription/models/plan-details-response-dto';
import { PlanFeatureResponseDto } from '../../api/subscription/models/plan-feature-response-dto';
import { PlanResponseDto } from '../../api/subscription/models/plan-response-dto';
import { PlanStatsDto } from '../../api/subscription/models/plan-stats-dto';
import { PlanVersionResponseDto } from '../../api/subscription/models/plan-version-response-dto';
import { SEATS_KEY, featureKind } from '../schools/card/plan/feature-keys';

export type PlanAudience = PlanResponseDto['audience'];

/** Audiences in the order the panel lists them. */
export const AUDIENCES: readonly PlanAudience[] = ['workspace', 'individual'];

/**
 * The fallback plan of each audience — a copy of subscription-service's `FREE_PLAN_CODES`
 * (`modules/entitlements/domain/entitlements.ts`). Every new account opens on it, so the server
 * refuses to archive it (`free_plan_not_archivable`); the panel does not offer to.
 */
export const FREE_PLAN_CODES: Readonly<Record<PlanAudience, string>> = {
  workspace: 'free_workspace',
  individual: 'free_individual',
};

export function isFreePlan(code: string): boolean {
  return Object.values(FREE_PLAN_CODES).includes(code);
}

/** Who a version was written by: the seed, or an administrator's userId. */
export const SEED_AUTHOR = 'seed';

/** Payers on a plan through a subscription row; `null` = the stats read is not in. */
export interface PlanSubscribers {
  readonly total: number;
  readonly onCurrent: number;
  readonly onOlder: number;
  readonly trial: number;
}

/** One row of the catalog. */
export interface CatalogRow {
  readonly code: string;
  readonly name: string;
  readonly audience: PlanAudience;
  readonly archived: boolean;
  readonly free: boolean;
  readonly currentVersion: number;
  readonly keys: number;
  readonly subscribers: PlanSubscribers | null;
}

export interface CatalogGroup {
  readonly audience: PlanAudience;
  readonly rows: readonly CatalogRow[];
}

/** Subscribers of a plan from the stats read; a plan the stats do not know has none. */
export function subscribersOf(
  stats: readonly PlanStatsDto[] | null,
  code: string,
): PlanSubscribers | null {
  if (!stats) return null;
  const row = stats.find((s) => s.code === code);
  if (!row) return { total: 0, onCurrent: 0, onOlder: 0, trial: 0 };
  const onCurrent = row.byVersion
    .filter((v) => v.version === row.currentVersion)
    .reduce((sum, v) => sum + v.count, 0);
  return {
    total: row.subscribers,
    onCurrent,
    onOlder: Math.max(0, row.subscribers - onCurrent),
    trial: row.trial,
  };
}

/**
 * The catalog by audience: active plans first (free one leading), then archived ones, each
 * by name. Subscribers come from a separate read and may be missing (`stats` = `null`).
 */
export function catalogGroups(
  plans: readonly PlanResponseDto[],
  stats: readonly PlanStatsDto[] | null,
): CatalogGroup[] {
  const rank = (p: PlanResponseDto) => (p.status === 'archived' ? 2 : isFreePlan(p.code) ? 0 : 1);
  return AUDIENCES.map((audience) => ({
    audience,
    rows: plans
      .filter((p) => p.audience === audience)
      .sort(
        (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name) || a.code.localeCompare(b.code),
      )
      .map<CatalogRow>((p) => ({
        code: p.code,
        name: p.name,
        audience: p.audience,
        archived: p.status === 'archived',
        free: isFreePlan(p.code),
        currentVersion: p.current.version,
        keys: p.current.features.length,
        subscribers: subscribersOf(stats, p.code),
      })),
  })).filter((g) => g.rows.length > 0);
}

/** What a key gives in one version; absent from the version = not given at all. */
export interface FeatureTerms {
  readonly enabled: boolean;
  readonly monthlyCredits: string | null;
  readonly limits: Readonly<Record<string, number>>;
}

/**
 * One key whose terms differ between two versions — the same shape as subscription-service's
 * `diffPlanFeatures` (`modules/plans/domain/plan-diff.ts`), which the migration preview answers with.
 */
export interface FeatureChange {
  readonly featureKey: string;
  readonly change: 'added' | 'removed' | 'changed';
  readonly before: FeatureTerms | null;
  readonly after: FeatureTerms | null;
}

export function termsOf(feature: PlanFeatureResponseDto): FeatureTerms {
  return {
    enabled: feature.enabled,
    monthlyCredits: feature.monthlyCredits,
    limits: { ...(feature.limits as Record<string, number>) },
  };
}

/**
 * Key-by-key difference between an older and a newer version, ordered by key. Keys with the same
 * terms on both sides are left out; credits compare as numbers ("300" = "300.0").
 */
export function diffFeatures(
  from: readonly PlanFeatureResponseDto[],
  to: readonly PlanFeatureResponseDto[],
): FeatureChange[] {
  const before = new Map(from.map((f) => [f.featureKey, termsOf(f)]));
  const after = new Map(to.map((f) => [f.featureKey, termsOf(f)]));
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();

  const changes: FeatureChange[] = [];
  for (const featureKey of keys) {
    const b = before.get(featureKey) ?? null;
    const a = after.get(featureKey) ?? null;
    if (b && a) {
      if (!sameTerms(b, a)) changes.push({ featureKey, change: 'changed', before: b, after: a });
    } else if (a) {
      changes.push({ featureKey, change: 'added', before: null, after: a });
    } else {
      changes.push({ featureKey, change: 'removed', before: b, after: null });
    }
  }
  return changes;
}

function sameTerms(a: FeatureTerms, b: FeatureTerms): boolean {
  if (a.enabled !== b.enabled) return false;
  if (!sameCredits(a.monthlyCredits, b.monthlyCredits)) return false;
  const names = new Set([...Object.keys(a.limits), ...Object.keys(b.limits)]);
  for (const name of names) {
    if (a.limits[name] !== b.limits[name]) return false;
  }
  return true;
}

function sameCredits(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return Number(a) === Number(b);
}

/**
 * How a key's terms read, as a translation key under `plans.terms` and its parameters:
 * off; seats with their limit; a switch on; credits per month or unmetered; other limits listed.
 */
export interface TermsText {
  readonly key: 'off' | 'seats' | 'on' | 'credits' | 'unmetered';
  readonly n: string | number | null;
  /** Limits other than the seat `max`, as `name = value`. */
  readonly extra: readonly string[];
}

export function termsText(featureKey: string, terms: FeatureTerms): TermsText {
  const extra = Object.entries(terms.limits)
    .filter(([name]) => !(featureKey === SEATS_KEY && name === 'max'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name} = ${value}`);
  if (!terms.enabled) return { key: 'off', n: null, extra };
  if (featureKey === SEATS_KEY) {
    const max = terms.limits['max'];
    return { key: 'seats', n: typeof max === 'number' ? max : null, extra };
  }
  if (featureKind(featureKey) === 'switch') return { key: 'on', n: null, extra };
  return terms.monthlyCredits === null
    ? { key: 'unmetered', n: null, extra }
    : { key: 'credits', n: terms.monthlyCredits, extra };
}

/** One version on the plan card. */
export interface VersionRow {
  readonly version: number;
  readonly current: boolean;
  readonly createdAt: string;
  /** `null` = the seed wrote it. */
  readonly createdBy: string | null;
  readonly features: readonly PlanFeatureResponseDto[];
  /** Payers on exactly this version; `null` while the stats read is not in (or failed). */
  readonly subscribers: number | null;
  /** The version just below, and how this one differs from it; none for the first. */
  readonly previous: number | null;
  readonly changes: readonly FeatureChange[];
}

/**
 * Every version, newest first, with its subscribers and the change from the version below it.
 * A version the stats do not list has no subscribers.
 */
export function versionRows(
  plan: PlanDetailsResponseDto,
  stats: readonly PlanStatsDto[] | null,
): VersionRow[] {
  const counts = stats?.find((s) => s.code === plan.code)?.byVersion ?? null;
  const versions = [...plan.versions].sort((a, b) => b.version - a.version);
  return versions.map((v, i) => {
    const below: PlanVersionResponseDto | undefined = versions[i + 1];
    return {
      version: v.version,
      current: v.version === plan.current.version,
      createdAt: v.createdAt,
      createdBy: v.createdBy === SEED_AUTHOR ? null : v.createdBy,
      features: [...v.features].sort((a, b) => a.featureKey.localeCompare(b.featureKey)),
      subscribers: !stats
        ? null
        : (counts?.filter((c) => c.version === v.version).reduce((s, c) => s + c.count, 0) ?? 0),
      previous: below ? below.version : null,
      changes: below ? diffFeatures(below.features, v.features) : [],
    };
  });
}
