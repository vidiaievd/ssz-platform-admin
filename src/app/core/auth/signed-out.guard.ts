import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { safeReturnUrl } from './return-url';
import { SessionStore } from './session.store';

/** For the sign-in screen: an administrator who is already signed in goes where they were heading. */
export const signedOutGuard: CanActivateFn = (route) => {
  if (!inject(SessionStore).isAuthenticated()) return true;
  return inject(Router).parseUrl(safeReturnUrl(route.queryParamMap.get('returnUrl')));
};
