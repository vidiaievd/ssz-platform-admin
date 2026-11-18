/**
 * Tabs of the "AI" section (§6.7 of plan 90). Each tab is its own address under `/ai`;
 * `/ai` itself opens the first one.
 */
export const AI_TABS = ['models', 'providers', 'evals', 'gate', 'spend'] as const;

export type AiTab = (typeof AI_TABS)[number];

export const DEFAULT_AI_TAB: AiTab = 'models';
