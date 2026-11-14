import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { Skeleton } from 'primeng/skeleton';
import { AiApi } from '../../../api/ai/ai-api';
import { adminRegistryListPrices } from '../../../api/ai/functions';
import { ModelPriceResponseDto } from '../../../api/ai/models/model-price-response-dto';
import { LanguageService } from '../../../core/i18n/language.service';
import { formatMoment } from '../../schools/card/journal/journal-format';
import { stateOf } from '../../schools/card/plan/school-plan.data';
import { formatMoney } from '../spend/spend-model';
import { Modality, priceLines } from './provider-cards';

/**
 * A model's price history, newest first — created only when its row unfolds, so the history
 * is read on demand. Prices are rows, never edited: a new price is a new row from its day on
 * (they come from the seed, not from the panel).
 */
@Component({
  selector: 'app-model-prices',
  imports: [TranslocoPipe, Skeleton],
  template: `
    @switch (prices().kind) {
      @case ('loading') {
        <p-skeleton height="2.5rem" />
      }
      @case ('error') {
        <p class="text-sm" role="alert" data-testid="model-prices-failed">
          {{ 'ai.providers.prices.failed' | transloco }} ·
          <button type="button" class="text-primary underline" (click)="resource.reload()">
            {{ 'schools.retry' | transloco }}
          </button>
        </p>
      }
      @default {
        @if (rows().length === 0) {
          <p class="text-muted-color text-sm" data-testid="model-prices-empty">
            {{ 'ai.providers.prices.empty' | transloco }}
          </p>
        } @else {
          <ol class="flex flex-col gap-1 text-xs" data-testid="model-prices">
            @for (row of rows(); track row.price.effectiveFrom; let first = $first) {
              <li class="flex flex-wrap items-baseline gap-x-3" data-testid="model-price-entry">
                <time class="tabular-nums" [attr.datetime]="row.price.effectiveFrom">
                  {{
                    'ai.providers.prices.from'
                      | transloco: { moment: moment(row.price.effectiveFrom) }
                  }}
                </time>
                @if (first) {
                  <span class="text-muted-color">{{
                    'ai.providers.prices.latest' | transloco
                  }}</span>
                }
                @for (line of row.lines; track line.unit) {
                  <span class="tabular-nums">
                    {{ 'ai.providers.price.' + line.unit | transloco: { amount: line.amount } }}
                  </span>
                }
              </li>
            }
          </ol>
        }
      }
    }
  `,
})
export class ModelPrices {
  readonly modelId = input.required<string>();
  readonly modality = input.required<Modality>();

  private readonly ai = inject(AiApi);
  private readonly lang = inject(LanguageService).current;

  protected readonly resource = rxResource({
    params: () => ({ id: this.modelId() }),
    stream: ({ params }) => this.ai.invoke(adminRegistryListPrices, params),
  });

  protected readonly prices = computed(() => stateOf<ModelPriceResponseDto[]>(this.resource));

  protected readonly rows = computed(() => {
    const prices = this.prices();
    if (prices.kind !== 'ready') return [];
    const lang = this.lang();
    return prices.value.map((price) => ({
      price,
      lines: priceLines(price, this.modality()).map((line) => ({
        unit: line.unit,
        amount: formatMoney(line.micros, price.currency, lang),
      })),
    }));
  });

  protected moment(iso: string): string {
    return formatMoment(iso, this.lang());
  }
}
