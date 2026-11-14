import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Skeleton } from 'primeng/skeleton';
import { AiApi } from '../../../api/ai/ai-api';
import { adminBindingsHistory } from '../../../api/ai/functions';
import { BindingChangeResponseDto } from '../../../api/ai/models/binding-change-response-dto';
import { LanguageService } from '../../../core/i18n/language.service';
import { formatMoment } from '../../schools/card/journal/journal-format';
import { stateOf } from '../../schools/card/plan/school-plan.data';
import { FieldChange, Registry, changedFields, modelRef } from './agent-binding-rows';

/**
 * Every write to one capability's binding, newest first, with what each write changed. Created
 * only when its row is unfolded, so the history is read on demand. The reason of a write is in
 * the admin journal (`binding.changed`), not here — ai-service keeps the settings history only.
 */
@Component({
  selector: 'app-binding-history',
  imports: [TranslocoPipe, Skeleton],
  template: `
    @switch (history().kind) {
      @case ('loading') {
        <p-skeleton height="3rem" />
      }
      @case ('error') {
        <p class="text-sm" role="alert" data-testid="binding-history-failed">
          {{ 'ai.models.history.failed' | transloco }} ·
          <button type="button" class="text-primary underline" (click)="resource.reload()">
            {{ 'schools.retry' | transloco }}
          </button>
        </p>
      }
      @default {
        @if (changes().length === 0) {
          <p class="text-muted-color text-sm" data-testid="binding-history-empty">
            {{ 'ai.models.history.empty' | transloco }}
          </p>
        } @else {
          <ol class="flex flex-col gap-2" data-testid="binding-history">
            @for (entry of changes(); track entry.change.version) {
              <li class="flex flex-col gap-1 text-sm" data-testid="binding-history-entry">
                <div class="text-muted-color flex flex-wrap items-center gap-2 text-xs">
                  <span class="font-medium">v{{ entry.change.version }}</span>
                  <time class="tabular-nums" [attr.datetime]="entry.change.changedAt">
                    {{ moment(entry.change.changedAt) }}
                  </time>
                  <span class="font-mono" data-testid="binding-history-actor">
                    {{ entry.change.changedBy }}
                  </span>
                  @if (!entry.change.before) {
                    <span>{{ 'ai.models.history.created' | transloco }}</span>
                  }
                </div>
                @if (entry.fields.length === 0) {
                  <span class="text-muted-color text-xs">
                    {{ 'ai.models.history.unchanged' | transloco }}
                  </span>
                } @else {
                  <ul class="flex flex-col gap-0.5 text-xs">
                    @for (f of entry.fields; track f.field) {
                      <li data-testid="binding-history-field">
                        <span class="font-medium">{{
                          'ai.models.fields.' + f.field | transloco
                        }}</span
                        >:
                        @if (entry.change.before) {
                          <span class="text-muted-color line-through">{{ show(f, 'before') }}</span>
                          →
                        }
                        <span>{{ show(f, 'after') }}</span>
                      </li>
                    }
                  </ul>
                }
              </li>
            }
          </ol>
        }
      }
    }
  `,
})
export class BindingHistory {
  readonly capability = input.required<string>();
  /** The binding's version: a write from this screen reads the history again. */
  readonly version = input<number | null>(null);
  /** Names the models of a write; null shows their ids. */
  readonly registry = input<Registry | null>(null);

  private readonly ai = inject(AiApi);
  private readonly lang = inject(LanguageService).current;
  private readonly transloco = inject(TranslocoService);

  protected readonly resource = rxResource({
    params: () => ({ capability: this.capability(), version: this.version() }),
    stream: ({ params: { capability } }) => this.ai.invoke(adminBindingsHistory, { capability }),
  });

  protected readonly history = computed(() => stateOf<BindingChangeResponseDto[]>(this.resource));

  protected readonly changes = computed(() => {
    const history = this.history();
    if (history.kind !== 'ready') return [];
    return history.value.map((change) => ({ change, fields: changedFields(change) }));
  });

  protected moment(iso: string): string {
    return formatMoment(iso, this.lang());
  }

  /** A value as a person reads it: model names, on / off, "—" for none, the provider's default temperature. */
  protected show(change: FieldChange, side: 'before' | 'after'): string {
    const value = change[side];
    if (change.field === 'primaryModelId' || change.field === 'fallbackModelId') {
      if (typeof value !== 'string') return '—';
      return modelRef(value, this.registry()).model?.displayName ?? value;
    }
    if (value === null || value === undefined) {
      return change.field === 'temperature'
        ? this.transloco.translate('ai.models.providerDefault')
        : '—';
    }
    if (typeof value === 'boolean') {
      return this.transloco.translate(value ? 'ai.models.on' : 'ai.models.off');
    }
    return String(value);
  }
}
