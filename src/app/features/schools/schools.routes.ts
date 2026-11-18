import { Route, Routes } from '@angular/router';
import { SCHOOL_TABS, SchoolTab, schoolTabPath } from './card/school-tabs';

/** The component of every tab of the card. */
const TAB_COMPONENTS: Record<SchoolTab, Route['loadComponent']> = {
  overview: () => import('./card/school-overview.tab').then((m) => m.SchoolOverviewTab),
  members: () => import('./card/school-members.tab').then((m) => m.SchoolMembersTab),
  plan: () => import('./card/plan/school-plan.tab').then((m) => m.SchoolPlanTab),
  ai: () => import('./card/ai/school-ai.tab').then((m) => m.SchoolAiTab),
  journal: () => import('./card/journal/school-journal.tab').then((m) => m.SchoolJournalTab),
  danger: () => import('./card/danger/school-danger.tab').then((m) => m.SchoolDangerTab),
};

/** One tab of the card. */
function tabRoute(tab: SchoolTab): Route {
  return {
    path: schoolTabPath(tab),
    pathMatch: 'full',
    data: { tab },
    loadComponent: TAB_COMPONENTS[tab],
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
