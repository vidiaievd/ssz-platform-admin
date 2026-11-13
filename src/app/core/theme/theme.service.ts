import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { safeStorage } from '../storage';

export type ThemeMode = 'light' | 'dark' | 'system';

/** Class that switches both PrimeNG (`darkModeSelector`) and Tailwind (`dark:` variant). */
export const DARK_CLASS = 'app-dark';
const STORAGE_KEY = 'ssz-admin.theme';
const MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.media?.matches ?? false);

  /** What the admin chose; `system` follows the OS. */
  readonly mode = signal<ThemeMode>(readStoredMode());
  /** What is actually on screen. */
  readonly isDark = computed(() =>
    this.mode() === 'system' ? this.systemDark() : this.mode() === 'dark',
  );

  constructor() {
    this.media?.addEventListener('change', (event) => {
      this.systemDark.set(event.matches);
      this.apply();
    });
    this.apply();
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    safeStorage.set(STORAGE_KEY, mode);
    this.apply();
  }

  /** Light → dark → system → light. */
  cycle(): void {
    const next = MODES[(MODES.indexOf(this.mode()) + 1) % MODES.length];
    this.setMode(next);
  }

  private apply(): void {
    this.document.documentElement.classList.toggle(DARK_CLASS, this.isDark());
  }
}

function readStoredMode(): ThemeMode {
  const stored = safeStorage.get(STORAGE_KEY);
  return MODES.includes(stored as ThemeMode) ? (stored as ThemeMode) : 'system';
}
