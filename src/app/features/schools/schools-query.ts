import { ParamMap, Params } from '@angular/router';
import { AdminSchoolsList$Params } from '../../api/organization/fn/admin-schools/admin-schools-list';

export type SchoolKind = 'SCHOOL' | 'SOLO';
export type SchoolStatus = 'active' | 'inactive' | 'deleted';
export type SchoolSort = 'createdAt' | '-createdAt' | 'name' | '-name';
export type SortableColumn = 'name' | 'createdAt';

export const SCHOOL_KINDS: readonly SchoolKind[] = ['SCHOOL', 'SOLO'];
export const SCHOOL_STATUSES: readonly SchoolStatus[] = ['active', 'inactive', 'deleted'];
const SORTS: readonly SchoolSort[] = ['createdAt', '-createdAt', 'name', '-name'];
/** Server accepts 1–100; the panel offers these. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;
const SEARCH_MAX = 100;

/** The schools list screen as it is written in the URL (plan 90, phase 2, step 6). */
export interface SchoolsQuery {
  readonly search: string;
  /** null = every kind. */
  readonly kind: SchoolKind | null;
  /** null = every status, deleted schools included (the server's default). */
  readonly status: SchoolStatus | null;
  readonly sort: SchoolSort;
  /** 1-based. */
  readonly page: number;
  readonly size: number;
}

export const DEFAULT_SCHOOLS_QUERY: SchoolsQuery = {
  search: '',
  kind: null,
  status: null,
  sort: '-createdAt',
  page: 1,
  size: 25,
};

/**
 * URL → query. Short keys (`q`, `size`) keep shared links readable; anything unknown or
 * malformed falls back to the default instead of failing — a hand-edited link still opens.
 */
export function parseSchoolsQuery(params: ParamMap): SchoolsQuery {
  const d = DEFAULT_SCHOOLS_QUERY;
  const size = positiveInt(params.get('size'));
  return {
    search: (params.get('q') ?? '').trim().slice(0, SEARCH_MAX),
    kind: oneOf(params.get('kind'), SCHOOL_KINDS) ?? d.kind,
    status: oneOf(params.get('status'), SCHOOL_STATUSES) ?? d.status,
    sort: oneOf(params.get('sort'), SORTS) ?? d.sort,
    page: positiveInt(params.get('page')) ?? d.page,
    size: size !== null && (PAGE_SIZES as readonly number[]).includes(size) ? size : d.size,
  };
}

/** Query → URL. Defaults are left out (null removes the key), so the bare `/schools` is the default. */
export function toSchoolsQueryParams(query: SchoolsQuery): Params {
  const d = DEFAULT_SCHOOLS_QUERY;
  const unlessDefault = <T>(value: T, fallback: T) => (value === fallback ? null : value);
  return {
    q: query.search || null,
    kind: query.kind,
    status: query.status,
    sort: unlessDefault(query.sort, d.sort),
    page: unlessDefault(query.page, d.page),
    size: unlessDefault(query.size, d.size),
  };
}

/** Query → parameters of `GET admin/schools`. */
export function toListParams(query: SchoolsQuery): AdminSchoolsList$Params {
  return {
    ...(query.search ? { search: query.search } : {}),
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.status ? { status: query.status } : {}),
    sort: query.sort,
    page: query.page,
    limit: query.size,
  };
}

/** True when anything but paging and sorting narrows the list. */
export function hasFilters(query: SchoolsQuery): boolean {
  return query.search !== '' || query.kind !== null || query.status !== null;
}

/** A filter change starts again from page 1; paging alone keeps the filters. */
export function withFilter(query: SchoolsQuery, change: Partial<SchoolsQuery>): SchoolsQuery {
  return { ...query, ...change, page: 1 };
}

/** Clicking a column header: names start A→Z, dates newest first; a second click flips. */
export function nextSort(current: SchoolSort, column: SortableColumn): SchoolSort {
  if (column === 'name') return current === 'name' ? '-name' : 'name';
  return current === '-createdAt' ? 'createdAt' : '-createdAt';
}

/** `aria-sort` of a column header. */
export function ariaSort(
  current: SchoolSort,
  column: SortableColumn,
): 'ascending' | 'descending' | 'none' {
  if (current === column) return 'ascending';
  if (current === `-${column}`) return 'descending';
  return 'none';
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

function positiveInt(value: string | null): number | null {
  if (value === null || !/^\d{1,6}$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 ? n : null;
}
