import { LoadChildren, Route, Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { MIN_LEVEL, levelGuard } from './core/auth/level.guard';
import { signedOutGuard } from './core/auth/signed-out.guard';
import { NAV_SECTIONS, NavSection, NavSectionId } from './layout/nav-sections';

/** Sections that are built: their own lazy routes. Every other one is "coming soon". */
const SECTION_ROUTES: Partial<Record<NavSectionId, LoadChildren>> = {
  schools: () => import('./features/schools/schools.routes').then((m) => m.SCHOOLS_ROUTES),
};

/** A menu section: its feature routes, or the same lazy "coming soon" page for each. */
function sectionRoute(section: NavSection): Route {
  const base: Route = {
    path: section.path,
    pathMatch: section.path === '' ? 'full' : 'prefix',
    canMatch: [levelGuard],
    data: { section: section.id, [MIN_LEVEL]: section.minLevel },
  };
  const children = SECTION_ROUTES[section.id];
  return children
    ? { ...base, loadChildren: children }
    : {
        ...base,
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
      ...NAV_SECTIONS.map(sectionRoute),
      {
        path: '**',
        loadComponent: () =>
          import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
      },
    ],
  },
];
