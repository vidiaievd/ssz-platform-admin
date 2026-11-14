import { Component, computed, inject, input } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { UIChart } from 'primeng/chart';
import { LanguageService } from '../../../core/i18n/language.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { MAIN_CURRENCY, SpendChart, formatMoney } from './spend-model';

/**
 * Categorical colours of the series, in fixed order, stepped for each surface (the validated
 * palette of the data-viz guide: adjacent pairs stay apart for colour-blind readers). A ninth
 * model is never a new hue — it folds into "Other", which is grey.
 */
const SERIES_LIGHT = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#6250d6',
  '#e34948',
];
const SERIES_DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#0ca30c',
  '#9085e9',
  '#e66767',
];
const OTHER = { light: '#a3a29c', dark: '#6b6a64' };
const INK = {
  light: { text: '#52514e', grid: 'rgba(11, 11, 11, 0.08)', surface: '#ffffff' },
  dark: { text: '#c3c2b7', grid: 'rgba(240, 239, 236, 0.10)', surface: '#18181b' },
};

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
    const palette = dark ? SERIES_DARK : SERIES_LIGHT;
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
        backgroundColor:
          s.slot === null ? (dark ? OTHER.dark : OTHER.light) : palette[s.slot % palette.length],
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
