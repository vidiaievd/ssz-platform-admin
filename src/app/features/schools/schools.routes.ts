import { Routes } from '@angular/router';

export const SCHOOLS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./schools-list.page').then((m) => m.SchoolsListPage),
  },
  {
    path: ':schoolId',
    loadComponent: () => import('./school-card.page').then((m) => m.SchoolCardPage),
  },
];
