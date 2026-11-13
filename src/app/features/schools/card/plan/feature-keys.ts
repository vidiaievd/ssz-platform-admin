/**
 * The feature keys a grant may name — a copy of subscription-service's catalog
 * (`modules/plans/domain/feature-key.ts`); the server refuses anything else with 422. A new key
 * there is one line here. `ai_credits` keys take monthly credits; a `switch` key is on or off; a `seats` key is a limit
 * (`limits.max`) that a grant can only raise and never switch off.
 */
export type FeatureLimitKind = 'ai_credits' | 'switch' | 'seats';

export interface FeatureKey {
  readonly key: string;
  readonly kind: FeatureLimitKind;
}

/** The student seat limit of a school (plan 90, phase 4). */
export const SEATS_KEY = 'seats.students';

export const FEATURE_KEYS: readonly FeatureKey[] = [
  { key: 'ai.review_draft', kind: 'ai_credits' },
  { key: 'ai.review_direct', kind: 'ai_credits' },
  { key: 'ai.student_assist', kind: 'ai_credits' },
  { key: 'ai.practice', kind: 'ai_credits' },
  { key: 'ai.authoring', kind: 'ai_credits' },
  { key: 'ai.voice_review', kind: 'ai_credits' },
  { key: 'ai.voice_review_pronunciation', kind: 'ai_credits' },
  { key: 'school.review_ai_policy', kind: 'switch' },
  { key: SEATS_KEY, kind: 'seats' },
];

export function featureKind(key: string): FeatureLimitKind | undefined {
  return FEATURE_KEYS.find((f) => f.key === key)?.kind;
}
