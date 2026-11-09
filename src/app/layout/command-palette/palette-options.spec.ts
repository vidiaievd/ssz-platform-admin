import { AdminSchoolListItemDto } from '../../api/organization/models/admin-school-list-item-dto';
import { NAV_SECTIONS, NavSection } from '../nav-sections';
import {
  isPaletteHotkey,
  keepActive,
  matchSections,
  moveActive,
  normalizeTerm,
  paletteOptions,
} from './palette-options';

const LABELS: Record<string, string> = {
  dashboard: 'Oversikt',
  schools: 'Skoler',
  users: 'Brukere',
  plans: 'Abonnementer',
  ai: 'KI',
  platform: 'Plattform',
  audit: 'Logg',
  payments: 'Betalinger',
};
const label = (s: NavSection) => LABELS[s.id];
const ids = (sections: NavSection[]) => sections.map((s) => s.id);

function school(id: string): AdminSchoolListItemDto {
  return {
    id,
    name: `School ${id}`,
    slug: `school-${id}`,
    kind: 'SCHOOL',
    status: 'active',
    city: null,
    ownerId: 'owner',
    createdAt: '2026-01-01T00:00:00Z',
    counts: { students: 0, teachers: 0 },
  } as AdminSchoolListItemDto;
}

describe('palette options', () => {
  it('trims and caps the term', () => {
    expect(normalizeTerm('  nord  ')).toBe('nord');
    expect(normalizeTerm('x'.repeat(150))).toHaveLength(100);
  });

  it('lists every section for an empty term, in menu order', () => {
    expect(ids(matchSections(NAV_SECTIONS, label, ''))).toEqual(NAV_SECTIONS.map((s) => s.id));
  });

  it('matches labels without case, prefix matches first', () => {
    // "Plattform" starts with "pl"; "Abonnementer" does not contain it, "plans" id does.
    expect(ids(matchSections(NAV_SECTIONS, label, 'PL'))).toEqual(['platform', 'plans']);
    expect(ids(matchSections(NAV_SECTIONS, label, 'er'))).toEqual([
      'dashboard',
      'schools',
      'users',
      'plans',
      'payments',
    ]);
  });

  it('matches the section id too, whatever the language', () => {
    expect(ids(matchSections(NAV_SECTIONS, label, 'audit'))).toEqual(['audit']);
  });

  it('ignores accents', () => {
    const sections = NAV_SECTIONS.filter((s) => s.id === 'schools');
    expect(ids(matchSections(sections, () => 'Écoles', 'eco'))).toEqual(['schools']);
  });

  it('puts schools after sections and offers the full list when there are more', () => {
    const options = paletteOptions(NAV_SECTIONS.slice(0, 1), {
      kind: 'ready',
      term: 'no',
      items: [school('a'), school('b')],
      total: 12,
    });
    expect(options.map((o) => o.id)).toEqual([
      'palette-section-dashboard',
      'palette-school-a',
      'palette-school-b',
      'palette-all-schools',
    ]);
    expect(options[3]).toMatchObject({ kind: 'allSchools', term: 'no', total: 12 });
  });

  it('shows no schools while a search is loading or failed', () => {
    expect(paletteOptions([], { kind: 'loading', term: 'no' })).toEqual([]);
    expect(paletteOptions([], { kind: 'idle' })).toEqual([]);
  });

  it('keeps the active option when the list changes around it', () => {
    const before = paletteOptions(NAV_SECTIONS.slice(0, 3), { kind: 'idle' });
    const after = paletteOptions(NAV_SECTIONS.slice(0, 3), {
      kind: 'ready',
      term: 'sk',
      items: [school('a')],
      total: 1,
    });
    expect(keepActive(after, before[2].id)).toBe(2);
    expect(keepActive(after, 'gone')).toBe(0);
    expect(keepActive([], 'x')).toBe(-1);
  });

  it('walks the list round with the arrows', () => {
    expect(moveActive(0, 3, 1)).toBe(1);
    expect(moveActive(2, 3, 1)).toBe(0);
    expect(moveActive(0, 3, -1)).toBe(2);
    expect(moveActive(-1, 3, -1)).toBe(2);
    expect(moveActive(0, 0, 1)).toBe(-1);
  });

  it('opens on Ctrl+K and ⌘K only', () => {
    const key = (init: KeyboardEventInit) => isPaletteHotkey(new KeyboardEvent('keydown', init));
    expect(key({ key: 'k', ctrlKey: true })).toBe(true);
    expect(key({ key: 'K', metaKey: true })).toBe(true);
    expect(key({ key: 'k' })).toBe(false);
    expect(key({ key: 'k', ctrlKey: true, shiftKey: true })).toBe(false);
    expect(key({ key: 'j', ctrlKey: true })).toBe(false);
  });
});
