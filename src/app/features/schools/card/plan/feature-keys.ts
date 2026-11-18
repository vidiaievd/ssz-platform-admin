/**
 * The feature keys a plan or a grant may name — a copy of subscription-service's catalog
 * (`modules/plans/domain/feature-key.ts`, limit names and audience included); the server refuses
 * anything else with 422. A new key there is one line here. `ai_credits` keys take monthly credits; a `switch` key is on or off; a `seats` key is a limit
 * (`limits.max`) that a grant can only raise and never switch off.
 */
export type FeatureLimitKind = 'ai_credits' | 'switch' | 'seats';

export interface FeatureKey {
  readonly key: string;
  readonly kind: FeatureLimitKind;
  /** Names of `limits` entries the key understands; the server refuses any other. */
  readonly limitNames: readonly string[];
  /** Limits a plan or grant must give whenever it has the key on. */
  readonly requiredLimits?: readonly string[];
  /** The only plan audience the key makes sense for; absent = both. */
  readonly audience?: 'workspace' | 'individual';
}

/** Credits as subscription accepts them (`plan.ts`): a decimal string that fits DECIMAL(18, 6). */
export const CREDITS = /^\d{1,12}(\.\d{1,6})?$/;

/** The student seat limit of a school (plan 90, phase 4). */
export const SEATS_KEY = 'seats.students';

export const FEATURE_KEYS: readonly FeatureKey[] = [
  { key: 'ai.review_draft', kind: 'ai_credits', limitNames: [] },
  { key: 'ai.review_direct', kind: 'ai_credits', limitNames: [] },
  { key: 'ai.student_assist', kind: 'ai_credits', limitNames: ['perLearnerMonthlyCredits'] },
  { key: 'ai.practice', kind: 'ai_credits', limitNames: ['perLearnerMonthlyCredits'] },
  { key: 'ai.authoring', kind: 'ai_credits', limitNames: [] },
  { key: 'ai.voice_review', kind: 'ai_credits', limitNames: [] },
  { key: 'ai.voice_review_pronunciation', kind: 'ai_credits', limitNames: [] },
  { key: 'school.review_ai_policy', kind: 'switch', limitNames: [] },
  {
    key: SEATS_KEY,
    kind: 'seats',
    limitNames: ['max'],
    requiredLimits: ['max'],
    audience: 'workspace',
  },
];

export function featureKey(key: string): FeatureKey | undefined {
  return FEATURE_KEYS.find((f) => f.key === key);
}

export function featureKind(key: string): FeatureLimitKind | undefined {
  return featureKey(key)?.kind;
}
