import { Component, computed, input } from '@angular/core';
import { sparkPoints } from './dashboard-model';

const WIDTH = 120;
const HEIGHT = 28;

/** A tiny trend line of a series; decorative (the numbers beside it say the same). */
@Component({
  selector: 'app-sparkline',
  template: `
    @if (points(); as points) {
      <svg
        class="text-primary block"
        [attr.viewBox]="'0 0 ' + width + ' ' + height"
        [attr.width]="width"
        [attr.height]="height"
        aria-hidden="true"
        data-testid="sparkline"
      >
        <polyline
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
          [attr.points]="points"
        />
      </svg>
    }
  `,
})
export class Sparkline {
  readonly values = input.required<readonly number[]>();
  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly points = computed(() => sparkPoints(this.values(), WIDTH, HEIGHT - 2));
}
