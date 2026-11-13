import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * An address the panel does not know — or one the administrator's level may not open: a
 * level-gated route does not match for a lower level, so both end here (§2 of plan 90).
 */
@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink, TranslocoPipe],
  template: `
    <section class="flex max-w-2xl flex-col gap-3">
      <h1 class="text-2xl font-semibold" data-testid="page-title">
        {{ 'notFound.title' | transloco }}
      </h1>
      <p class="text-muted-color">{{ 'notFound.text' | transloco }}</p>
      <a class="text-primary underline" routerLink="/">{{ 'notFound.home' | transloco }}</a>
    </section>
  `,
})
export class NotFoundPage {}
