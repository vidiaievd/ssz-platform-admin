import { PlanDetailsResponseDto } from '../../api/subscription/models/plan-details-response-dto';
import { PlanFeatureResponseDto } from '../../api/subscription/models/plan-feature-response-dto';
import { PlanResponseDto } from '../../api/subscription/models/plan-response-dto';
import { PlanStatsDto } from '../../api/subscription/models/plan-stats-dto';
import {
  catalogGroups,
  diffFeatures,
  isFreePlan,
  subscribersOf,
  termsText,
  versionRows,
} from './plan-model';

const at = '2026-10-01T00:00:00Z';

function feature(
  featureKey: string,
  monthlyCredits: string | null = null,
  enabled = true,
  limits: Record<string, number> = {},
): PlanFeatureResponseDto {
  return { featureKey, enabled, monthlyCredits, limits };
}

function plan(
  code: string,
  name: string,
  audience: PlanResponseDto['audience'] = 'workspace',
  status: PlanResponseDto['status'] = 'active',
  version = 1,
): PlanResponseDto {
  return {
    id: code,
    code,
    name,
    audience,
    status,
    current: {
      version,
      createdAt: at,
      createdBy: 'seed',
      features: [feature('ai.practice', '10')],
    },
  };
}

function stats(
  code: string,
  currentVersion: number,
  byVersion: Record<number, number>,
  trial = 0,
): PlanStatsDto {
  const rows = Object.entries(byVersion)
    .map(([version, count]) => ({ version: Number(version), count }))
    .sort((a, b) => b.version - a.version);
  return {
    code,
    name: code,
    audience: 'workspace',
    status: 'active',
    currentVersion,
    byVersion: rows,
    subscribers: rows.reduce((s, r) => s + r.count, 0),
    trial,
  };
}

describe('plan model', () => {
  it('knows the free plans of both audiences', () => {
    expect(isFreePlan('free_workspace')).toBe(true);
    expect(isFreePlan('free_individual')).toBe(true);
    expect(isFreePlan('tutor_pro')).toBe(false);
  });

  it('splits subscribers into the current version and older ones', () => {
    expect(subscribersOf([stats('pro', 3, { 3: 5, 2: 2, 1: 1 }, 1)], 'pro')).toEqual({
      total: 8,
      onCurrent: 5,
      onOlder: 3,
      trial: 1,
    });
    // Not in the stats: nobody on it. No stats at all: unknown.
    expect(subscribersOf([], 'pro')).toEqual({ total: 0, onCurrent: 0, onOlder: 0, trial: 0 });
    expect(subscribersOf(null, 'pro')).toBeNull();
  });

  it('groups the catalog by audience: free first, archived last, then by name', () => {
    const groups = catalogGroups(
      [
        plan('old', 'Aardvark', 'workspace', 'archived'),
        plan('school', 'School'),
        plan('free_workspace', 'Zero'),
        plan('basic', 'Basic'),
        plan('free_individual', 'Free', 'individual'),
      ],
      null,
    );
    expect(groups.map((g) => g.audience)).toEqual(['workspace', 'individual']);
    expect(groups[0].rows.map((r) => r.code)).toEqual(['free_workspace', 'basic', 'school', 'old']);
    expect(groups[0].rows[3].archived).toBe(true);
    expect(groups[0].rows[0]).toMatchObject({ free: true, keys: 1, subscribers: null });
  });

  it('drops an audience with no plans', () => {
    expect(catalogGroups([plan('basic', 'Basic')], []).map((g) => g.audience)).toEqual([
      'workspace',
    ]);
  });

  it('diffs versions key by key, credits as numbers', () => {
    const changes = diffFeatures(
      [
        feature('ai.practice', '300'),
        feature('ai.authoring', '50'),
        feature('seats.students', null, true, { max: 10 }),
      ],
      [
        feature('ai.practice', '300.0'),
        feature('ai.review_draft', '100'),
        feature('seats.students', null, true, { max: 25 }),
      ],
    );
    expect(changes.map((c) => [c.featureKey, c.change])).toEqual([
      ['ai.authoring', 'removed'],
      ['ai.review_draft', 'added'],
      ['seats.students', 'changed'],
    ]);
    expect(changes[2].before?.limits).toEqual({ max: 10 });
    expect(changes[2].after?.limits).toEqual({ max: 25 });
  });

  it('sees a switch turned off as a change', () => {
    const changes = diffFeatures(
      [feature('ai.practice', '10')],
      [feature('ai.practice', '10', false)],
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].change).toBe('changed');
  });

  it('reads terms by the kind of the key', () => {
    const t = (f: PlanFeatureResponseDto) =>
      termsText(f.featureKey, {
        enabled: f.enabled,
        monthlyCredits: f.monthlyCredits,
        limits: f.limits as Record<string, number>,
      });
    expect(t(feature('ai.practice', '300'))).toEqual({ key: 'credits', n: '300', extra: [] });
    expect(t(feature('ai.practice', null))).toEqual({ key: 'unmetered', n: null, extra: [] });
    expect(t(feature('ai.practice', '300', false))).toEqual({ key: 'off', n: null, extra: [] });
    expect(t(feature('school.review_ai_policy'))).toEqual({ key: 'on', n: null, extra: [] });
    expect(t(feature('seats.students', null, true, { max: 25 }))).toEqual({
      key: 'seats',
      n: 25,
      extra: [],
    });
    expect(t(feature('ai.practice', '5', true, { perDay: 3 }))).toEqual({
      key: 'credits',
      n: '5',
      extra: ['perDay = 3'],
    });
  });

  it('lists versions newest first with subscribers and the change from the one below', () => {
    const details: PlanDetailsResponseDto = {
      ...plan('pro', 'Pro', 'workspace', 'active', 3),
      versions: [
        { version: 1, createdAt: at, createdBy: 'seed', features: [feature('ai.practice', '10')] },
        {
          version: 3,
          createdAt: at,
          createdBy: 'admin-1',
          features: [feature('ai.practice', '30')],
        },
        {
          version: 2,
          createdAt: at,
          createdBy: 'admin-1',
          features: [feature('ai.practice', '10')],
        },
      ],
    };
    const rows = versionRows(details, [stats('pro', 3, { 3: 4, 1: 2 })]);
    expect(rows.map((r) => [r.version, r.current, r.subscribers, r.previous])).toEqual([
      [3, true, 4, 2],
      [2, false, 0, 1],
      [1, false, 2, null],
    ]);
    expect(rows[0].changes.map((c) => c.change)).toEqual(['changed']);
    expect(rows[1].changes).toEqual([]);
    expect(rows[0].createdBy).toBe('admin-1');
    expect(rows[2].createdBy).toBeNull();

    // Without the stats the counts are unknown, not zero.
    expect(versionRows(details, null).map((r) => r.subscribers)).toEqual([null, null, null]);
  });
});
