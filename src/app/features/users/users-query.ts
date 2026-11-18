import { ParamMap, Params } from '@angular/router';
import {
  AdminUserListParams,
  USER_ROLES,
  USER_STATUSES,
  UserRole,
  UserSort,
  UserStatus,
} from '../../core/auth/admin-users.api';

/**
 * Sorts the list offers. `purgeAt` (soonest erasure first) is the deletion queue's own order;
 * `-lastLoginAt` goes one way only (never signed in last).
 */
export const USER_SORT_OPTIONS = [
  '-createdAt',
  'createdAt',
  'email',
  '-email',
  '-lastLoginAt',
  'purgeAt',
] as const satisfies readonly UserSort[];
export type UsersSort = (typeof USER_SORT_OPTIONS)[number];
export type UserSortableColumn = 'email' | 'createdAt' | 'lastLoginAt' | 'purgeAt';

/** Server accepts 1–100; the panel offers these. */
export const USER_PAGE_SIZES = [10, 25, 50, 100] as const;
/** The server refuses a shorter search (400 `INVALID_FILTER`); it is kept in the box, not sent. */
export const USER_SEARCH_MIN = 2;
/** An e-mail is at most 254 characters. */
export const USER_SEARCH_MAX = 254;

/** The users list screen as it is written in the URL (plan 90, phase 6, step 6). */
export interface UsersQuery {
  readonly search: string;
  /** null = every role. */
  readonly role: UserRole | null;
  /** null = every account. */
  readonly status: UserStatus | null;
  readonly sort: UsersSort;
  /** 1-based. */
  readonly page: number;
  readonly size: number;
}

export const DEFAULT_USERS_QUERY: UsersQuery = {
  search: '',
  role: null,
  status: null,
  sort: '-createdAt',
  page: 1,
  size: 25,
};

/** "Deletion requests": pending requests, the soonest erasure first. */
export const DELETION_QUEUE_QUERY: UsersQuery = {
  ...DEFAULT_USERS_QUERY,
  status: 'deletion_pending',
  sort: 'purgeAt',
};

/** URL → query; anything unknown or malformed falls back to the default. */
export function parseUsersQuery(params: ParamMap): UsersQuery {
  const d = DEFAULT_USERS_QUERY;
  const size = positiveInt(params.get('size'));
  return {
    search: (params.get('q') ?? '').trim().slice(0, USER_SEARCH_MAX),
    role: oneOf(params.get('role'), USER_ROLES) ?? d.role,
    status: oneOf(params.get('status'), USER_STATUSES) ?? d.status,
    sort: oneOf(params.get('sort'), USER_SORT_OPTIONS) ?? d.sort,
    page: positiveInt(params.get('page')) ?? d.page,
    size: size !== null && (USER_PAGE_SIZES as readonly number[]).includes(size) ? size : d.size,
  };
}

/** Query → URL. Defaults are left out (null removes the key), so the bare `/users` is the default. */
export function toUsersQueryParams(query: UsersQuery): Params {
  const d = DEFAULT_USERS_QUERY;
  const unlessDefault = <T>(value: T, fallback: T) => (value === fallback ? null : value);
  return {
    q: query.search || null,
    role: query.role,
    status: query.status,
    sort: unlessDefault(query.sort, d.sort),
    page: unlessDefault(query.page, d.page),
    size: unlessDefault(query.size, d.size),
  };
}

/** True when the search is too short to be sent: the list then ignores it. */
export function searchTooShort(query: UsersQuery): boolean {
  return query.search.length > 0 && query.search.length < USER_SEARCH_MIN;
}

/** Query → parameters of `GET auth/admin/users`; a too-short search is left out. */
export function toUserListParams(query: UsersQuery): AdminUserListParams {
  return {
    ...(query.search.length >= USER_SEARCH_MIN ? { search: query.search } : {}),
    ...(query.role ? { role: query.role } : {}),
    ...(query.status ? { status: query.status } : {}),
    sort: query.sort,
    page: query.page,
    limit: query.size,
  };
}

/** True when anything but paging and sorting narrows the list. */
export function hasUserFilters(query: UsersQuery): boolean {
  return query.search !== '' || query.role !== null || query.status !== null;
}

/** True when the screen is the deletion queue (its preset, whatever the page). */
export function isDeletionQueue(query: UsersQuery): boolean {
  return query.status === 'deletion_pending' && query.sort === 'purgeAt';
}

/** A filter change starts again from page 1; paging alone keeps the filters. */
export function withUserFilter(query: UsersQuery, change: Partial<UsersQuery>): UsersQuery {
  const next = { ...query, ...change, page: 1 };
  // The erasure order means nothing outside pending requests: back to the default order.
  if (next.sort === 'purgeAt' && next.status !== 'deletion_pending') {
    return { ...next, sort: DEFAULT_USERS_QUERY.sort };
  }
  return next;
}

/**
 * Clicking a column header: e-mails A→Z, then Z→A; creation newest first, then oldest; the last
 * sign-in and the erasure date have one direction only.
 */
export function nextUserSort(current: UsersSort, column: UserSortableColumn): UsersSort {
  switch (column) {
    case 'email':
      return current === 'email' ? '-email' : 'email';
    case 'createdAt':
      return current === '-createdAt' ? 'createdAt' : '-createdAt';
    case 'lastLoginAt':
      return '-lastLoginAt';
    case 'purgeAt':
      return 'purgeAt';
  }
}

/** `aria-sort` of a column header. */
export function userAriaSort(
  current: UsersSort,
  column: UserSortableColumn,
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
