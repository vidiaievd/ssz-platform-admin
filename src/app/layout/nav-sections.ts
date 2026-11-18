import { AdminLevel } from '../core/auth/admin-level';

/** Sections of the panel (§2 of plan 90), in menu order. */
export const NAV_SECTION_IDS = [
  'dashboard',
  'schools',
  'users',
  'plans',
  'ai',
  'platform',
  'audit',
  'payments',
] as const;

export type NavSectionId = (typeof NAV_SECTION_IDS)[number];

export interface NavSection {
  readonly id: NavSectionId;
  /** Router path, without the leading slash; '' is the overview. */
  readonly path: string;
  readonly icon: string;
  /** Lowest level that sees the section; none → every level. */
  readonly minLevel?: AdminLevel;
}

/**
 * Every level may look at every section (§2 — "see everything"); levels limit actions inside
 * a section. `minLevel` is here for sections that a lower level must not even see.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  { id: 'dashboard', path: '', icon: 'pi pi-chart-bar' },
  { id: 'schools', path: 'schools', icon: 'pi pi-building' },
  { id: 'users', path: 'users', icon: 'pi pi-users' },
  { id: 'plans', path: 'plans', icon: 'pi pi-tags' },
  { id: 'ai', path: 'ai', icon: 'pi pi-microchip-ai' },
  { id: 'platform', path: 'platform', icon: 'pi pi-cog' },
  { id: 'audit', path: 'audit', icon: 'pi pi-history' },
  { id: 'payments', path: 'payments', icon: 'pi pi-wallet' },
];

export function navSection(id: NavSectionId): NavSection {
  const section = NAV_SECTIONS.find((s) => s.id === id);
  if (!section) throw new Error(`Unknown section ${id}`);
  return section;
}
