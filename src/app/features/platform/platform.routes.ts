import { Route, Routes } from '@angular/router';
import { DEFAULT_PLATFORM_TAB, PLATFORM_TABS, PlatformTab } from './platform-tabs';

/** The component of every tab of the section. */
const TAB_COMPONENTS: Record<PlatformTab, Route['loadComponent']> = {
  sessions: () => import('./sessions/token-lifetimes.page').then((m) => m.TokenLifetimesPage),
  media: () => import('./media/media-sweeps.page').then((m) => m.MediaSweepsPage),
};

export const PLATFORM_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./platform-section.page').then((m) => m.PlatformSectionPage),
    children: [
      ...PLATFORM_TABS.map((tab) => ({
        path: tab,
        data: { tab },
        loadComponent: TAB_COMPONENTS[tab],
      })),
      // `/platform` and any unknown tab: the first tab, at its own address.
      { path: '**', redirectTo: DEFAULT_PLATFORM_TAB },
    ],
  },
];
