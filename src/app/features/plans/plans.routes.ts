import { Routes } from '@angular/router';
import { MIN_LEVEL, levelGuard } from '../../core/auth/level.guard';

export const PLANS_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./plans-list.page').then((m) => m.PlansListPage),
  },
  // Writing plans is `super`'s; for a lower level these paths do not exist.
  {
    path: 'new',
    canMatch: [levelGuard],
    data: { [MIN_LEVEL]: 'super' },
    loadComponent: () => import('./plan-new.page').then((m) => m.PlanNewPage),
  },
  {
    path: ':code/new-version',
    canMatch: [levelGuard],
    data: { [MIN_LEVEL]: 'super' },
    loadComponent: () => import('./plan-version.page').then((m) => m.PlanVersionPage),
  },
  {
    path: ':code',
    loadComponent: () => import('./plan-card.page').then((m) => m.PlanCardPage),
  },
];
