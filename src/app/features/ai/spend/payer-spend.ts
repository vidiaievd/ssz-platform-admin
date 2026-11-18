import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { PAYER_TYPES, PayerType, UsageFigures, formatCredits } from './payer-spend-model';
import { PayerSpendData } from './payer-spend.data';

/**
 * The per-payer block of "AI → Spend" (plan 90, §6.7, step 17): credits charged to payers in
 * the page's period — the top payers (schools link to their card), per agent and per ISO week.
 * Credits, not money: what the tariffs count, from analytics. Uses the page's `PayerSpendData`,
 * so the page's "refresh" reads this block too.
 */
@Component({
  selector: 'app-payer-spend',
  imports: [RouterLink, TranslocoPipe, ButtonDirective, Skeleton, Tag, LocalDatePipe],
  template: `
    <section class="flex flex-col gap-4" data-testid="payer-spend">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-base font-semibold">{{ 'ai.payerSpend.title' | transloco }}</h2>
        <div
          class="ml-auto flex flex-wrap items-center gap-2"
          role="group"
          [attr.aria-label]="'ai.payerSpend.filter' | transloco"
        >
          @for (t of filters; track t) {
            <button
              type="button"
              pButton
              size="small"
              [severity]="t === current() ? 'primary' : 'secondary'"
              [outlined]="t !== current()"
              [attr.aria-pressed]="t === current()"
              [attr.data-testid]="'payer-filter-' + t"
              (click)="setPayerType(t)"
            >
              {{ 'ai.payerSpend.types.' + t | transloco }}
            </button>
          }
        </div>
      </div>
      <p class="text-muted-color text-sm">{{ 'ai.payerSpend.hint' | transloco }}</p>

      <!-- Top payers -->
      @switch (data.payers().kind) {
        @case ('loading') {
          <p-skeleton height="10rem" />
        }
        @case ('error') {
          <p class="text-sm" role="alert" data-testid="payers-failed">
            {{ 'ai.payerSpend.failed' | transloco }} ·
            <button type="button" class="text-primary underline" (click)="data.reloadPayers()">
              {{ 'schools.retry' | transloco }}
            </button>
          </p>
        }
        @default {
          @if (data.total(); as total) {
            <p class="text-sm tabular-nums" data-testid="payers-total">
              {{
                'ai.payerSpend.total'
                  | transloco
                    : {
                        credits: credits(total.creditMicros),
                        calls: num(total.calls),
                        payers: num(data.payerCount() ?? 0),
                      }
              }}
              @if (total.unpricedCalls > 0) {
                <span class="text-amber-600 dark:text-amber-400" data-testid="payers-unpriced">
                  · <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
                  {{ 'ai.spend.unpricedCalls' | transloco: { count: total.unpricedCalls } }}
                </span>
              }
            </p>
          }
          @if (data.namesFailed().length > 0) {
            <p class="text-muted-color text-xs" data-testid="payer-names-failed">
              {{ 'ai.payerSpend.namesFailed' | transloco }}
            </p>
          }
          @if (data.payerRows().length === 0) {
            <p class="text-sm" data-testid="payers-empty">
              {{ 'ai.payerSpend.empty' | transloco }}
            </p>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full min-w-[44rem] text-sm" data-testid="payers-table">
                <thead class="text-muted-color text-left">
                  <tr>
                    <th class="w-8 py-1 pr-2 text-right font-medium">#</th>
                    <th class="py-1 pr-4 font-medium">
                      {{ 'ai.payerSpend.col.payer' | transloco }}
                    </th>
                    <th class="py-1 pr-4 text-right font-medium">
                      {{ 'ai.spend.col.calls' | transloco }}
                    </th>
                    <th class="py-1 pr-4 text-right font-medium">
                      {{ 'ai.spend.col.tokens' | transloco }}
                    </th>
                    <th class="py-1 pr-4 text-right font-medium">
                      {{ 'ai.payerSpend.col.credits' | transloco }}
                    </th>
                    <th class="py-1 text-right font-medium">
                      {{ 'ai.spend.col.share' | transloco }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (
                    row of data.payerRows();
                    track row.payerType + row.payerId;
                    let i = $index
                  ) {
                    <tr
                      class="border-border border-t align-top"
                      data-testid="payer-row"
                      [attr.data-payer]="row.payerId"
                    >
                      <td class="text-muted-color py-2 pr-2 text-right tabular-nums">
                        {{ i + 1 }}
                      </td>
                      <td class="py-2 pr-4">
                        <div class="flex flex-wrap items-center gap-2">
                          <p-tag
                            severity="secondary"
                            [value]="'ai.payerSpend.type.' + row.payerType | transloco"
                          />
                          @if (row.payerType === 'platform') {
                            <span class="font-medium" data-testid="payer-name">
                              {{ 'ai.payerSpend.platform' | transloco }}
                            </span>
                          } @else if (row.link) {
                            <a
                              class="text-primary font-medium hover:underline"
                              data-testid="payer-name"
                              [routerLink]="row.link"
                              >{{ row.name }}</a
                            >
                          } @else if (row.name) {
                            <span class="font-medium" data-testid="payer-name">{{ row.name }}</span>
                          } @else {
                            <span class="font-mono text-xs" data-testid="payer-name">
                              {{ row.payerId }}
                            </span>
                          }
                        </div>
                        @if (row.detail) {
                          <div class="text-muted-color font-mono text-xs">{{ row.detail }}</div>
                        }
                      </td>
                      <td class="py-2 pr-4 text-right tabular-nums" data-testid="payer-calls">
                        {{ num(row.calls) }}
                        @if (row.unpricedCalls > 0) {
                          <div class="text-xs text-amber-600 dark:text-amber-400">
                            {{ 'ai.spend.unpricedCalls' | transloco: { count: row.unpricedCalls } }}
                          </div>
                        }
                      </td>
                      <td class="py-2 pr-4 text-right tabular-nums">{{ tokens(row) }}</td>
                      <td class="py-2 pr-4 text-right tabular-nums" data-testid="payer-credits">
                        {{ credits(row.creditMicros) }}
                      </td>
                      <td class="py-2 text-right tabular-nums" data-testid="payer-share">
                        {{ pct(row.share) }}
                      </td>
                    </tr>
                  }
                  @if (data.others(); as o) {
                    <tr class="border-border text-muted-color border-t" data-testid="payer-others">
                      <td></td>
                      <td class="py-2 pr-4">
                        {{ 'ai.payerSpend.others' | transloco: { count: o.payers } }}
                      </td>
                      <td class="py-2 pr-4 text-right tabular-nums">{{ num(o.calls) }}</td>
                      <td class="py-2 pr-4 text-right tabular-nums">{{ tokens(o) }}</td>
                      <td class="py-2 pr-4 text-right tabular-nums" data-testid="payer-credits">
                        {{ credits(o.creditMicros) }}
                      </td>
                      <td class="py-2 text-right tabular-nums">
                        {{ pct(o.share) }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      }

      <div class="grid gap-4 xl:grid-cols-2">
        <!-- Per agent -->
        <section
          class="border-border flex min-w-0 flex-col gap-2 rounded-md border p-4"
          data-testid="payer-by-capability"
        >
          <h3 class="text-sm font-semibold">{{ 'ai.payerSpend.byCapability' | transloco }}</h3>
          @switch (data.capabilities().kind) {
            @case ('loading') {
              <p-skeleton height="6rem" />
            }
            @case ('error') {
              <p class="text-sm" role="alert" data-testid="capabilities-failed">
                {{ 'ai.payerSpend.failed' | transloco }} ·
                <button
                  type="button"
                  class="text-primary underline"
                  (click)="data.reloadCapabilities()"
                >
                  {{ 'schools.retry' | transloco }}
                </button>
              </p>
            }
            @default {
              @if (data.capabilityRows().length === 0) {
                <p class="text-muted-color text-sm">{{ 'ai.payerSpend.empty' | transloco }}</p>
              } @else {
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead class="text-muted-color text-left">
                      <tr>
                        <th class="py-1 pr-4 font-medium">
                          {{ 'ai.payerSpend.col.capability' | transloco }}
                        </th>
                        <th class="py-1 pr-4 text-right font-medium">
                          {{ 'ai.spend.col.calls' | transloco }}
                        </th>
                        <th class="py-1 pr-4 text-right font-medium">
                          {{ 'ai.payerSpend.col.credits' | transloco }}
                        </th>
                        <th class="py-1 text-right font-medium">
                          {{ 'ai.spend.col.share' | transloco }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (c of data.capabilityRows(); track c.capability) {
                        <tr
                          class="border-border border-t"
                          data-testid="capability-usage-row"
                          [attr.data-capability]="c.capability"
                        >
                          <td class="py-1 pr-4 font-mono text-xs">{{ c.capability }}</td>
                          <td class="py-1 pr-4 text-right tabular-nums">
                            {{ num(c.calls) }}
                          </td>
                          <td class="py-1 pr-4 text-right tabular-nums" data-testid="payer-credits">
                            {{ credits(c.creditMicros) }}
                          </td>
                          <td class="py-1 text-right tabular-nums">
                            {{ pct(c.share) }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            }
          }
        </section>

        <!-- Per ISO week -->
        <section
          class="border-border flex min-w-0 flex-col gap-2 rounded-md border p-4"
          data-testid="payer-by-week"
        >
          <h3 class="text-sm font-semibold">{{ 'ai.payerSpend.byWeek' | transloco }}</h3>
          @switch (data.weeks().kind) {
            @case ('loading') {
              <p-skeleton height="6rem" />
            }
            @case ('error') {
              <p class="text-sm" role="alert" data-testid="weeks-failed">
                {{ 'ai.payerSpend.failed' | transloco }} ·
                <button type="button" class="text-primary underline" (click)="data.reloadWeeks()">
                  {{ 'schools.retry' | transloco }}
                </button>
              </p>
            }
            @default {
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead class="text-muted-color text-left">
                    <tr>
                      <th class="py-1 pr-4 font-medium">
                        {{ 'ai.payerSpend.col.week' | transloco }}
                      </th>
                      <th class="py-1 pr-4 text-right font-medium">
                        {{ 'ai.spend.col.calls' | transloco }}
                      </th>
                      <th class="py-1 pr-4 text-right font-medium">
                        {{ 'ai.payerSpend.col.credits' | transloco }}
                      </th>
                      <th class="hidden w-1/3 py-1 font-medium sm:table-cell">
                        <span class="sr-only">{{ 'ai.payerSpend.col.bar' | transloco }}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (w of data.weekRows(); track w.week) {
                      <tr
                        class="border-border border-t"
                        data-testid="week-row"
                        [attr.data-week]="w.week"
                        [class.text-muted-color]="w.calls === 0"
                      >
                        <td class="py-1 pr-4">
                          <span class="font-mono text-xs">{{ w.week }}</span>
                          <div class="text-muted-color text-xs tabular-nums">
                            {{ w.from | localDate: lang() }} – {{ w.to | localDate: lang() }}
                          </div>
                        </td>
                        <td class="py-1 pr-4 text-right tabular-nums">{{ num(w.calls) }}</td>
                        <td class="py-1 pr-4 text-right tabular-nums" data-testid="payer-credits">
                          {{ credits(w.creditMicros) }}
                        </td>
                        <td class="hidden py-1 sm:table-cell" aria-hidden="true">
                          @if (w.bar > 0) {
                            <div
                              class="week-bar h-3 rounded-r"
                              data-testid="week-bar"
                              [style.width.%]="w.bar * 100"
                              [title]="credits(w.creditMicros)"
                            ></div>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
        </section>
      </div>
    </section>
  `,
  // One series: the first hue of the spend chart's categorical palette, its own step per theme.
  styles: `
    .week-bar {
      min-width: 2px;
      background: #2a78d6;
    }
    :host-context(.app-dark) .week-bar {
      background: #3987e5;
    }
  `,
})
export class PayerSpendComponent {
  protected readonly data = inject(PayerSpendData);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly lang = inject(LanguageService).current;

  protected readonly filters = ['all', ...PAYER_TYPES] as const;

  protected current(): PayerType | 'all' {
    return this.data.payerType() ?? 'all';
  }

  protected credits(micros: number): string {
    return formatCredits(micros, this.lang());
  }

  /** Counts and shares in the panel's language, like the credits beside them. */
  protected num(n: number): string {
    return new Intl.NumberFormat(this.lang()).format(n);
  }

  protected pct(share: number | null): string {
    if (share === null) return '—';
    return new Intl.NumberFormat(this.lang(), {
      style: 'percent',
      maximumFractionDigits: 1,
    }).format(share);
  }

  protected tokens(f: UsageFigures): string {
    if (f.inputTokens + f.outputTokens === 0) return '—';
    return `${this.num(f.inputTokens)} / ${this.num(f.outputTokens)}`;
  }

  protected setPayerType(type: PayerType | 'all'): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { payer: type === 'all' ? null : type },
      queryParamsHandling: 'merge',
    });
  }
}
