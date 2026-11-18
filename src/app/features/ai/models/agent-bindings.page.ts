import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { IfLevelDirective } from '../../../core/auth/if-level.directive';
import { LanguageService } from '../../../core/i18n/language.service';
import { formatMoment } from '../../schools/card/journal/journal-format';
import { AgentBindingRow } from './agent-binding-rows';
import { AgentBindingsData } from './agent-bindings.data';
import { BindingDialog } from './binding-dialog';
import { BindingHistory } from './binding-history';

/**
 * `/ai/models` — "AI → Agent models" (plan 90, phase 7, step 4): every capability of
 * ai-service with the model that answers first, the fallback, the switch, the prompt version
 * and the limits, and who changed it last. An unbound capability (every call refused) stands
 * out. `super` changes a binding through the reason dialog; each row unfolds its history.
 */
@Component({
  selector: 'app-agent-bindings-page',
  providers: [AgentBindingsData],
  imports: [
    NgTemplateOutlet,
    TranslocoPipe,
    ButtonDirective,
    Skeleton,
    Tag,
    IfLevelDirective,
    BindingDialog,
    BindingHistory,
  ],
  template: `
    <section class="flex flex-col gap-3" data-testid="agent-bindings">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-base font-semibold">{{ 'ai.models.title' | transloco }}</h2>
        <button
          pButton
          type="button"
          size="small"
          severity="secondary"
          [text]="true"
          class="ml-auto"
          data-testid="bindings-refresh"
          (click)="refresh()"
        >
          <i class="pi pi-refresh" aria-hidden="true"></i>
          {{ 'ai.models.refresh' | transloco }}
        </button>
      </div>
      <p class="text-muted-color text-sm">{{ 'ai.models.hint' | transloco }}</p>

      @if (data.registry().kind === 'error') {
        <p class="text-sm" role="alert" data-testid="registry-failed">
          {{ 'ai.models.registryFailed' | transloco }} ·
          <button type="button" class="text-primary underline" (click)="data.reloadRegistry()">
            {{ 'schools.retry' | transloco }}
          </button>
        </p>
      }

      @switch (data.bindings().kind) {
        @case ('loading') {
          <p-skeleton height="12rem" />
        }
        @case ('error') {
          <p class="text-sm" role="alert" data-testid="bindings-failed">
            {{ 'ai.models.failed' | transloco }} ·
            <button type="button" class="text-primary underline" (click)="data.reloadBindings()">
              {{ 'schools.retry' | transloco }}
            </button>
          </p>
        }
        @default {
          @if (data.unbound() > 0) {
            <div
              role="status"
              class="flex items-center gap-2 rounded-md border border-amber-300 px-3 py-2 text-sm dark:border-amber-700"
              data-testid="bindings-unbound"
            >
              <i class="pi pi-exclamation-triangle text-amber-500" aria-hidden="true"></i>
              {{ 'ai.models.unboundBanner' | transloco: { count: data.unbound() } }}
            </div>
          }

          <div class="overflow-x-auto">
            <table class="w-full min-w-[64rem] text-sm" data-testid="bindings-table">
              <thead class="text-muted-color text-left">
                <tr>
                  <th class="py-1 pr-4 font-medium">{{ 'ai.models.agent' | transloco }}</th>
                  <th class="py-1 pr-4 font-medium">{{ 'ai.models.primary' | transloco }}</th>
                  <th class="py-1 pr-4 font-medium">{{ 'ai.models.fallback' | transloco }}</th>
                  <th class="py-1 pr-4 font-medium">{{ 'ai.models.state' | transloco }}</th>
                  <th class="py-1 pr-4 font-medium">{{ 'ai.models.promptVersion' | transloco }}</th>
                  <th class="py-1 pr-4 font-medium">{{ 'ai.models.limits' | transloco }}</th>
                  <th class="py-1 pr-4 font-medium">{{ 'ai.models.changed' | transloco }}</th>
                  <th class="py-1">
                    <span class="sr-only">{{ 'schools.plan.actions' | transloco }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (row of data.rows(); track row.capability) {
                  <tr
                    class="border-border border-t align-top"
                    [class]="row.binding ? '' : 'bg-amber-50 dark:bg-amber-950/40'"
                    [attr.data-capability]="row.capability"
                    data-testid="binding-row"
                  >
                    <td class="py-2 pr-4">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="font-mono font-medium">{{ row.capability }}</span>
                        <p-tag severity="secondary" [value]="row.modality" />
                      </div>
                      <div class="text-muted-color max-w-[20rem] text-xs">
                        {{ row.description }}
                      </div>
                    </td>
                    <td class="py-2 pr-4" data-testid="binding-primary-cell">
                      @if (row.primary; as m) {
                        <ng-container *ngTemplateOutlet="modelCell; context: { $implicit: m }" />
                      } @else {
                        <span class="text-muted-color">—</span>
                      }
                    </td>
                    <td class="py-2 pr-4" data-testid="binding-fallback-cell">
                      @if (row.fallback; as m) {
                        <ng-container *ngTemplateOutlet="modelCell; context: { $implicit: m }" />
                      } @else {
                        <span class="text-muted-color">{{
                          row.binding ? ('ai.models.noFallback' | transloco) : '—'
                        }}</span>
                      }
                    </td>
                    <td class="py-2 pr-4" data-testid="binding-state">
                      @if (!row.binding) {
                        <p-tag severity="warn" [value]="'ai.models.unbound' | transloco" />
                      } @else if (row.binding.enabled) {
                        <p-tag severity="success" [value]="'ai.models.on' | transloco" />
                      } @else {
                        <p-tag severity="danger" [value]="'ai.models.off' | transloco" />
                      }
                    </td>
                    <td class="py-2 pr-4 font-mono text-xs">
                      {{ row.binding?.promptVersion ?? '—' }}
                    </td>
                    <td class="py-2 pr-4 text-xs tabular-nums" data-testid="binding-limits">
                      @if (row.binding; as b) {
                        @if (row.modality === 'llm') {
                          <div>
                            {{ 'ai.models.tokensLimit' | transloco: { count: b.maxOutputTokens } }}
                          </div>
                          <div>
                            {{
                              b.temperature === null
                                ? ('ai.models.temperatureDefault' | transloco)
                                : ('ai.models.temperatureValue'
                                  | transloco: { value: b.temperature })
                            }}
                          </div>
                        }
                        <div>
                          {{
                            'ai.models.timeoutLimit' | transloco: { seconds: b.timeoutMs / 1000 }
                          }}
                        </div>
                      } @else {
                        —
                      }
                    </td>
                    <td class="py-2 pr-4 text-xs" data-testid="binding-changed">
                      @if (row.binding; as b) {
                        <div class="tabular-nums">{{ moment(b.updatedAt) }}</div>
                        <div class="text-muted-color font-mono">{{ b.updatedBy }}</div>
                        <div class="text-muted-color">v{{ b.version }}</div>
                      } @else {
                        —
                      }
                    </td>
                    <td class="py-2 text-right whitespace-nowrap">
                      <button
                        *appIfLevel="'super'"
                        pButton
                        type="button"
                        size="small"
                        severity="secondary"
                        [disabled]="!canEdit()"
                        [attr.title]="canEdit() ? null : ('ai.models.editWaits' | transloco)"
                        data-testid="binding-edit"
                        (click)="edit(row)"
                      >
                        {{ (row.binding ? 'ai.models.edit' : 'ai.models.bind') | transloco }}
                      </button>
                      @if (row.binding) {
                        <button
                          pButton
                          type="button"
                          size="small"
                          severity="secondary"
                          [text]="true"
                          [attr.aria-expanded]="isOpen(row.capability)"
                          data-testid="binding-history-toggle"
                          (click)="toggle(row.capability)"
                        >
                          {{ 'ai.models.history.toggle' | transloco }}
                          <i
                            class="pi"
                            [class.pi-chevron-down]="!isOpen(row.capability)"
                            [class.pi-chevron-up]="isOpen(row.capability)"
                            aria-hidden="true"
                          ></i>
                        </button>
                      }
                    </td>
                  </tr>
                  @if (row.binding && isOpen(row.capability)) {
                    <tr class="bg-surface-50 dark:bg-surface-900">
                      <td colspan="8" class="px-3 py-2">
                        <app-binding-history
                          [capability]="row.capability"
                          [version]="row.binding.version"
                          [registry]="registry()"
                        />
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        }
      }
    </section>

    <ng-template #modelCell let-m>
      @if (m.model) {
        <div class="flex flex-wrap items-center gap-2">
          <span>{{ m.model.displayName }}</span>
          @if (m.model.status !== 'active') {
            <p-tag
              [severity]="m.model.status === 'disabled' ? 'danger' : 'warn'"
              [value]="'ai.models.status.' + m.model.status | transloco"
            />
          }
        </div>
        <div class="text-muted-color font-mono text-xs">
          {{ m.provider?.code ?? m.model.providerCode
          }}{{ m.provider ? ' · ' + m.provider.region : '' }}
        </div>
      } @else {
        <span class="text-muted-color font-mono text-xs" data-testid="binding-model-id">{{
          m.id
        }}</span>
      }
    </ng-template>

    @if (registry(); as registry) {
      <app-binding-dialog
        [(visible)]="dialogOpen"
        [row]="editing()"
        [registry]="registry"
        (done)="saved()"
      />
    }
  `,
})
export class AgentBindingsPage {
  protected readonly data = inject(AgentBindingsData);
  private readonly lang = inject(LanguageService).current;

  protected readonly registry = computed(() => {
    const registry = this.data.registry();
    return registry.kind === 'ready' ? registry.value : null;
  });
  /** The pickers need the registry; without it editing waits. */
  protected readonly canEdit = computed(() => this.registry() !== null);

  protected readonly editing = signal<AgentBindingRow | null>(null);
  protected readonly dialogOpen = signal(false);
  private readonly open = signal<ReadonlySet<string>>(new Set());

  protected moment(iso: string): string {
    return formatMoment(iso, this.lang());
  }

  protected isOpen(capability: string): boolean {
    return this.open().has(capability);
  }

  protected toggle(capability: string): void {
    const next = new Set(this.open());
    if (!next.delete(capability)) next.add(capability);
    this.open.set(next);
  }

  protected edit(row: AgentBindingRow): void {
    this.editing.set(row);
    this.dialogOpen.set(true);
  }

  /** A write bumps the version; the list (and an unfolded history) read it again. */
  protected saved(): void {
    this.data.reloadBindings();
  }

  protected refresh(): void {
    this.data.reloadBindings();
    this.data.reloadRegistry();
  }
}
