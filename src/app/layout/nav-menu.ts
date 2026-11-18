import { Component, computed, inject, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SessionStore } from '../core/auth/session.store';
import { NAV_SECTIONS } from './nav-sections';

/** The section list; the same component sits in the sidebar and in the mobile drawer. */
@Component({
  selector: 'app-nav-menu',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe],
  template: `
    <nav [attr.aria-label]="'nav.label' | transloco">
      <ul class="flex flex-col gap-1 p-2">
        @for (section of sections(); track section.id) {
          <li>
            <a
              class="hover:bg-emphasis flex items-center gap-3 rounded-md px-3 py-2 text-sm"
              [routerLink]="'/' + section.path"
              routerLinkActive="bg-emphasis text-primary font-medium"
              [routerLinkActiveOptions]="{ exact: section.path === '' }"
              ariaCurrentWhenActive="page"
              [attr.data-testid]="'nav-' + section.id"
              (click)="navigated.emit()"
            >
              <i [class]="section.icon" aria-hidden="true"></i>
              <span>{{ 'nav.' + section.id | transloco }}</span>
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
})
export class NavMenu {
  private readonly session = inject(SessionStore);

  /** A link was followed — the drawer closes on it. */
  readonly navigated = output();

  protected readonly sections = computed(() =>
    NAV_SECTIONS.filter((s) => !s.minLevel || this.session.hasLevel(s.minLevel)),
  );
}
