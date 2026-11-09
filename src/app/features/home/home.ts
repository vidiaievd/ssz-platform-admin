import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageSwitcher } from '../../layout/language-switcher';
import { ThemeSwitcher } from '../../layout/theme-switcher';

/** Temporary start page until the layout (step 4) and sign-in (step 3) exist. */
@Component({
  selector: 'app-home',
  imports: [TranslocoPipe, LanguageSwitcher, ThemeSwitcher],
  template: `
    <main class="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <h1 class="text-2xl font-semibold">{{ 'app.title' | transloco }}</h1>
      <p class="text-muted-color">{{ 'home.placeholder' | transloco }}</p>
      <div class="flex items-center gap-3">
        <app-language-switcher />
        <app-theme-switcher />
      </div>
    </main>
  `,
})
export class Home {}
