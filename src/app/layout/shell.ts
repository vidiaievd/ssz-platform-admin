import { Component, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { Drawer } from 'primeng/drawer';
import { LOGIN_PATH } from '../core/auth/auth.interceptor';
import { SessionStore } from '../core/auth/session.store';
import { LanguageSwitcher } from './language-switcher';
import { LevelBadge } from './level-badge';
import { NavMenu } from './nav-menu';
import { ThemeSwitcher } from './theme-switcher';

/**
 * The frame of every signed-in page: section menu on the left (a drawer below `lg`), header
 * with who is signed in, the level, language, theme and sign-out.
 */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    TranslocoPipe,
    Button,
    Drawer,
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
          <p-button
            class="lg:hidden"
            icon="pi pi-bars"
            [text]="true"
            [rounded]="true"
            severity="secondary"
            [ariaLabel]="'shell.openMenu' | transloco"
            data-testid="open-menu"
            (onClick)="menuOpen.set(true)"
          />
          <span class="truncate font-semibold lg:hidden">{{ 'app.title' | transloco }}</span>

          <div class="ml-auto flex min-w-0 items-center gap-2">
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
            <p-button
              icon="pi pi-sign-out"
              [text]="true"
              [rounded]="true"
              severity="secondary"
              [ariaLabel]="'shell.signOut' | transloco"
              [title]="'shell.signOut' | transloco"
              [disabled]="signingOut()"
              data-testid="sign-out"
              (onClick)="signOut()"
            />
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
