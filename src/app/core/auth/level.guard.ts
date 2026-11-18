import { inject } from '@angular/core';
import { CanMatchFn } from '@angular/router';
import { isAdminLevel } from './admin-level';
import { SessionStore } from './session.store';

/** Route data key read by `levelGuard`. */
export const MIN_LEVEL = 'minLevel';

/**
 * `canMatch` by admin level: `data: { minLevel: 'admin' }` matches only for that level and
 * above. A route the level cannot use does not match at all, so the router falls through to
 * the not-found page — the panel does not tell a lower level what exists above it (§2). A
 * route without `minLevel` is open to every level; a misspelt level matches nobody.
 */
export const levelGuard: CanMatchFn = (route) => {
  const required: unknown = route.data?.[MIN_LEVEL];
  if (required === undefined) return true;
  if (!isAdminLevel(required)) return false;
  return inject(SessionStore).hasLevel(required);
};
