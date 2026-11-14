import { Route, Routes } from '@angular/router';
import { AI_TABS, AiTab, DEFAULT_AI_TAB } from './ai-tabs';

/** The component of every tab of the section. */
const TAB_COMPONENTS: Record<AiTab, Route['loadComponent']> = {
  models: () => import('./models/agent-bindings.page').then((m) => m.AgentBindingsPage),
  providers: () => import('./providers/ai-providers.page').then((m) => m.AiProvidersPage),
  evals: () => import('./evals/ai-evals.page').then((m) => m.AiEvalsPage),
  spend: () => import('./spend/ai-spend.page').then((m) => m.AiSpendPage),
};

export const AI_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./ai-section.page').then((m) => m.AiSectionPage),
    children: [
      ...AI_TABS.map((tab) => ({ path: tab, data: { tab }, loadComponent: TAB_COMPONENTS[tab] })),
      // `/ai` and any unknown tab: the first tab, at its own address.
      { path: '**', redirectTo: DEFAULT_AI_TAB },
    ],
  },
];
