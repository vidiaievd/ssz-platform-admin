import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FeatureTerms, termsText } from './plan-model';

/** What a key gives, in words: "off", "300 credits / month", "up to 25 seats", … */
@Component({
  selector: 'app-plan-terms',
  imports: [TranslocoPipe],
  template: `
    @let t = text();
    <span class="tabular-nums" data-testid="plan-terms" [attr.data-kind]="t.key">
      {{ 'plans.terms.' + t.key | transloco: { n: t.n } }}
      @for (limit of t.extra; track limit) {
        <span class="text-muted-color font-mono text-xs"> · {{ limit }}</span>
      }
    </span>
  `,
})
export class PlanTerms {
  readonly featureKey = input.required<string>();
  readonly terms = input.required<FeatureTerms>();

  protected readonly text = computed(() => termsText(this.featureKey(), this.terms()));
}
