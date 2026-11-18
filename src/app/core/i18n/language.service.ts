import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { safeStorage } from '../storage';
import { DEFAULT_LANGUAGE, Language, isLanguage } from './languages';

const STORAGE_KEY = 'ssz-admin.lang';

/** The admin's language: remembered per browser, switched without a reload. */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);

  readonly current = signal<Language>(readStoredLanguage());

  /** Called once at start-up, so the first screen already renders in the stored language. */
  init(): void {
    this.apply(this.current());
  }

  set(lang: Language): void {
    this.current.set(lang);
    safeStorage.set(STORAGE_KEY, lang);
    this.apply(lang);
  }

  private apply(lang: Language): void {
    this.transloco.setActiveLang(lang);
    this.document.documentElement.lang = lang;
  }
}

function readStoredLanguage(): Language {
  const stored = safeStorage.get(STORAGE_KEY);
  return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
}
