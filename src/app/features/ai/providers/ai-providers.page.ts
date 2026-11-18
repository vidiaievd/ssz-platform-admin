import { Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { AiApi } from '../../../api/ai/ai-api';
import {
  adminBreakersReset,
  adminRegistrySetModelStatus,
  adminRegistrySetProviderEnabled,
} from '../../../api/ai/functions';
import { BreakerRowDto } from '../../../api/ai/models/breaker-row-dto';
import { ModelResponseDto } from '../../../api/ai/models/model-response-dto';
import { ProviderResponseDto } from '../../../api/ai/models/provider-response-dto';
import { SetModelStatusResponseDto } from '../../../api/ai/models/set-model-status-response-dto';
import { SetProviderEnabledResponseDto } from '../../../api/ai/models/set-provider-enabled-response-dto';
import { IfLevelDirective } from '../../../core/auth/if-level.directive';
import { LanguageService } from '../../../core/i18n/language.service';
import { ReasonDialog } from '../../../shared/reason-dialog/reason-dialog';
import { formatMoment } from '../../schools/card/journal/journal-format';
import { formatMoney } from '../spend/spend-model';
import { AiProvidersData } from './ai-providers.data';
import { ModelPrices } from './model-prices';
import { ModelTestDialog } from './model-test-dialog';
import { ModelRow, ModelStatus, canReset, priceLines, testBlock } from './provider-cards';

/** The statuses a model can be given, in the order the dialog offers them. */
const MODEL_STATUSES: readonly ModelStatus[] = ['active', 'deprecated', 'disabled'];

/** What a switch left without a model, as the server answered it. */
interface StrandedNotice {
  readonly subject: string;
  readonly capabilities: readonly string[];
}

/**
 * `/ai/providers` — "AI → Providers" (plan 90, phase 7, step 14): a card per provider of
 * ai-service's registry — adapter, region, whether its key is present (and which variables are
 * missing), the switch — with its models inside: modality, status, the price in effect and its
 * history, the breaker, the agents that call it, and a test call.
 *
 * Levels: switching a provider and a model's status — `super`; resetting a breaker and testing —
 * `admin`; reading — everyone. Each switch warns which agents it would leave with no model (worked
 * out from the breaker board's bindings) and, after it, shows what the server answered.
 */
@Component({
  selector: 'app-ai-providers-page',
  providers: [AiProvidersData],
  imports: [
    NgTemplateOutlet,
    FormsModule,
    TranslocoPipe,
    ButtonDirective,
    Skeleton,
    Tag,
    IfLevelDirective,
    ReasonDialog,
    ModelPrices,
    ModelTestDialog,
  ],
  template: `
    <section class="flex flex-col gap-3" data-testid="ai-providers">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-base font-semibold">{{ 'ai.providers.title' | transloco }}</h2>
        <button
          pButton
          type="button"
          size="small"
          severity="secondary"
          [text]="true"
          class="ml-auto"
          data-testid="providers-refresh"
          (click)="data.reloadAll()"
        >
          <i class="pi pi-refresh" aria-hidden="true"></i>
          {{ 'ai.providers.refresh' | transloco }}
        </button>
      </div>
      <p class="text-muted-color text-sm">{{ 'ai.providers.hint' | transloco }}</p>

      @switch (data.board().kind) {
        @case ('error') {
          <p class="text-sm" role="alert" data-testid="breakers-failed">
            {{ 'ai.providers.breakersFailed' | transloco }} ·
            <button type="button" class="text-primary underline" (click)="data.reloadBreakers()">
              {{ 'schools.retry' | transloco }}
            </button>
          </p>
        }
        @case ('ready') {
          @if (boardSettings(); as s) {
            <p class="text-muted-color text-xs" data-testid="breaker-settings">
              {{
                'ai.providers.breaker.settings'
                  | transloco
                    : {
                        failures: s.failures,
                        window: s.windowMs / 1000,
                        open: s.openMs / 1000,
                      }
              }}
            </p>
          }
          @if (!storeAvailable()) {
            <div
              role="status"
              class="flex items-center gap-2 rounded-md border border-amber-300 px-3 py-2 text-sm dark:border-amber-700"
              data-testid="breakers-store-down"
            >
              <i class="pi pi-exclamation-triangle text-amber-500" aria-hidden="true"></i>
              {{ 'ai.providers.breaker.storeDown' | transloco }}
            </div>
          }
        }
      }

      @if (data.models().kind === 'error') {
        <p class="text-sm" role="alert" data-testid="models-failed">
          {{ 'ai.providers.modelsFailed' | transloco }} ·
          <button type="button" class="text-primary underline" (click)="data.reloadModels()">
            {{ 'schools.retry' | transloco }}
          </button>
        </p>
      }

      @if (stranded(); as notice) {
        <div
          role="alert"
          class="flex items-start gap-2 rounded-md border border-red-300 px-3 py-2 text-sm dark:border-red-800"
          data-testid="stranded-notice"
        >
          <i class="pi pi-exclamation-triangle mt-0.5 text-red-500" aria-hidden="true"></i>
          <span class="flex-1">
            {{ 'ai.providers.stranded.after' | transloco: { subject: notice.subject } }}
            <span class="font-mono">{{ notice.capabilities.join(', ') }}</span>
          </span>
          <button
            type="button"
            class="text-muted-color"
            [attr.aria-label]="'ai.providers.stranded.dismiss' | transloco"
            data-testid="stranded-dismiss"
            (click)="stranded.set(null)"
          >
            <i class="pi pi-times" aria-hidden="true"></i>
          </button>
        </div>
      }

      @switch (data.providers().kind) {
        @case ('loading') {
          <p-skeleton height="12rem" />
        }
        @case ('error') {
          <p class="text-sm" role="alert" data-testid="providers-failed">
            {{ 'ai.providers.failed' | transloco }} ·
            <button type="button" class="text-primary underline" (click)="data.reloadProviders()">
              {{ 'schools.retry' | transloco }}
            </button>
          </p>
        }
        @default {
          @if (data.cards().length === 0) {
            <p class="text-muted-color text-sm" data-testid="providers-empty">
              {{ 'ai.providers.empty' | transloco }}
            </p>
          }
          @for (card of data.cards(); track card.provider.id) {
            <article
              class="border-border flex flex-col gap-3 rounded-lg border p-4"
              [class.opacity-80]="!card.provider.enabled"
              [attr.data-provider]="card.provider.code"
              data-testid="provider-card"
            >
              <header class="flex flex-wrap items-start gap-3">
                <div class="flex min-w-0 flex-1 flex-col gap-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-base font-semibold">{{ card.provider.displayName }}</h3>
                    <span class="text-muted-color font-mono text-xs">{{ card.provider.code }}</span>
                    <p-tag severity="secondary" [value]="card.provider.kind" />
                    <p-tag
                      severity="secondary"
                      [value]="'ai.providers.region.' + card.provider.region | transloco"
                    />
                    <p-tag
                      data-testid="provider-state"
                      [severity]="card.provider.enabled ? 'success' : 'danger'"
                      [value]="
                        (card.provider.enabled ? 'ai.models.on' : 'ai.models.off') | transloco
                      "
                    />
                  </div>
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    @if (card.provider.configured) {
                      <span class="text-green-700 dark:text-green-400" data-testid="provider-key">
                        <i class="pi pi-check-circle" aria-hidden="true"></i>
                        {{ 'ai.providers.key.present' | transloco }}
                      </span>
                    } @else {
                      <span class="text-red-600 dark:text-red-400" data-testid="provider-key">
                        <i class="pi pi-times-circle" aria-hidden="true"></i>
                        {{ 'ai.providers.key.missing' | transloco }}:
                        <span class="font-mono">{{ card.provider.missing.join(', ') }}</span>
                      </span>
                    }
                    @if (card.provider.credentialRef) {
                      <span class="text-muted-color">
                        {{ 'ai.providers.key.variable' | transloco }}
                        <span class="font-mono">{{ card.provider.credentialRef }}</span>
                      </span>
                    }
                    @if (card.provider.baseUrl) {
                      <span class="text-muted-color font-mono break-all">{{
                        card.provider.baseUrl
                      }}</span>
                    }
                    @if (card.provider.apiVersion) {
                      <span class="text-muted-color font-mono"
                        >api {{ card.provider.apiVersion }}</span
                      >
                    }
                  </div>
                </div>
                <button
                  *appIfLevel="'super'"
                  pButton
                  type="button"
                  size="small"
                  [severity]="card.provider.enabled ? 'danger' : 'secondary'"
                  [outlined]="true"
                  [disabled]="!card.provider.enabled && !card.provider.configured"
                  [attr.title]="
                    !card.provider.enabled && !card.provider.configured
                      ? ('ai.providers.toggle.needsKey' | transloco)
                      : null
                  "
                  data-testid="provider-toggle"
                  (click)="askToggle(card.provider)"
                >
                  {{
                    (card.provider.enabled ? 'ai.providers.toggle.off' : 'ai.providers.toggle.on')
                      | transloco
                  }}
                </button>
              </header>

              @if (card.models === null) {
                @if (data.models().kind === 'loading') {
                  <p-skeleton height="4rem" />
                }
              } @else if (card.models.length === 0) {
                <p class="text-muted-color text-sm" data-testid="provider-no-models">
                  {{ 'ai.providers.noModels' | transloco }}
                </p>
              } @else {
                <div class="relative overflow-x-auto">
                  <!-- Fixed columns: every card's table lines up with the others. -->
                  <table
                    class="w-full min-w-[56rem] table-fixed text-sm"
                    data-testid="provider-models"
                  >
                    <colgroup>
                      <col class="w-[30%]" />
                      <col class="w-[10%]" />
                      <col class="w-[20%]" />
                      <col class="w-[16%]" />
                      <col class="w-[24%]" />
                    </colgroup>
                    <thead class="text-muted-color text-left">
                      <tr>
                        <th class="py-1 pr-4 font-medium">
                          {{ 'ai.providers.col.model' | transloco }}
                        </th>
                        <th class="py-1 pr-4 font-medium">
                          {{ 'ai.providers.col.status' | transloco }}
                        </th>
                        <th class="py-1 pr-4 font-medium">
                          {{ 'ai.providers.col.price' | transloco }}
                        </th>
                        <th class="py-1 pr-4 font-medium">
                          {{ 'ai.providers.col.breaker' | transloco }}
                        </th>
                        <th class="py-1">
                          <span class="sr-only">{{ 'schools.plan.actions' | transloco }}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of card.models; track row.model.id) {
                        <tr
                          class="border-border border-t align-top"
                          [attr.data-model]="row.model.providerModelId"
                          data-testid="model-row"
                        >
                          <td class="py-2 pr-4">
                            <div class="flex flex-wrap items-center gap-2">
                              <span class="font-medium">{{ row.model.displayName }}</span>
                              <p-tag severity="secondary" [value]="row.model.modality" />
                            </div>
                            <div class="text-muted-color font-mono text-xs">
                              {{ row.model.providerModelId }}
                            </div>
                            @if (row.breaker && row.breaker.bindings.length > 0) {
                              <div class="text-muted-color text-xs" data-testid="model-bindings">
                                {{ 'ai.providers.usedBy' | transloco }}
                                @for (
                                  b of row.breaker.bindings;
                                  track b.capability;
                                  let last = $last
                                ) {
                                  <span class="font-mono" [class.line-through]="!b.enabled">{{
                                    b.capability
                                  }}</span>
                                  ({{ 'ai.spend.role.' + b.role | transloco }}){{ last ? '' : ',' }}
                                }
                              </div>
                            }
                          </td>
                          <td class="py-2 pr-4" data-testid="model-status">
                            <p-tag
                              [severity]="statusSeverity(row.model.status)"
                              [value]="'ai.models.status.' + row.model.status | transloco"
                            />
                          </td>
                          <td class="py-2 pr-4 text-xs tabular-nums" data-testid="model-price">
                            @if (row.model.currentPrice; as price) {
                              @for (line of currentPrice(row.model); track line.unit) {
                                <div>
                                  {{
                                    'ai.providers.price.' + line.unit
                                      | transloco: { amount: line.amount }
                                  }}
                                </div>
                              }
                            } @else {
                              <span class="text-amber-700 dark:text-amber-400">
                                {{ 'ai.providers.price.none' | transloco }}
                              </span>
                            }
                          </td>
                          <td class="py-2 pr-4 text-xs" data-testid="model-breaker">
                            @if (row.breaker; as b) {
                              @switch (b.state) {
                                @case ('open') {
                                  <p-tag
                                    severity="danger"
                                    [value]="'ai.providers.breaker.open' | transloco"
                                  />
                                  @if (b.reopensAt) {
                                    <div class="mt-1 tabular-nums">
                                      {{
                                        'ai.providers.breaker.until'
                                          | transloco: { moment: moment(b.reopensAt) }
                                      }}
                                    </div>
                                  }
                                }
                                @case ('unknown') {
                                  <p-tag
                                    severity="warn"
                                    [value]="'ai.providers.breaker.unknown' | transloco"
                                  />
                                }
                                @default {
                                  <span class="text-muted-color">{{
                                    'ai.providers.breaker.closed' | transloco
                                  }}</span>
                                }
                              }
                              @if (b.recentFailures) {
                                <div class="mt-1 tabular-nums" data-testid="model-breaker-failures">
                                  {{
                                    'ai.providers.breaker.failures'
                                      | transloco
                                        : {
                                            count: b.recentFailures,
                                            max: boardSettings()?.failures ?? '—',
                                          }
                                  }}
                                </div>
                              }
                            } @else {
                              <span class="text-muted-color">—</span>
                            }
                          </td>
                          <td class="py-2 text-right whitespace-nowrap">
                            <div class="flex flex-wrap justify-end gap-1">
                              <button
                                *appIfLevel="'super'"
                                pButton
                                type="button"
                                size="small"
                                severity="secondary"
                                data-testid="model-status-change"
                                (click)="askStatus(row.model)"
                              >
                                {{ 'ai.providers.status.change' | transloco }}
                              </button>
                              @if (canReset(row.breaker)) {
                                <button
                                  *appIfLevel="'admin'"
                                  pButton
                                  type="button"
                                  size="small"
                                  severity="secondary"
                                  data-testid="breaker-reset"
                                  (click)="askReset(row.breaker!)"
                                >
                                  {{ 'ai.providers.breaker.reset' | transloco }}
                                </button>
                              }
                              <button
                                *appIfLevel="'admin'"
                                pButton
                                type="button"
                                size="small"
                                severity="secondary"
                                [disabled]="!!testBlock(row, card.provider)"
                                [attr.title]="
                                  testBlock(row, card.provider)
                                    ? ('ai.providers.test.blocked.' + testBlock(row, card.provider)
                                      | transloco)
                                    : null
                                "
                                data-testid="model-test"
                                (click)="askTest(row.model)"
                              >
                                {{ 'ai.providers.test.button' | transloco }}
                              </button>
                              <button
                                pButton
                                type="button"
                                size="small"
                                severity="secondary"
                                [text]="true"
                                [attr.aria-expanded]="isOpen(row.model.id)"
                                data-testid="model-prices-toggle"
                                (click)="toggle(row.model.id)"
                              >
                                {{ 'ai.providers.prices.toggle' | transloco }}
                                <i
                                  class="pi"
                                  [class.pi-chevron-down]="!isOpen(row.model.id)"
                                  [class.pi-chevron-up]="isOpen(row.model.id)"
                                  aria-hidden="true"
                                ></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                        @if (isOpen(row.model.id)) {
                          <tr class="bg-surface-50 dark:bg-surface-900">
                            <td colspan="5" class="px-3 py-2">
                              <app-model-prices
                                [modelId]="row.model.id"
                                [modality]="row.model.modality"
                              />
                            </td>
                          </tr>
                        }
                      }
                    </tbody>
                  </table>
                </div>
              }
            </article>
          }
        }
      }
    </section>

    <app-reason-dialog
      [(visible)]="toggleOpen"
      [header]="
        (togglingOn() ? 'ai.providers.toggle.titleOn' : 'ai.providers.toggle.titleOff')
          | transloco: { provider: toggling()?.displayName ?? '' }
      "
      [confirmLabel]="
        (togglingOn() ? 'ai.providers.toggle.on' : 'ai.providers.toggle.off') | transloco
      "
      level="super"
      [danger]="!togglingOn()"
      [action]="toggleProvider"
      (done)="toggled($event)"
    >
      <p class="text-sm">
        {{
          (togglingOn() ? 'ai.providers.toggle.explainOn' : 'ai.providers.toggle.explainOff')
            | transloco
        }}
      </p>
      <ng-container *ngTemplateOutlet="preflight; context: { $implicit: toggleStranded() }" />
    </app-reason-dialog>

    <app-reason-dialog
      [(visible)]="statusOpen"
      [header]="
        'ai.providers.status.title' | transloco: { model: statusModel()?.displayName ?? '' }
      "
      [confirmLabel]="'ai.providers.status.confirm' | transloco"
      level="super"
      [danger]="statusChoice() === 'disabled'"
      [ready]="statusChoice() !== statusModel()?.status"
      [action]="setStatus"
      (done)="statusSet($event)"
    >
      <fieldset class="flex flex-col gap-2" data-testid="model-status-options">
        <legend class="mb-1 text-sm font-medium">
          {{ 'ai.providers.col.status' | transloco }}
        </legend>
        @for (status of statuses; track status) {
          <label class="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="model-status"
              class="mt-1"
              [value]="status"
              [ngModel]="statusChoice()"
              (ngModelChange)="statusChoice.set($event)"
              [attr.data-testid]="'model-status-' + status"
            />
            <span>
              <span class="font-medium">{{ 'ai.models.status.' + status | transloco }}</span>
              @if (status === statusModel()?.status) {
                <span class="text-muted-color"
                  >· {{ 'ai.providers.status.current' | transloco }}</span
                >
              }
              <span class="text-muted-color block text-xs">
                {{ 'ai.providers.status.explain.' + status | transloco }}
              </span>
            </span>
          </label>
        }
      </fieldset>
      @if (statusChoice() === statusModel()?.status) {
        <p class="text-muted-color text-xs" data-testid="model-status-same">
          {{ 'ai.providers.status.same' | transloco }}
        </p>
      }
      <ng-container *ngTemplateOutlet="preflight; context: { $implicit: statusStranded() }" />
    </app-reason-dialog>

    <app-reason-dialog
      [(visible)]="resetOpen"
      [header]="
        'ai.providers.breaker.resetTitle' | transloco: { model: resetting()?.displayName ?? '' }
      "
      [confirmLabel]="'ai.providers.breaker.reset' | transloco"
      level="admin"
      [action]="resetBreaker"
      (done)="data.reloadBreakers()"
    >
      <p class="text-sm">{{ 'ai.providers.breaker.resetExplain' | transloco }}</p>
    </app-reason-dialog>

    <app-model-test-dialog [(visible)]="testOpen" [target]="testing()" />

    <ng-template #preflight let-stranded>
      @if (stranded === null) {
        <p class="text-muted-color text-xs" data-testid="preflight-unknown">
          {{ 'ai.providers.stranded.unknown' | transloco }}
        </p>
      } @else if (stranded.length > 0) {
        <div
          role="alert"
          class="flex flex-col gap-1 rounded-md border border-amber-300 px-3 py-2 text-sm dark:border-amber-700"
          data-testid="preflight-stranded"
        >
          <span class="flex items-center gap-2">
            <i class="pi pi-exclamation-triangle text-amber-500" aria-hidden="true"></i>
            {{ 'ai.providers.stranded.before' | transloco: { count: stranded.length } }}
          </span>
          <span class="font-mono text-xs">{{ stranded.join(', ') }}</span>
        </div>
      }
    </ng-template>
  `,
})
export class AiProvidersPage {
  protected readonly data = inject(AiProvidersData);
  private readonly ai = inject(AiApi);
  private readonly lang = inject(LanguageService).current;

  protected readonly statuses = MODEL_STATUSES;
  protected readonly canReset = canReset;

  protected readonly boardSettings = computed(() => {
    const board = this.data.board();
    return board.kind === 'ready' ? board.value.settings : null;
  });
  protected readonly storeAvailable = computed(() => {
    const board = this.data.board();
    return board.kind !== 'ready' || board.value.storeAvailable;
  });

  /** What the last switch left without a model, as the server answered. */
  protected readonly stranded = signal<StrandedNotice | null>(null);

  // Provider switch.
  protected readonly toggleOpen = signal(false);
  protected readonly toggling = signal<ProviderResponseDto | null>(null);
  protected readonly togglingOn = computed(() => !this.toggling()?.enabled);
  protected readonly toggleStranded = computed(() => {
    const provider = this.toggling();
    if (!provider) return [];
    return this.data.strandedBy({
      kind: 'provider',
      providerId: provider.id,
      enabled: !provider.enabled,
    });
  });

  // Model status.
  protected readonly statusOpen = signal(false);
  protected readonly statusModel = signal<ModelResponseDto | null>(null);
  protected readonly statusChoice = signal<ModelStatus>('active');
  protected readonly statusStranded = computed(() => {
    const model = this.statusModel();
    if (!model || this.statusChoice() === model.status) return [];
    return this.data.strandedBy({ kind: 'model', modelId: model.id, status: this.statusChoice() });
  });

  // Breaker reset and test.
  protected readonly resetOpen = signal(false);
  protected readonly resetting = signal<BreakerRowDto | null>(null);
  protected readonly testOpen = signal(false);
  protected readonly testing = signal<ModelResponseDto | null>(null);

  private readonly open = signal<ReadonlySet<string>>(new Set());

  protected moment(iso: string): string {
    return formatMoment(iso, this.lang());
  }

  protected statusSeverity(status: ModelStatus): 'success' | 'warn' | 'danger' {
    return status === 'active' ? 'success' : status === 'deprecated' ? 'warn' : 'danger';
  }

  protected currentPrice(model: ModelResponseDto) {
    const price = model.currentPrice;
    if (!price) return [];
    return priceLines(price, model.modality).map((line) => ({
      unit: line.unit,
      amount: formatMoney(line.micros, price.currency, this.lang()),
    }));
  }

  protected testBlock(row: ModelRow, provider: ProviderResponseDto) {
    return testBlock(row.model, provider);
  }

  protected isOpen(modelId: string): boolean {
    return this.open().has(modelId);
  }

  protected toggle(modelId: string): void {
    const next = new Set(this.open());
    if (!next.delete(modelId)) next.add(modelId);
    this.open.set(next);
  }

  protected askToggle(provider: ProviderResponseDto): void {
    this.toggling.set(provider);
    this.toggleOpen.set(true);
  }

  protected readonly toggleProvider = (reason: string) => {
    const provider = this.toggling()!;
    return this.ai.invoke(adminRegistrySetProviderEnabled, {
      id: provider.id,
      body: { enabled: !provider.enabled, reason },
    });
  };

  protected toggled(answer: SetProviderEnabledResponseDto): void {
    this.notice(answer.displayName, answer.strandedCapabilities);
    this.data.reloadAll();
  }

  protected askStatus(model: ModelResponseDto): void {
    this.statusModel.set(model);
    this.statusChoice.set(model.status);
    this.statusOpen.set(true);
  }

  protected readonly setStatus = (reason: string) => {
    const model = this.statusModel()!;
    return this.ai.invoke(adminRegistrySetModelStatus, {
      id: model.id,
      body: { status: this.statusChoice(), reason },
    });
  };

  protected statusSet(answer: SetModelStatusResponseDto): void {
    this.notice(answer.displayName, answer.strandedCapabilities);
    this.data.reloadModels();
    this.data.reloadBreakers();
  }

  protected askReset(breaker: BreakerRowDto): void {
    this.resetting.set(breaker);
    this.resetOpen.set(true);
  }

  protected readonly resetBreaker = (reason: string) =>
    this.ai.invoke(adminBreakersReset, { modelId: this.resetting()!.modelId, body: { reason } });

  protected askTest(model: ModelResponseDto): void {
    this.testing.set(model);
    this.testOpen.set(true);
  }

  private notice(subject: string, capabilities: readonly string[]): void {
    this.stranded.set(capabilities.length > 0 ? { subject, capabilities } : null);
  }
}
