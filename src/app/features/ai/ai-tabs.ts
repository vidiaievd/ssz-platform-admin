/**
 * Tabs of the "AI" section (§6.7 of plan 90). Each tab is its own address under `/ai`;
 * `/ai` itself opens the first one. "Spend" joins in step 5, providers and evals in part 2.
 */
export const AI_TABS = ['models'] as const;

export type AiTab = (typeof AI_TABS)[number];

export const DEFAULT_AI_TAB: AiTab = 'models';
