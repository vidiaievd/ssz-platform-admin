import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PLATFORM_TABS } from './platform-tabs';

/** `/platform/:tab` — the "Platform" section: a title, its tabs as links, the tab below. */
@Component({
  selector: 'app-platform-section-page',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  template: `
    <div class="flex flex-col gap-4">
      <h1 class="text-2xl font-semibold" data-testid="page-title">
        {{ 'nav.platform' | transloco }}
      </h1>

      <nav
        class="border-border flex gap-1 overflow-x-auto border-b"
        [attr.aria-label]="'platform.tabsLabel' | transloco"
        data-testid="platform-tabs"
      >
        @for (tab of tabs; track tab) {
          <a
            class="text-muted-color hover:text-fg -mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap"
            routerLinkActive="!border-primary !text-fg"
            ariaCurrentWhenActive="page"
            [routerLink]="['/platform', tab]"
            [attr.data-testid]="'platform-tab-' + tab"
          >
            {{ 'platform.tabs.' + tab | transloco }}
          </a>
        }
      </nav>

      <router-outlet />
    </div>
  `,
})
export class PlatformSectionPage {
  protected readonly tabs = PLATFORM_TABS;
}
