/**
 * Tabs of the user card (plan 90, phase 6, step 7). As on the school card, the tab is in the URL —
 * `/users/:id/plan` — and the overview, the default, lives at `/users/:id` with no path; an
 * unknown tab falls back to it. "Plan", "AI" and "Journal" are the school card's tabs, reading a
 * `user` payer through `PayerCard`.
 */
export const USER_TABS = ['overview', 'schools', 'plan', 'ai', 'journal'] as const;

export type UserTab = (typeof USER_TABS)[number];

export const DEFAULT_USER_TAB: UserTab = 'overview';

/** Path of a tab under `/users/:id`; the default tab has none. */
export function userTabPath(tab: UserTab): string {
  return tab === DEFAULT_USER_TAB ? '' : tab;
}

/** Router commands to a tab of a user, from anywhere in the panel. */
export function userTabLink(userId: string, tab: UserTab = DEFAULT_USER_TAB): string[] {
  const path = userTabPath(tab);
  return path ? ['/users', userId, path] : ['/users', userId];
}
