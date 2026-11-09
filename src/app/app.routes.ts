import { Routes } from '@angular/router';
import { signedOutGuard } from './core/auth/signed-out.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  {
    path: 'login',
    canActivate: [signedOutGuard],
    loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage),
  },
  { path: '**', redirectTo: '' },
];
