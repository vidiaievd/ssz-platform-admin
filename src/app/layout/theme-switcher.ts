import { Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { ThemeService } from '../core/theme/theme.service';

const ICONS = { light: 'pi pi-sun', dark: 'pi pi-moon', system: 'pi pi-desktop' } as const;

/** One button that cycles light → dark → system; the icon shows the current choice. */
@Component({
  selector: 'app-theme-switcher',
  imports: [Button, TranslocoPipe],
  template: `
    <p-button
      [icon]="icon()"
      [text]="true"
      [rounded]="true"
      severity="secondary"
      [ariaLabel]="'theme.' + theme.mode() | transloco"
      [title]="'theme.' + theme.mode() | transloco"
      (onClick)="theme.cycle()"
    />
  `,
})
export class ThemeSwitcher {
  protected readonly theme = inject(ThemeService);
  protected readonly icon = computed(() => ICONS[this.theme.mode()]);
}
