import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { LOGIN_PATH } from '../../core/auth/auth.interceptor';
import { SessionStore } from '../../core/auth/session.store';
import { LanguageSwitcher } from '../../layout/language-switcher';
import { ThemeSwitcher } from '../../layout/theme-switcher';

/**
 * Temporary start page until the layout (step 4): shows who is signed in, so the sign-in of
 * step 3 can be checked, and a way out.
 */
@Component({
  selector: 'app-home',
  imports: [TranslocoPipe, RouterLink, Button, LanguageSwitcher, ThemeSwitcher],
  template: `
    <main class="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <h1 class="text-2xl font-semibold">{{ 'app.title' | transloco }}</h1>
      @if (session.claims(); as claims) {
        <p data-testid="signed-in-as">
          {{ 'home.signedInAs' | transloco: { email: claims.email, level: claims.adminLevel } }}
        </p>
        <p-button
          icon="pi pi-sign-out"
          severity="secondary"
          [outlined]="true"
          [label]="'home.signOut' | transloco"
          (onClick)="signOut()"
        />
      } @else {
        <a class="text-primary underline" [routerLink]="loginPath">{{
          'login.signIn' | transloco
        }}</a>
      }
      <p class="text-muted-color">{{ 'home.placeholder' | transloco }}</p>
      <div class="flex items-center gap-3">
        <app-language-switcher />
        <app-theme-switcher />
      </div>
    </main>
  `,
})
export class Home {
  protected readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  protected readonly loginPath = LOGIN_PATH;

  protected async signOut(): Promise<void> {
    await this.session.logout();
    await this.router.navigateByUrl(LOGIN_PATH);
  }
}
