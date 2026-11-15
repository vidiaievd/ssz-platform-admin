import { Component, computed, inject, input } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { UIChart } from 'primeng/chart';
import { LanguageService } from '../../core/i18n/language.service';
import { ThemeService } from '../../core/theme/theme.service';
import { INK, seriesColour } from '../../shared/chart-palette';
import { formatCredits } from '../ai/spend/payer-spend-model';
import { AgentChart } from './dashboard-ai-model';

/**
 * Credits per ISO week, stacked by capability (≤ 6 own series + grey "others"). The legend names
 * every colour; the tooltip lists the week's capabilities that spent anything, with credits.
 */
@Component({
  selector: 'app-agent-chart',
  imports: [UIChart],
  template: `
    <div class="relative h-56" data-testid="agent-chart">
      <p-chart
        type="bar"
        height="14rem"
        [data]="data()"
        [options]="options()"
        [ariaLabel]="label()"
      />
    </div>
  `,
})
export class AgentChartComponent {
  readonly chart = input.required<AgentChart>();
  /** Accessible name of the canvas. */
  readonly label = input.required<string>();

  private readonly theme = inject(ThemeService);
  private readonly lang = inject(LanguageService).current;
  private readonly transloco = inject(TranslocoService);

  private readonly dayFormat = computed(
    () => new Intl.DateTimeFormat(this.lang(), { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  );
  private day(date: string): string {
    return date ? this.dayFormat().format(new Date(`${date}T00:00:00Z`)) : '';
  }

  protected readonly data = computed(() => {
    const dark = this.theme.isDark();
    const surface = dark ? INK.dark.surface : INK.light.surface;
    return {
      labels: this.chart().weeks.map((w) => this.day(w.from)),
      datasets: this.chart().series.map((s) => ({
        label: s.capability ?? this.transloco.translate<string>('dashboard.ai.others'),
        data: [...s.values],
        backgroundColor: seriesColour(s.slot, dark),
        borderColor: surface,
        borderWidth: { top: 2, bottom: 0, left: 0, right: 0 },
        borderRadius: 2,
        maxBarThickness: 28,
        stack: 'credits',
      })),
    };
  });

  protected readonly options = computed(() => {
    const ink = this.theme.isDark() ? INK.dark : INK.light;
    const weeks = this.chart().weeks;
    const credits = (v: number) => formatCredits(Math.round(v * 1_000_000), this.lang());
    return {
      maintainAspectRatio: false,
      animation: false as const,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: { position: 'bottom' as const, labels: { color: ink.text, boxWidth: 12 } },
        tooltip: {
          filter: (item: { raw: unknown }) => Number(item.raw) > 0,
          callbacks: {
            title: (items: { dataIndex: number }[]) => {
              const w = items.length ? weeks[items[0].dataIndex] : null;
              return w ? `${w.week} · ${this.day(w.from)} – ${this.day(w.to)}` : '';
            },
            label: (item: { dataset: { label?: string }; raw: unknown }) =>
              `${item.dataset.label ?? ''}: ${credits(Number(item.raw))}`,
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
          ticks: {
            color: ink.text,
            maxTicksLimit: 5,
            callback: (v: string | number) => credits(Number(v)),
          },
        },
      },
    };
  });
}
