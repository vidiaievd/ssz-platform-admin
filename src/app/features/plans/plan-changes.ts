import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Tag } from 'primeng/tag';
import { FeatureChange } from './plan-model';
import { PlanTerms } from './plan-terms';

/**
 * Key-by-key difference between two versions: added / removed / changed, with the terms before
 * and after. Shared by the plan card, the version editor's confirmation and the migration preview.
 */
@Component({
  selector: 'app-plan-changes',
  imports: [TranslocoPipe, Tag, PlanTerms],
  template: `
    <ul class="flex flex-col gap-1 text-sm">
      @for (c of changes(); track c.featureKey) {
        <li
          class="flex flex-wrap items-center gap-x-2"
          data-testid="version-change"
          [attr.data-key]="c.featureKey"
          [attr.data-change]="c.change"
        >
          <p-tag
            [severity]="severity[c.change]"
            [value]="'plans.card.change.' + c.change | transloco"
          />
          <span class="font-mono text-xs">{{ c.featureKey }}</span>
          @if (c.before) {
            <span [class.line-through]="c.change === 'removed'">
              <app-plan-terms [featureKey]="c.featureKey" [terms]="c.before" />
            </span>
          }
          @if (c.before && c.after) {
            <i class="pi pi-arrow-right text-xs" aria-hidden="true"></i>
            <span class="sr-only">{{ 'plans.card.becomes' | transloco }}</span>
          }
          @if (c.after) {
            <app-plan-terms [featureKey]="c.featureKey" [terms]="c.after" />
          }
        </li>
      }
    </ul>
  `,
})
export class PlanChanges {
  readonly changes = input.required<readonly FeatureChange[]>();

  protected readonly severity = {
    added: 'success',
    removed: 'danger',
    changed: 'warn',
  } as const;
}
