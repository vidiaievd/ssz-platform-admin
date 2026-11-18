import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NavSectionId } from '../../layout/nav-sections';

/** A section of the menu that is not built yet; `section` comes from the route data. */
@Component({
  selector: 'app-coming-soon-page',
  imports: [TranslocoPipe],
  template: `
    <section class="flex max-w-2xl flex-col gap-3">
      <h1 class="text-2xl font-semibold" data-testid="page-title">
        {{ 'nav.' + section() | transloco }}
      </h1>
      <p class="text-muted-color">{{ 'sections.' + section() | transloco }}</p>
      <p
        class="border-border text-muted-color flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm"
      >
        <i class="pi pi-wrench" aria-hidden="true"></i>
        {{ 'comingSoon.text' | transloco }}
      </p>
    </section>
  `,
})
export class ComingSoonPage {
  readonly section = input.required<NavSectionId>();
}
