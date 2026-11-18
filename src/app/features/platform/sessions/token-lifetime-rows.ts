import {
  CLIENT_TYPES,
  ClientType,
  TokenLifetime,
  TokenLifetimes,
} from '../../../core/auth/token-lifetimes.api';

/**
 * Roles in the order of privilege, the most privileged first: a user's lifetime is the shortest
 * among their roles, so the table reads top-down from the strictest. A role auth knows that is not
 * listed here (one created after the seed) follows, by name.
 */
export const ROLE_ORDER: readonly string[] = [
  'platform_admin',
  'manager_platform',
  'school_admin',
  'teacher',
  'tutor',
  'student',
];

/** The admin client signs in only `platform_admin` (`AdminSessionGate`). */
export const ADMIN_CLIENT_ROLE = 'platform_admin';

/**
 * One cell of the table:
 * - `set` — the pair has its own lifetime;
 * - `fallback` — no row: the user gets the fallback lifetime (unless another of their roles is
 *   shorter); a change creates the row;
 * - `unused` — the admin client of a role that can never sign into the panel.
 */
export type LifetimeCell =
  | { readonly kind: 'set'; readonly hours: number; readonly policy: TokenLifetime }
  | { readonly kind: 'fallback'; readonly hours: number }
  | { readonly kind: 'unused' };

export interface LifetimeRow {
  readonly role: string;
  readonly cells: Readonly<Record<ClientType, LifetimeCell>>;
}

/** The table: a row per role that has any lifetime, plus the roles of `ROLE_ORDER`. */
export function lifetimeRows(data: TokenLifetimes): LifetimeRow[] {
  const roles = new Set<string>(ROLE_ORDER);
  for (const p of data.policies) roles.add(p.role);
  return [...roles].sort(byRoleOrder).map((role) => ({
    role,
    cells: Object.fromEntries(
      CLIENT_TYPES.map((client) => [client, cellOf(data, role, client)]),
    ) as Record<ClientType, LifetimeCell>,
  }));
}

function cellOf(data: TokenLifetimes, role: string, client: ClientType): LifetimeCell {
  const policy = data.policies.find((p) => p.role === role && p.clientType === client);
  if (policy) return { kind: 'set', hours: policy.refreshLifetimeHours, policy };
  if (client === 'admin' && role !== ADMIN_CLIENT_ROLE) return { kind: 'unused' };
  return { kind: 'fallback', hours: data.fallbackHours };
}

function byRoleOrder(a: string, b: string): number {
  const ia = ROLE_ORDER.indexOf(a);
  const ib = ROLE_ORDER.indexOf(b);
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  return a.localeCompare(b);
}

/** Hours as whole days and the rest: 168 → 7 d, 36 → 1 d 12 h, 12 → 0 d 12 h. */
export interface DurationParts {
  readonly days: number;
  readonly hours: number;
}

export function durationParts(totalHours: number): DurationParts {
  return { days: Math.floor(totalHours / 24), hours: totalHours % 24 };
}

/** The unit an administrator types the lifetime in. */
export type LifetimeUnit = 'hours' | 'days';

/** The unit a lifetime is shown in by default in the dialog: days when it is whole days. */
export function naturalUnit(hours: number): LifetimeUnit {
  return hours >= 24 && hours % 24 === 0 ? 'days' : 'hours';
}

export type LifetimeInputError = 'required' | 'wholeNumber' | 'outOfBounds';

/**
 * What the typed value means in hours, or why it is refused. The bounds are the server's
 * (`minHours` / `maxHours` of the read); auth checks them once more.
 */
export function parseLifetime(
  raw: string,
  unit: LifetimeUnit,
  bounds: { readonly minHours: number; readonly maxHours: number },
): { readonly hours: number } | { readonly error: LifetimeInputError } {
  const text = raw.trim();
  if (text === '') return { error: 'required' };
  if (!/^\d+$/.test(text)) return { error: 'wholeNumber' };
  const hours = Number(text) * (unit === 'days' ? 24 : 1);
  if (hours < bounds.minHours || hours > bounds.maxHours) return { error: 'outOfBounds' };
  return { hours };
}
