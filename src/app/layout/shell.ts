import { Component, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Drawer } from 'primeng/drawer';
import { LOGIN_PATH } from '../core/auth/auth.interceptor';
import { SessionStore } from '../core/auth/session.store';
import { CommandPalette } from './command-palette/command-palette';
import { LanguageSwitcher } from './language-switcher';
import { LevelBadge } from './level-badge';
import { NavMenu } from './nav-menu';
import { ThemeSwitcher } from './theme-switcher';

/**
 * The frame of every signed-in page: section menu on the left (a drawer below `lg`), header
 * with the Ctrl+K palette, who is signed in, the level, language, theme and sign-out.
 */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    TranslocoPipe,
    ButtonDirective,
    Drawer,
    CommandPalette,
    LanguageSwitcher,
    LevelBadge,
    NavMenu,
    ThemeSwitcher,
  ],
  template: `
    <div class="flex min-h-dvh">
      <aside class="border-border hidden w-60 shrink-0 flex-col border-r lg:flex">
        <div class="flex h-14 items-center px-5 font-semibold">{{ 'app.title' | transloco }}</div>
        <app-nav-menu />
      </aside>

      <p-drawer
        [(visible)]="menuOpen"
        [header]="'app.title' | transloco"
        styleClass="!w-72"
        [ariaCloseLabel]="'shell.closeMenu' | transloco"
      >
        <app-nav-menu (navigated)="menuOpen.set(false)" />
        <div class="mt-4 px-4 md:hidden">
          <app-language-switcher />
        </div>
      </p-drawer>

      <div class="flex min-w-0 flex-1 flex-col">
        <header class="border-border flex h-14 items-center gap-2 border-b px-2 sm:px-4">
          <button
            pButton
            type="button"
            class="lg:hidden"
            [text]="true"
            [rounded]="true"
            [iconOnly]="true"
            severity="secondary"
            [attr.aria-label]="'shell.openMenu' | transloco"
            data-testid="open-menu"
            (click)="menuOpen.set(true)"
          >
            <i class="pi pi-bars" aria-hidden="true"></i>
          </button>
          <span class="truncate font-semibold lg:hidden">{{ 'app.title' | transloco }}</span>
          <app-command-palette class="ml-auto lg:ml-0" />

          <div class="flex min-w-0 items-center gap-2 lg:ml-auto">
            @if (session.claims(); as claims) {
              <span
                class="text-muted-color hidden truncate text-sm sm:inline"
                data-testid="shell-email"
                >{{ claims.email }}</span
              >
              @if (claims.adminLevel; as level) {
                <app-level-badge [level]="level" />
              }
            }
            <app-language-switcher class="hidden md:block" />
            <app-theme-switcher />
            <button
              pButton
              type="button"
              [text]="true"
              [rounded]="true"
              [iconOnly]="true"
              severity="secondary"
              [attr.aria-label]="'shell.signOut' | transloco"
              [title]="'shell.signOut' | transloco"
              [disabled]="signingOut()"
              data-testid="sign-out"
              (click)="signOut()"
            >
              <i class="pi pi-sign-out" aria-hidden="true"></i>
            </button>
          </div>
        </header>

        <main class="min-w-0 flex-1 p-4 lg:p-6">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class Shell {
  protected readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  protected readonly menuOpen = signal(false);
  protected readonly signingOut = signal(false);

  protected async signOut(): Promise<void> {
    this.signingOut.set(true);
    try {
      await this.session.logout();
      await this.router.navigateByUrl(LOGIN_PATH);
    } finally {
      this.signingOut.set(false);
    }
  }
}
