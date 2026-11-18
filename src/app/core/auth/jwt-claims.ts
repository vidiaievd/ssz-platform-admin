import { AdminLevel, isAdminLevel } from './admin-level';

/** What the panel reads from an admin access token. The signature is the gateway's business. */
export interface AccessClaims {
  /** User id (`sub`). */
  readonly userId: string;
  readonly email: string;
  /** `role` is a string for one role and an array for several; always an array here. */
  readonly roles: readonly string[];
  /** `admin_level`; only tokens of the admin client carry it. */
  readonly adminLevel: AdminLevel | null;
  /** `exp` as a Date. */
  readonly expiresAt: Date;
}

/**
 * Decodes the payload of a JWT without verifying it (no package needed: base64url + JSON).
 * Returns null for anything that is not a token with `sub`, `email` and `exp`.
 */
export function decodeAccessClaims(token: string): AccessClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;

  const raw = payload as Record<string, unknown>;
  const { sub, email, exp } = raw;
  if (typeof sub !== 'string' || typeof email !== 'string' || typeof exp !== 'number') {
    return null;
  }

  const rawRoles = raw['role'] ?? raw['roles'] ?? [];
  const roles = (Array.isArray(rawRoles) ? rawRoles : [rawRoles]).filter(
    (r): r is string => typeof r === 'string',
  );
  const level = raw['admin_level'];

  return {
    userId: sub,
    email,
    roles,
    adminLevel: isAdminLevel(level) ? level : null,
    expiresAt: new Date(exp * 1000),
  };
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  // UTF-8, so a non-ASCII email survives.
  return new TextDecoder().decode(bytes);
}
