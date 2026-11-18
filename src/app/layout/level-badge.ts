import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Tag } from 'primeng/tag';
import { AdminLevel } from '../core/auth/admin-level';

const SEVERITY = { super: 'danger', admin: 'warn', support: 'info' } as const;

/** The signed-in administrator's level, so it is always clear what the panel lets one do. */
@Component({
  selector: 'app-level-badge',
  imports: [Tag, TranslocoPipe],
  template: `
    <p-tag
      [value]="'level.' + level() | transloco"
      [severity]="severity()"
      [title]="'level.hint' | transloco"
      data-testid="level-badge"
    />
  `,
})
export class LevelBadge {
  readonly level = input.required<AdminLevel>();
  protected readonly severity = computed(() => SEVERITY[this.level()]);
}
