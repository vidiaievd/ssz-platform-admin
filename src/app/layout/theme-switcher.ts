import { Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { ThemeService } from '../core/theme/theme.service';

const ICONS = { light: 'pi pi-sun', dark: 'pi pi-moon', system: 'pi pi-desktop' } as const;

/** One button that cycles light → dark → system; the icon shows the current choice. */
@Component({
  selector: 'app-theme-switcher',
  imports: [ButtonDirective, TranslocoPipe],
  template: `
    <button
      pButton
      type="button"
      [text]="true"
      [rounded]="true"
      [iconOnly]="true"
      severity="secondary"
      [attr.aria-label]="'theme.' + theme.mode() | transloco"
      [title]="'theme.' + theme.mode() | transloco"
      (click)="theme.cycle()"
    >
      <i [class]="icon()" aria-hidden="true"></i>
    </button>
  `,
})
export class ThemeSwitcher {
  protected readonly theme = inject(ThemeService);
  protected readonly icon = computed(() => ICONS[this.theme.mode()]);
}
