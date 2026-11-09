/** Panel languages (plan 90, §3). The first one is the default. */
export const LANGUAGES = ['uk', 'en', 'nb'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'uk';

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}
