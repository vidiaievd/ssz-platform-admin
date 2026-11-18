import { Routes } from '@angular/router';

export const USERS_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./users-list.page').then((m) => m.UsersListPage),
  },
  {
    // The card comes in step 7; until then a row opens the section's "coming soon".
    path: ':userId',
    data: { section: 'users' },
    loadComponent: () => import('../coming-soon/coming-soon.page').then((m) => m.ComingSoonPage),
  },
];
