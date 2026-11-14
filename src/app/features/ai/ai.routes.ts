import { Route, Routes } from '@angular/router';
import { AI_TABS, AiTab, DEFAULT_AI_TAB } from './ai-tabs';

/** The component of every tab of the section. */
const TAB_COMPONENTS: Record<AiTab, Route['loadComponent']> = {
  models: () => import('./models/agent-bindings.page').then((m) => m.AgentBindingsPage),
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
