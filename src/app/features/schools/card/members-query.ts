import { ParamMap, Params } from '@angular/router';
import { AdminSchoolsMembers$Params } from '../../../api/organization/fn/admin-schools/admin-schools-members';

export type MemberRole = 'student' | 'teacher' | 'staff';
export type MemberStatus = 'active' | 'archived';

export const MEMBER_ROLES: readonly MemberRole[] = ['student', 'teacher', 'staff'];
export const MEMBER_STATUSES: readonly MemberStatus[] = ['active', 'archived'];
/** Server accepts 1–200; the panel offers these. */
export const MEMBER_PAGE_SIZES = [25, 50, 100] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The "Members" tab as it is written in the URL (plan 90, phase 3, step 8). */
export interface MembersQuery {
  /** null = every role. */
  readonly role: MemberRole | null;
  /** null = on the roster and archived alike (the server's default). */
  readonly status: MemberStatus | null;
  /** In this group today; null = any. */
  readonly group: string | null;
  /** 1-based. */
  readonly page: number;
  readonly size: number;
}

export const DEFAULT_MEMBERS_QUERY: MembersQuery = {
  role: null,
  status: null,
  group: null,
  page: 1,
  size: 50,
};

/** URL → query; anything unknown or malformed falls back to the default, like the schools list. */
export function parseMembersQuery(params: ParamMap): MembersQuery {
  const d = DEFAULT_MEMBERS_QUERY;
  const size = positiveInt(params.get('size'));
  const group = params.get('group');
  return {
    role: oneOf(params.get('role'), MEMBER_ROLES) ?? d.role,
    status: oneOf(params.get('status'), MEMBER_STATUSES) ?? d.status,
    // The server answers 400 to a non-UUID group: drop it here instead.
    group: group && UUID.test(group) ? group.toLowerCase() : d.group,
    page: positiveInt(params.get('page')) ?? d.page,
    size: size !== null && (MEMBER_PAGE_SIZES as readonly number[]).includes(size) ? size : d.size,
  };
}

/** Query → URL; defaults are left out, so the bare `/schools/:id/members` is the default. */
export function toMembersQueryParams(query: Partial<MembersQuery>): Params {
  const q = { ...DEFAULT_MEMBERS_QUERY, ...query };
  const d = DEFAULT_MEMBERS_QUERY;
  return {
    role: q.role,
    status: q.status,
    group: q.group,
    page: q.page === d.page ? null : q.page,
    size: q.size === d.size ? null : q.size,
  };
}

/** Query → parameters of `GET admin/schools/:id/members`. */
export function toMembersParams(schoolId: string, query: MembersQuery): AdminSchoolsMembers$Params {
  return {
    schoolId,
    ...(query.role ? { role: query.role } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.group ? { groupId: query.group } : {}),
    page: query.page,
    limit: query.size,
  };
}

export function hasMemberFilters(query: MembersQuery): boolean {
  return query.role !== null || query.status !== null || query.group !== null;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

function positiveInt(value: string | null): number | null {
  if (value === null || !/^\d{1,6}$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 ? n : null;
}
