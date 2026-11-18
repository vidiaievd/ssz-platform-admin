import { Route, Routes } from '@angular/router';
import { USER_TABS, UserTab, userTabPath } from './card/user-tabs';

/** The component of every tab of the card; plan, AI and journal are the school card's own. */
const TAB_COMPONENTS: Record<UserTab, Route['loadComponent']> = {
  overview: () => import('./card/user-overview.tab').then((m) => m.UserOverviewTab),
  schools: () => import('./card/user-schools.tab').then((m) => m.UserSchoolsTab),
  plan: () => import('../schools/card/plan/school-plan.tab').then((m) => m.SchoolPlanTab),
  ai: () => import('../schools/card/ai/school-ai.tab').then((m) => m.SchoolAiTab),
  journal: () =>
    import('../schools/card/journal/school-journal.tab').then((m) => m.SchoolJournalTab),
};

function tabRoute(tab: UserTab): Route {
  return {
    path: userTabPath(tab),
    pathMatch: 'full',
    data: { tab },
    loadComponent: TAB_COMPONENTS[tab],
  };
}

export const USERS_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./users-list.page').then((m) => m.UsersListPage),
  },
  {
    // The card stays mounted while its tabs change: the account is read once per card.
    path: ':userId',
    loadComponent: () => import('./card/user-card.page').then((m) => m.UserCardPage),
    children: [
      ...USER_TABS.map(tabRoute),
      // `/users/:id/overview` and any unknown tab: the overview, at its own address.
      { path: '**', redirectTo: '' },
    ],
  },
];
