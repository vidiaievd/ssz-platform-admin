import { USER_ROLES } from '../../core/auth/admin-users.api';

/** Translation key of a role; a role auth may add later still shows, under its own name. */
export function roleKey(role: string): string {
  return (USER_ROLES as readonly string[]).includes(role) ? `users.role.${role}` : role;
}
