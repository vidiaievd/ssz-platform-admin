import { Component, computed, inject, input } from '@angular/core';
import { UIChart } from 'primeng/chart';
import { LanguageService } from '../../core/i18n/language.service';
import { ThemeService } from '../../core/theme/theme.service';
import { INK, seriesColour } from '../../shared/chart-palette';
import { GrowthBucket, GrowthStep } from './growth-model';

/**
 * A small bar chart of new schools or new students per bar of the period. The totals are
 * written beside it as text, so the canvas only shows the shape; the tooltip names the bar's
 * days and its count.
 */
@Component({
  selector: 'app-growth-chart',
  imports: [UIChart],
  template: `
    <div class="relative h-32" [attr.data-testid]="'growth-chart-' + metric()">
      <p-chart
        type="bar"
        height="8rem"
        [data]="data()"
        [options]="options()"
        [ariaLabel]="label()"
      />
    </div>
  `,
})
export class GrowthChart {
  readonly buckets = input.required<readonly GrowthBucket[]>();
  readonly metric = input.required<'schools' | 'students'>();
  readonly step = input.required<GrowthStep>();
  /** Accessible name of the canvas (the series and its total). */
  readonly label = input.required<string>();

  private readonly theme = inject(ThemeService);
  private readonly lang = inject(LanguageService).current;

  private readonly dayFormat = computed(
    () => new Intl.DateTimeFormat(this.lang(), { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  );
  private readonly monthFormat = computed(
    () => new Intl.DateTimeFormat(this.lang(), { month: 'short', timeZone: 'UTC' }),
  );

  private day(date: string): string {
    return this.dayFormat().format(new Date(`${date}T00:00:00Z`));
  }

  /** Axis label: the day, the week's first day, or the month. */
  private tick(b: GrowthBucket): string {
    return this.step() === 'month'
      ? this.monthFormat().format(new Date(`${b.from}T00:00:00Z`))
      : this.day(b.from);
  }

  /** Tooltip title: the bar's exact days. */
  private range(b: GrowthBucket): string {
    return b.from === b.to ? this.day(b.from) : `${this.day(b.from)} – ${this.day(b.to)}`;
  }

  protected readonly data = computed(() => {
    const dark = this.theme.isDark();
    const metric = this.metric();
    return {
      labels: this.buckets().map((b) => this.tick(b)),
      datasets: [
        {
          data: this.buckets().map((b) => b[metric]),
          // One series, so one hue: the first of the palette.
          backgroundColor: seriesColour(0, dark),
          borderRadius: 2,
          maxBarThickness: 18,
        },
      ],
    };
  });

  protected readonly options = computed(() => {
    const ink = this.theme.isDark() ? INK.dark : INK.light;
    const buckets = this.buckets();
    const count = new Intl.NumberFormat(this.lang());
    return {
      maintainAspectRatio: false,
      animation: false as const,
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            title: (items: { dataIndex: number }[]) =>
              items.length ? this.range(buckets[items[0].dataIndex]) : '',
            label: (item: { raw: unknown }) => count.format(Number(item.raw)),
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: ink.text, maxRotation: 0, autoSkipPadding: 12, font: { size: 10 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: ink.grid },
          border: { display: false },
          // Whole people and schools only; at most a few lines on a small chart.
          ticks: { color: ink.text, precision: 0, maxTicksLimit: 4, font: { size: 10 } },
        },
      },
    };
  });
}
