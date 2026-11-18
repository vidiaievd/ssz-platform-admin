/**
 * Tabs of the school card (§6.3 of plan 90). The tab is in the URL — `/schools/:id/plan` — so a
 * link reproduces the screen. The overview is the default and, like the list's defaults, is not
 * written: it lives at `/schools/:id`, and an unknown tab falls back to it.
 */
export const SCHOOL_TABS = ['overview', 'members', 'plan', 'ai', 'journal', 'danger'] as const;

export type SchoolTab = (typeof SCHOOL_TABS)[number];

export const DEFAULT_SCHOOL_TAB: SchoolTab = 'overview';

/** Path of a tab under `/schools/:id`; the default tab has none. */
export function schoolTabPath(tab: SchoolTab): string {
  return tab === DEFAULT_SCHOOL_TAB ? '' : tab;
}

/** Router commands to a tab of a school, from anywhere in the panel. */
export function schoolTabLink(schoolId: string, tab: SchoolTab = DEFAULT_SCHOOL_TAB): string[] {
  const path = schoolTabPath(tab);
  return path ? ['/schools', schoolId, path] : ['/schools', schoolId];
}
