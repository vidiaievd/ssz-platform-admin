import { AdminSchoolListItemDto } from '../../api/organization/models/admin-school-list-item-dto';
import { ApiError } from '../../core/auth/api-error';
import { NavSection } from '../nav-sections';

/** Shortest search that goes to the server: one letter would match half the platform. */
export const SCHOOL_SEARCH_MIN = 2;
/** Schools shown in the palette; the rest are one step away in the list. */
export const SCHOOL_SEARCH_LIMIT = 8;
/** Same cap as the list's search box and the server's `MaxLength(100)`. */
export const SEARCH_TERM_MAX = 100;

/** What the palette knows about the school search for the current term. */
export type SchoolSearchState =
  /** The term is too short, nothing is asked. */
  | { readonly kind: 'idle' }
  /** Waiting for the typing to stop, or for the answer. */
  | { readonly kind: 'loading'; readonly term: string }
  | {
      readonly kind: 'ready';
      readonly term: string;
      readonly items: readonly AdminSchoolListItemDto[];
      readonly total: number;
    }
  | { readonly kind: 'error'; readonly term: string; readonly error: ApiError };

export type PaletteOption =
  | { readonly kind: 'section'; readonly id: string; readonly section: NavSection }
  | { readonly kind: 'school'; readonly id: string; readonly school: AdminSchoolListItemDto }
  /** "All N results in the list" — the schools list opened with the same search. */
  | {
      readonly kind: 'allSchools';
      readonly id: string;
      readonly term: string;
      readonly total: number;
    };

/** The term as it is searched: trimmed and capped. */
export function normalizeTerm(raw: string): string {
  return raw.trim().slice(0, SEARCH_TERM_MAX);
}

function fold(value: string): string {
  // Case and accents do not matter ("Oversikt" = "oversikt", "é" = "e"); ø/æ stay letters.
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

/**
 * Sections whose label (in the panel's language) or id contains the term; labels that start
 * with it come first, otherwise menu order. Empty term → every section.
 */
export function matchSections(
  sections: readonly NavSection[],
  label: (section: NavSection) => string,
  term: string,
): NavSection[] {
  const needle = fold(term);
  if (!needle) return [...sections];
  const scored = sections
    .map((section, order) => {
      const text = fold(label(section));
      const starts = text.startsWith(needle);
      const hit = starts || text.includes(needle) || section.id.includes(needle);
      return { section, order, hit, rank: starts ? 0 : 1 };
    })
    .filter((s) => s.hit);
  scored.sort((a, b) => a.rank - b.rank || a.order - b.order);
  return scored.map((s) => s.section);
}

/** Options in display order: sections, then schools, then "all results" when there are more. */
export function paletteOptions(
  sections: readonly NavSection[],
  schools: SchoolSearchState,
): PaletteOption[] {
  const options: PaletteOption[] = sections.map((section) => ({
    kind: 'section',
    id: `palette-section-${section.id}`,
    section,
  }));
  if (schools.kind === 'ready') {
    for (const school of schools.items) {
      options.push({ kind: 'school', id: `palette-school-${school.id}`, school });
    }
    if (schools.total > schools.items.length) {
      options.push({
        kind: 'allSchools',
        id: 'palette-all-schools',
        term: schools.term,
        total: schools.total,
      });
    }
  }
  return options;
}

/**
 * The active option after the list changed: the same one if it is still there (an answer
 * arriving must not move the cursor away from a section), otherwise the first.
 */
export function keepActive(options: readonly PaletteOption[], previousId: string | null): number {
  if (options.length === 0) return -1;
  const index = previousId ? options.findIndex((o) => o.id === previousId) : -1;
  return index >= 0 ? index : 0;
}

/** Arrow keys walk the list round. */
export function moveActive(index: number, count: number, step: 1 | -1): number {
  if (count === 0) return -1;
  if (index < 0) return step === 1 ? 0 : count - 1;
  return (index + step + count) % count;
}

/** Ctrl+K, or ⌘K on a Mac; nothing else held. */
export function isPaletteHotkey(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'k'
  );
}
