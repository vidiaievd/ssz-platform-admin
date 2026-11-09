import { Route, Routes } from '@angular/router';
import { SCHOOL_TABS, SchoolTab, schoolTabPath } from './card/school-tabs';

/** One tab of the card; each is a placeholder until its step of phase 3 (§6.3, steps 7–11). */
function tabRoute(tab: SchoolTab): Route {
  return {
    path: schoolTabPath(tab),
    pathMatch: 'full',
    data: { tab },
    loadComponent: () =>
      import('./card/school-tab-placeholder').then((m) => m.SchoolTabPlaceholder),
  };
}

export const SCHOOLS_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./schools-list.page').then((m) => m.SchoolsListPage),
  },
  {
    // The card stays mounted while its tabs change: the school is read once per card.
    path: ':schoolId',
    loadComponent: () => import('./card/school-card.page').then((m) => m.SchoolCardPage),
    children: [
      ...SCHOOL_TABS.map(tabRoute),
      // `/schools/:id/overview` and any unknown tab: the overview, at its own address.
      { path: '**', redirectTo: '' },
    ],
  },
];
