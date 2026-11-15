import { Routes } from '@angular/router';

export const PLANS_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./plans-list.page').then((m) => m.PlansListPage),
  },
  {
    path: ':code',
    loadComponent: () => import('./plan-card.page').then((m) => m.PlanCardPage),
  },
];
