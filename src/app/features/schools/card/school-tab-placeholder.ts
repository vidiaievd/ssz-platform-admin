import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { SchoolTab } from './school-tabs';

/** A tab of the card that later steps of phase 3 fill (§6.3, steps 7–11). */
@Component({
  selector: 'app-school-tab-placeholder',
  imports: [TranslocoPipe],
  template: `
    <p
      class="border-border text-muted-color flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm"
      data-testid="tab-placeholder"
      [attr.data-tab]="tab()"
    >
      <i class="pi pi-wrench" aria-hidden="true"></i>
      {{ 'schools.card.tabSoon' | transloco }}
    </p>
  `,
})
export class SchoolTabPlaceholder {
  /** From the route's data. */
  readonly tab = input.required<SchoolTab>();
}
