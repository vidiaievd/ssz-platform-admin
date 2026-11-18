import { PlanFeatureResponseDto } from '../../api/subscription/models/plan-feature-response-dto';
import {
  CREDITS,
  FEATURE_KEYS,
  FeatureLimitKind,
  featureKey,
} from '../schools/card/plan/feature-keys';
import { PlanAudience } from './plan-model';

/**
 * subscription's rule for a plan code (`plan.ts`): lower_snake_case, starts with a letter,
 * 2–64 characters. It never changes once the plan exists.
 */
export const PLAN_CODE = /^[a-z][a-z0-9_]{1,63}$/;
export const PLAN_CODE_MAX_LENGTH = 64;

/**
 * Where a key stands in the version being written: left out of it, listed but off, or on. A key
 * left out gives nothing, the same as off; "off" is kept apart because a version may say so.
 */
export type KeyState = 'absent' | 'off' | 'on';

/** One key of the editor; numbers are kept as typed and checked on the way out. */
export interface EditorRow {
  readonly key: string;
  /** `null` = a key the panel's catalog does not know: shown and sent back as it was. */
  readonly kind: FeatureLimitKind | null;
  readonly state: KeyState;
  /** Monthly credits as typed; only on `ai_credits` keys. */
  readonly credits: string;
  /** No credit allowance: the key is not metered. Has to be ticked — an empty field is an error. */
  readonly unmetered: boolean;
  /** Each limit the key understands, as typed; empty = not given. */
  readonly limits: Readonly<Record<string, string>>;
  readonly limitNames: readonly string[];
  readonly requiredLimits: readonly string[];
  /** The key is meant for the other audience only; the server refuses it while it is listed. */
  readonly foreign: boolean;
  /** The row of the version the edit started from; `null` for a key it did not list. */
  readonly original: PlanFeatureResponseDto | null;
}

export type RowProblem =
  | { readonly field: 'credits'; readonly problem: 'required' | 'invalid' }
  | { readonly field: 'limit'; readonly limit: string; readonly problem: 'required' | 'invalid' }
  | { readonly field: 'state'; readonly problem: 'foreign' };

/**
 * The rows of the editor: every catalog key of the audience in catalog order, then the keys the
 * starting version lists beyond them (another audience's, or unknown to the panel) — none of
 * them is dropped silently.
 */
export function editorRows(
  audience: PlanAudience,
  features: readonly PlanFeatureResponseDto[],
): EditorRow[] {
  const listed = new Map(features.map((f) => [f.featureKey, f]));
  const rows = FEATURE_KEYS.filter((k) => !k.audience || k.audience === audience).map((k) =>
    rowOf(k.key, audience, listed.get(k.key) ?? null),
  );
  const shown = new Set(rows.map((r) => r.key));
  const rest = features
    .filter((f) => !shown.has(f.featureKey))
    .sort((a, b) => a.featureKey.localeCompare(b.featureKey))
    .map((f) => rowOf(f.featureKey, audience, f));
  return [...rows, ...rest];
}

function rowOf(
  key: string,
  audience: PlanAudience,
  feature: PlanFeatureResponseDto | null,
): EditorRow {
  const def = featureKey(key);
  const kind = def?.kind ?? null;
  const limits: Record<string, string> = {};
  const given = (feature?.limits ?? {}) as Record<string, number>;
  for (const name of def?.limitNames ?? []) {
    limits[name] = typeof given[name] === 'number' ? String(given[name]) : '';
  }
  return {
    key,
    kind,
    state: !feature ? 'absent' : feature.enabled ? 'on' : 'off',
    credits: feature?.monthlyCredits ?? '',
    unmetered:
      !!feature && feature.enabled && kind === 'ai_credits' && feature.monthlyCredits === null,
    limits,
    limitNames: def?.limitNames ?? [],
    requiredLimits: def?.requiredLimits ?? [],
    foreign: !!def?.audience && def.audience !== audience,
    original: feature,
  };
}

/**
 * The editor's rows for another audience (a new plan whose audience was switched): what was set
 * on keys of both audiences stays, keys of the old audience only go.
 */
export function rowsForAudience(rows: readonly EditorRow[], audience: PlanAudience): EditorRow[] {
  const fresh = editorRows(audience, []);
  const kept = new Map(rows.map((r) => [r.key, r]));
  return fresh.map((r) => {
    const old = kept.get(r.key);
    return old ? { ...old, foreign: false } : r;
  });
}

/** What stops a row from being sent, in the order the fields are drawn. Rows left out pass. */
export function rowProblems(row: EditorRow): RowProblem[] {
  if (row.state === 'absent' || row.kind === null) return [];
  if (row.foreign) return [{ field: 'state', problem: 'foreign' }];
  if (row.state === 'off') return [];

  const problems: RowProblem[] = [];
  if (row.kind === 'ai_credits' && !row.unmetered) {
    const credits = row.credits.trim();
    if (credits === '') problems.push({ field: 'credits', problem: 'required' });
    else if (!CREDITS.test(credits)) problems.push({ field: 'credits', problem: 'invalid' });
  }
  for (const name of row.limitNames) {
    const value = (row.limits[name] ?? '').trim();
    if (value === '') {
      if (row.requiredLimits.includes(name)) {
        problems.push({ field: 'limit', limit: name, problem: 'required' });
      }
    } else if (limitValue(row.kind, value) === null) {
      problems.push({ field: 'limit', limit: name, problem: 'invalid' });
    }
  }
  return problems;
}

/** A limit as the server takes it: a non-negative number; seats are a whole number. */
function limitValue(kind: FeatureLimitKind, text: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  if (kind === 'seats' && !Number.isInteger(value)) return null;
  return value;
}

export function editorValid(rows: readonly EditorRow[]): boolean {
  return rows.every((r) => rowProblems(r).length === 0);
}

/**
 * The complete feature list the rows describe, ordered by key — the body of a new version or plan.
 * A key switched off carries nothing beside the switch; a key unknown to the panel goes back as
 * it was. Call it on valid rows only.
 */
export function editorFeatures(rows: readonly EditorRow[]): PlanFeatureResponseDto[] {
  const out: PlanFeatureResponseDto[] = [];
  for (const row of rows) {
    if (row.state === 'absent') continue;
    if (row.kind === null) {
      if (row.original) out.push(row.original);
      continue;
    }
    if (row.state === 'off') {
      out.push({ featureKey: row.key, enabled: false, monthlyCredits: null, limits: {} });
      continue;
    }
    const limits: Record<string, number> = {};
    for (const name of row.limitNames) {
      const text = (row.limits[name] ?? '').trim();
      const value = text === '' ? null : limitValue(row.kind, text);
      if (value !== null) limits[name] = value;
    }
    out.push({
      featureKey: row.key,
      enabled: true,
      monthlyCredits: row.kind === 'ai_credits' && !row.unmetered ? row.credits.trim() : null,
      limits,
    });
  }
  return out.sort((a, b) => a.featureKey.localeCompare(b.featureKey));
}

/** What is wrong with a new plan's code and name, before the server is asked. */
export function codeProblem(code: string): 'required' | 'invalid' | null {
  const value = code.trim();
  if (value === '') return 'required';
  return PLAN_CODE.test(value) ? null : 'invalid';
}
