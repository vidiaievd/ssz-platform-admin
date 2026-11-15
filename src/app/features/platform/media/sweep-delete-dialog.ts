import { Component, computed, inject, input, model, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RunSweepResponseDto } from '../../../api/media/models/run-sweep-response-dto';
import { LanguageService } from '../../../core/i18n/language.service';
import { ReasonDialog } from '../../../shared/reason-dialog/reason-dialog';
import { formatMoment } from '../../schools/card/journal/journal-format';
import { MediaSweepsData } from './media-sweeps.data';
import { DryRunResult } from './sweep-model';

/**
 * "Delete" of one sweep (plan 90, phase 8, step 12), level `super`: opened only on a fresh dry
 * run from this panel, whose numbers it shows — the delete itself counts again and may differ a
 * little. The reason lands in the admin journal (`media.sweep.deleted`).
 */
@Component({
  selector: 'app-sweep-delete-dialog',
  imports: [TranslocoPipe, ReasonDialog],
  template: `
    <app-reason-dialog
      [(visible)]="visible"
      [header]="'platform.media.delete.title' | transloco"
      [confirmLabel]="'platform.media.delete.confirm' | transloco"
      level="super"
      [danger]="true"
      [action]="run"
      (done)="done.emit($event)"
    >
      @if (dryRun(); as d) {
        <p class="text-sm font-medium" data-testid="sweep-delete-kind">
          {{ 'platform.media.kinds.' + d.kind + '.title' | transloco }}
        </p>
        <p class="text-muted-color text-sm" data-testid="sweep-delete-checked">
          {{ 'platform.media.delete.checkedAt' | transloco: { when: checkedAt() } }}
        </p>
        <dl
          class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm"
          data-testid="sweep-delete-numbers"
        >
          <dt class="text-muted-color">{{ 'platform.media.summary.scanned' | transloco }}</dt>
          <dd class="tabular-nums" data-testid="sweep-delete-scanned">{{ d.summary.scanned }}</dd>
          <dt class="text-muted-color">{{ 'platform.media.summary.kept' | transloco }}</dt>
          <dd class="tabular-nums" data-testid="sweep-delete-kept">{{ d.summary.kept }}</dd>
          <dt class="font-medium">{{ 'platform.media.summary.candidates' | transloco }}</dt>
          <dd class="font-medium tabular-nums" data-testid="sweep-delete-candidates">
            {{ d.summary.candidates }}
          </dd>
        </dl>
        <p
          class="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950"
          role="note"
          data-testid="sweep-delete-warning"
        >
          <i class="pi pi-exclamation-triangle mt-0.5 text-amber-500" aria-hidden="true"></i>
          <span>{{ 'platform.media.delete.warning' | transloco }}</span>
        </p>
      }
    </app-reason-dialog>
  `,
})
export class SweepDeleteDialog {
  readonly visible = model(false);
  /** The fresh dry run the dialog was opened on. */
  readonly dryRun = input<DryRunResult | null>(null);
  readonly done = output<RunSweepResponseDto>();

  private readonly data = inject(MediaSweepsData);
  private readonly lang = inject(LanguageService).current;

  protected readonly checkedAt = computed(() => {
    const d = this.dryRun();
    return d ? formatMoment(new Date(d.at).toISOString(), this.lang()) : '';
  });

  protected readonly run = (reason: string) => this.data.delete(this.dryRun()!.kind, reason);
}
