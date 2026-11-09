import { Route, Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { MIN_LEVEL, levelGuard } from './core/auth/level.guard';
import { signedOutGuard } from './core/auth/signed-out.guard';
import { NAV_SECTIONS, NavSection } from './layout/nav-sections';

/** A menu section that is not built yet: the same lazy "coming soon" page for each. */
function comingSoon(section: NavSection): Route {
  return {
    path: section.path,
    pathMatch: section.path === '' ? 'full' : 'prefix',
    canMatch: [levelGuard],
    data: { section: section.id, [MIN_LEVEL]: section.minLevel },
    loadComponent: () =>
      import('./features/coming-soon/coming-soon.page').then((m) => m.ComingSoonPage),
  };
}

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [signedOutGuard],
    loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage),
  },
  {
    // Everything else is the signed-in panel inside the layout.
    path: '',
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      ...NAV_SECTIONS.map(comingSoon),
      {
        path: '**',
        loadComponent: () =>
          import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
      },
    ],
  },
];
