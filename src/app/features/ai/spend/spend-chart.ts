import { Component, computed, inject, input } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { UIChart } from 'primeng/chart';
import { LanguageService } from '../../../core/i18n/language.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { INK, seriesColour } from '../../../shared/chart-palette';
import { MAIN_CURRENCY, SpendChart, formatMoney } from './spend-model';

/**
 * Cost per day, stacked by model (USD). The hover tooltip lists every model of the day with
 * its money; the legend names each colour, so identity never rests on colour alone; the table
 * above is the same numbers as text.
 */
@Component({
  selector: 'app-spend-chart',
  imports: [UIChart],
  template: `
    <div class="relative h-72" data-testid="spend-chart">
      <p-chart
        type="bar"
        height="18rem"
        [data]="data()"
        [options]="options()"
        [ariaLabel]="label()"
      />
    </div>
  `,
})
export class SpendChartComponent {
  readonly chart = input.required<SpendChart>();
  /** Accessible name of the canvas. */
  readonly label = input.required<string>();

  private readonly theme = inject(ThemeService);
  private readonly lang = inject(LanguageService).current;
  private readonly transloco = inject(TranslocoService);

  private readonly money = (dollars: number) =>
    formatMoney(Math.round(dollars * 1_000_000), MAIN_CURRENCY, this.lang());

  protected readonly data = computed(() => {
    const dark = this.theme.isDark();
    const surface = dark ? INK.dark.surface : INK.light.surface;
    const dayFormat = new Intl.DateTimeFormat(this.lang(), {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    return {
      labels: this.chart().days.map((d) => dayFormat.format(new Date(`${d}T00:00:00Z`))),
      datasets: this.chart().series.map((s) => ({
        label: s.name ?? this.transloco.translate<string>('ai.spend.other'),
        data: [...s.values],
        backgroundColor: seriesColour(s.slot, dark),
        // A thin gap of the surface between stacked segments.
        borderColor: surface,
        borderWidth: { top: 2, bottom: 0, left: 0, right: 0 },
        borderRadius: 2,
        maxBarThickness: 28,
        stack: 'cost',
      })),
    };
  });

  protected readonly options = computed(() => {
    const ink = this.theme.isDark() ? INK.dark : INK.light;
    return {
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: { position: 'bottom' as const, labels: { color: ink.text, boxWidth: 12 } },
        tooltip: {
          // Only the models that cost something that day.
          filter: (item: { raw: unknown }) => Number(item.raw) > 0,
          callbacks: {
            label: (item: { dataset: { label?: string }; raw: unknown }) =>
              `${item.dataset.label ?? ''}: ${this.money(Number(item.raw))}`,
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { color: ink.text, maxRotation: 0, autoSkipPadding: 12 },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: ink.grid },
          border: { display: false },
          ticks: { color: ink.text, callback: (v: string | number) => this.money(Number(v)) },
        },
      },
    };
  });
}
