import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import Aura from '@primeuix/themes/aura';
import { provideTransloco } from '@jsverse/transloco';
import { providePrimeNG } from 'primeng/config';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { SessionStore } from './core/auth/session.store';
import { APP_CONFIG, AppConfig } from './core/config/app-config';
import { LanguageService } from './core/i18n/language.service';
import { DEFAULT_LANGUAGE, LANGUAGES } from './core/i18n/languages';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';
import { DARK_CLASS, ThemeService } from './core/theme/theme.service';

/** Providers of the whole panel; `config` comes from `/config.json` (see main.ts). */
export function buildAppConfig(config: AppConfig): ApplicationConfig {
  return {
    providers: [
      provideBrowserGlobalErrorListeners(),
      { provide: APP_CONFIG, useValue: config },
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
      providePrimeNG({
        license: config.primeUiLicense,
        theme: {
          preset: Aura,
          options: {
            darkModeSelector: `.${DARK_CLASS}`,
            // PrimeNG styles sit in their own layer between Tailwind's base and utilities,
            // so a Tailwind class on a PrimeNG component wins (order declared in styles.css).
            cssLayer: { name: 'primeng', order: 'theme, base, primeng' },
          },
        },
      }),
      provideTransloco({
        config: {
          availableLangs: [...LANGUAGES],
          defaultLang: DEFAULT_LANGUAGE,
          reRenderOnLangChange: true,
          prodMode: !isDevMode(),
        },
        loader: TranslocoHttpLoader,
      }),
      provideAppInitializer(() => {
        inject(ThemeService);
        inject(LanguageService).init();
      }),
      // A reload keeps the administrator signed in: the refresh cookie buys a new access
      // token before the first route renders. Never fails the start-up.
      provideAppInitializer(() => inject(SessionStore).restore()),
    ],
  };
}
