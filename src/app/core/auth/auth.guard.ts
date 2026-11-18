import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { LOGIN_PATH } from './auth.interceptor';
import { SessionStore } from './session.store';

/**
 * The panel behind sign-in. Used as both `canActivate` and `canActivateChild` on the layout
 * route, so a session that ended between navigations is caught on the next one. The session is
 * restored from the refresh cookie before the first navigation (app initializer), so a reload
 * does not land here signed out. Where the administrator was heading goes along as `returnUrl`.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  if (inject(SessionStore).isAuthenticated()) return true;
  const queryParams = state.url && state.url !== '/' ? { returnUrl: state.url } : {};
  return inject(Router).createUrlTree([LOGIN_PATH], { queryParams });
};
