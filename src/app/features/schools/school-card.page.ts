import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** `/schools/:schoolId` — a placeholder until the school card of phase 3. */
@Component({
  selector: 'app-school-card-page',
  imports: [RouterLink, TranslocoPipe],
  template: `
    <section class="flex max-w-2xl flex-col gap-3">
      <a class="text-primary flex items-center gap-1 text-sm" routerLink="/schools">
        <i class="pi pi-arrow-left" aria-hidden="true"></i>
        {{ 'schools.backToList' | transloco }}
      </a>
      <h1 class="text-2xl font-semibold" data-testid="page-title">
        {{ 'schools.card.title' | transloco }}
      </h1>
      <p class="text-muted-color font-mono text-sm" data-testid="school-id">{{ schoolId() }}</p>
      <p
        class="border-border text-muted-color flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm"
      >
        <i class="pi pi-wrench" aria-hidden="true"></i>
        {{ 'schools.card.soon' | transloco }}
      </p>
    </section>
  `,
})
export class SchoolCardPage {
  readonly schoolId = input.required<string>();
}
