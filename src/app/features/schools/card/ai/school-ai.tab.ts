import { Component, computed, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { adminAccountsRevokeGrant } from '../../../../api/subscription/functions';
import { GrantResponseDto } from '../../../../api/subscription/models/grant-response-dto';
import { SubscriptionApi } from '../../../../api/subscription/subscription-api';
import { IfLevelDirective } from '../../../../core/auth/if-level.directive';
import { LanguageService } from '../../../../core/i18n/language.service';
import { LocalDatePipe } from '../../../../shared/local-date.pipe';
import { ReasonDialog } from '../../../../shared/reason-dialog/reason-dialog';
import { GrantDialog } from '../plan/grant-dialog';
import { PAYER_TYPE } from '../plan/school-plan.data';
import { AiKeyRow, formatCredits, usedPercent } from './ai-key-rows';
import { PolicyDialog } from './policy-dialog';
import { SchoolAiData } from './school-ai.data';

const SOURCE_SEVERITY = {
  plan: 'secondary',
  grant_on: 'success',
  grant_off: 'warn',
  none: 'secondary',
} as const;

/**
 * "AI & services" tab of the school card (plan 90, phase 3, step 10): every AI key as the gate
 * reads it, where its state comes from (plan or grant) and what the period has spent; switching a
 * key on or off is a grant with the key preset (§6.3, decision 1), and a key off by a grant comes
 * back by revoking that grant. The payer policy (all AI, regions) changes with a reason. The
 * school's own AI and review settings are shown read only — the school changes them.
 */
@Component({
  selector: 'app-school-ai-tab',
  providers: [SchoolAiData],
  imports: [
    TranslocoPipe,
    ButtonDirective,
    Skeleton,
    Tag,
    IfLevelDirective,
    LocalDatePipe,
    ReasonDialog,
    GrantDialog,
    PolicyDialog,
  ],
  template: `
    <div class="flex flex-col gap-4" data-testid="school-ai">
      <!-- AI keys -->
      <section
        class="border-border flex flex-col gap-3 rounded-md border p-4"
        data-testid="ai-keys"
      >
        <h2 class="text-base font-semibold">{{ 'schools.ai.keys' | transloco }}</h2>

        @if (policyOff()) {
          <p
            class="flex items-center gap-2 rounded-md border border-amber-300 px-3 py-2 text-sm dark:border-amber-800"
            data-testid="ai-policy-off"
          >
            <i class="pi pi-ban text-amber-500" aria-hidden="true"></i>
            {{ 'schools.ai.policyOffBanner' | transloco }}
          </p>
        }

        @switch (data.usage().kind) {
          @case ('loading') {
            <p-skeleton height="8rem" />
          }
          @case ('error') {
            <p class="text-sm" role="alert" data-testid="ai-keys-failed">
              {{ 'schools.ai.usageFailed' | transloco }} ·
              <button type="button" class="text-primary underline" (click)="data.reloadUsage()">
                {{ 'schools.retry' | transloco }}
              </button>
            </p>
          }
          @default {
            @if (data.grantsFailed()) {
              <p class="text-muted-color text-sm" data-testid="ai-grants-failed">
                {{ 'schools.ai.grantsFailed' | transloco }} ·
                <button type="button" class="text-primary underline" (click)="data.reloadGrants()">
                  {{ 'schools.retry' | transloco }}
                </button>
              </p>
            }
            <div class="overflow-x-auto">
              <table class="w-full min-w-[46rem] text-sm" data-testid="ai-keys-table">
                <thead class="text-muted-color text-left">
                  <tr>
                    <th class="py-1 pr-4 font-medium">{{ 'schools.plan.key' | transloco }}</th>
                    <th class="py-1 pr-4 font-medium">{{ 'schools.ai.state' | transloco }}</th>
                    <th class="py-1 pr-4 font-medium">{{ 'schools.ai.source' | transloco }}</th>
                    <th class="py-1 pr-4 font-medium">{{ 'schools.ai.used' | transloco }}</th>
                    <th class="py-1 pr-4 font-medium">{{ 'schools.ai.periodEnd' | transloco }}</th>
                    <th class="py-1">
                      <span class="sr-only">{{ 'schools.plan.actions' | transloco }}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of data.rows(); track row.usage.feature) {
                    <tr class="border-border border-t align-top" data-testid="ai-key-row">
                      <td class="py-1.5 pr-4 font-mono text-xs">{{ row.usage.feature }}</td>
                      <td class="py-1.5 pr-4">
                        <p-tag
                          [severity]="row.usage.enabled ? 'success' : 'secondary'"
                          [value]="
                            'schools.plan.effect.' + (row.usage.enabled ? 'on' : 'off') | transloco
                          "
                        />
                      </td>
                      <td class="py-1.5 pr-4">
                        @if (row.source; as source) {
                          <p-tag
                            [severity]="sourceSeverity[source]"
                            [value]="'schools.ai.sourceKind.' + source | transloco"
                          />
                        } @else {
                          —
                        }
                        @if (row.scheduled; as next) {
                          <div class="text-muted-color mt-1 text-xs" data-testid="ai-key-scheduled">
                            {{
                              (next.enabled ? 'schools.ai.scheduledOn' : 'schools.ai.scheduledOff')
                                | transloco: { date: (next.startsAt | localDate: lang()) }
                            }}
                          </div>
                        }
                      </td>
                      <td class="py-1.5 pr-4 tabular-nums" data-testid="ai-key-used">
                        @if (row.usage.used === null) {
                          —
                        } @else if (row.usage.total === null) {
                          {{
                            'schools.ai.usedUnmetered'
                              | transloco: { used: credits(row.usage.used) }
                          }}
                        } @else {
                          <span [class]="row.overLimit ? 'text-red-600 dark:text-red-400' : ''">
                            {{
                              'schools.ai.usedOf'
                                | transloco
                                  : {
                                      used: credits(row.usage.used),
                                      total: credits(row.usage.total),
                                    }
                            }}
                          </span>
                          <div
                            class="bg-surface-200 dark:bg-surface-700 mt-1 h-1.5 w-28 overflow-hidden rounded-full"
                            role="presentation"
                          >
                            <div
                              class="h-full rounded-full"
                              [class.bg-primary]="!row.overLimit"
                              [class.bg-red-500]="row.overLimit"
                              [style.width.%]="percent(row)"
                            ></div>
                          </div>
                          @if (row.overLimit) {
                            <div class="text-xs text-red-600 dark:text-red-400">
                              {{ 'schools.ai.overLimit' | transloco }}
                            </div>
                          }
                        }
                      </td>
                      <td class="py-1.5 pr-4 whitespace-nowrap">
                        {{ row.usage.periodEnd ? (row.usage.periodEnd | localDate: lang()) : '—' }}
                      </td>
                      <td class="py-1.5 text-right whitespace-nowrap">
                        @switch (row.action) {
                          @case ('switch_off') {
                            <button
                              *appIfLevel="'admin'"
                              pButton
                              type="button"
                              size="small"
                              severity="warn"
                              [text]="true"
                              data-testid="ai-key-switch-off"
                              (click)="openGrant(row.usage.feature, false)"
                            >
                              {{ 'schools.ai.switchOff' | transloco }}
                            </button>
                          }
                          @case ('switch_on') {
                            <button
                              *appIfLevel="'admin'"
                              pButton
                              type="button"
                              size="small"
                              [text]="true"
                              data-testid="ai-key-switch-on"
                              (click)="openGrant(row.usage.feature, true)"
                            >
                              {{ 'schools.ai.switchOn' | transloco }}
                            </button>
                          }
                          @case ('revoke_off') {
                            <button
                              *appIfLevel="'admin'"
                              pButton
                              type="button"
                              size="small"
                              [text]="true"
                              data-testid="ai-key-revoke-off"
                              (click)="revoking.set(row.offGrant)"
                            >
                              {{ 'schools.ai.revokeOff' | transloco }}
                            </button>
                          }
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="text-muted-color text-xs">{{ 'schools.ai.keysHint' | transloco }}</p>
          }
        }
      </section>

      <!-- Payer policy -->
      <section
        class="border-border flex flex-col gap-3 rounded-md border p-4"
        data-testid="ai-policy"
      >
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-base font-semibold">{{ 'schools.ai.policy' | transloco }}</h2>
          @if (data.policy().kind === 'ready') {
            <button
              *appIfLevel="'admin'"
              pButton
              type="button"
              size="small"
              class="ml-auto"
              [outlined]="true"
              data-testid="ai-policy-change"
              (click)="policyOpen.set(true)"
            >
              <i class="pi pi-pencil" aria-hidden="true"></i>
              {{ 'schools.ai.changePolicy' | transloco }}
            </button>
          }
        </div>
        @switch (data.policy().kind) {
          @case ('loading') {
            <p-skeleton width="20rem" height="3rem" />
          }
          @case ('error') {
            <p class="text-sm" role="alert" data-testid="ai-policy-failed">
              {{ 'schools.ai.policyFailed' | transloco }} ·
              <button type="button" class="text-primary underline" (click)="data.reloadPolicy()">
                {{ 'schools.retry' | transloco }}
              </button>
            </p>
          }
          @default {
            @if (policy(); as p) {
              <dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
                <dt class="text-muted-color">{{ 'schools.ai.allAi' | transloco }}</dt>
                <dd data-testid="ai-policy-enabled">
                  <p-tag
                    [severity]="p.aiEnabled ? 'success' : 'danger'"
                    [value]="'schools.plan.effect.' + (p.aiEnabled ? 'on' : 'off') | transloco"
                  />
                </dd>
                <dt class="text-muted-color">{{ 'schools.ai.regions' | transloco }}</dt>
                <dd data-testid="ai-policy-regions">
                  @if (p.allowedRegions; as regions) {
                    @for (r of regions; track r; let last = $last) {
                      {{ 'schools.ai.region.' + r | transloco }}{{ last ? '' : ', ' }}
                    }
                  } @else {
                    {{ 'schools.ai.anyRegion' | transloco }}
                  }
                </dd>
                <dt class="text-muted-color">{{ 'schools.ai.policySource' | transloco }}</dt>
                <dd data-testid="ai-policy-stored">
                  @if (p.stored) {
                    {{
                      'schools.ai.storedAt' | transloco: { date: (p.updatedAt | localDate: lang()) }
                    }}
                    @if (p.updatedBy) {
                      <span class="text-muted-color font-mono text-xs">{{ p.updatedBy }}</span>
                    }
                  } @else {
                    {{ 'schools.ai.policyDefault' | transloco }}
                  }
                </dd>
              </dl>
            }
          }
        }
      </section>

      <!-- School settings, read only -->
      <section
        class="border-border flex flex-col gap-3 rounded-md border p-4"
        data-testid="ai-settings"
      >
        <div class="flex flex-col gap-1">
          <h2 class="text-base font-semibold">{{ 'schools.ai.settings' | transloco }}</h2>
          <p class="text-muted-color text-xs">{{ 'schools.ai.settingsHint' | transloco }}</p>
        </div>
        @switch (data.settings().kind) {
          @case ('loading') {
            <p-skeleton height="6rem" />
          }
          @case ('error') {
            <p class="text-sm" role="alert" data-testid="ai-settings-failed">
              {{ 'schools.ai.settingsFailed' | transloco }} ·
              <button type="button" class="text-primary underline" (click)="data.reloadSettings()">
                {{ 'schools.retry' | transloco }}
              </button>
            </p>
          }
          @default {
            @if (settings(); as s) {
              <div class="grid gap-3 md:grid-cols-2">
                <div class="flex flex-col gap-2" data-testid="settings-precheck">
                  <h3 class="text-sm font-medium">{{ 'schools.ai.precheck.title' | transloco }}</h3>
                  <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                    <dt class="text-muted-color">
                      {{ 'schools.ai.precheck.enabled' | transloco }}
                    </dt>
                    <dd>
                      {{
                        'schools.plan.effect.' + (s.aiPrecheck.enabled ? 'on' : 'off') | transloco
                      }}
                    </dd>
                    <dt class="text-muted-color">
                      {{ 'schools.ai.precheck.perExercise' | transloco }}
                    </dt>
                    <dd class="tabular-nums">
                      {{ s.aiPrecheck.perExerciseLimit ?? ('schools.ai.noLimit' | transloco) }}
                    </dd>
                    <dt class="text-muted-color">
                      {{ 'schools.ai.precheck.perLearner' | transloco }}
                    </dt>
                    <dd class="tabular-nums">
                      {{
                        s.aiPrecheck.perLearnerMonthlyCredits ?? ('schools.ai.noLimit' | transloco)
                      }}
                    </dd>
                  </dl>
                </div>

                <div class="flex flex-col gap-2" data-testid="settings-assistant">
                  <h3 class="text-sm font-medium">
                    {{ 'schools.ai.assistant.title' | transloco }}
                  </h3>
                  <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                    <dt class="text-muted-color">{{ 'schools.ai.assistant.mode' | transloco }}</dt>
                    <dd>
                      {{ 'schools.ai.assistant.modes.' + s.assistant.mode | transloco }}
                      @if (s.assistant.mode === 'selected_groups') {
                        ({{
                          'schools.ai.assistant.groups'
                            | transloco: { n: s.assistant.groupIds.length }
                        }})
                      } @else if (s.assistant.mode === 'selected_students') {
                        ({{
                          'schools.ai.assistant.students'
                            | transloco: { n: s.assistant.studentIds.length }
                        }})
                      }
                    </dd>
                  </dl>
                </div>

                <div class="flex flex-col gap-2" data-testid="settings-review-ai">
                  <h3 class="text-sm font-medium">{{ 'schools.ai.reviewAi.title' | transloco }}</h3>
                  <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                    <dt class="text-muted-color">{{ 'schools.ai.reviewAi.mode' | transloco }}</dt>
                    <dd>{{ 'schools.ai.reviewAi.modes.' + s.reviewAi.mode | transloco }}</dd>
                    @if (s.reviewAi.mode === 'ai_with_sampling') {
                      <dt class="text-muted-color">
                        {{ 'schools.ai.reviewAi.sample' | transloco }}
                      </dt>
                      <dd class="tabular-nums">{{ s.reviewAi.samplePercent }} %</dd>
                    }
                    @if (s.reviewAi.mode !== 'teacher_only') {
                      <dt class="text-muted-color">
                        {{ 'schools.ai.reviewAi.autoAccept' | transloco }}
                      </dt>
                      <dd class="tabular-nums">
                        {{ 'schools.ai.hours' | transloco: { n: s.reviewAi.autoAcceptAfterHours } }}
                      </dd>
                    }
                  </dl>
                </div>

                <div class="flex flex-col gap-2" data-testid="settings-review">
                  <h3 class="text-sm font-medium">{{ 'schools.ai.review.title' | transloco }}</h3>
                  <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                    <dt class="text-muted-color">{{ 'schools.ai.review.respond' | transloco }}</dt>
                    <dd class="tabular-nums">
                      {{ 'schools.ai.hours' | transloco: { n: s.review.respondWithinHours } }}
                    </dd>
                    <dt class="text-muted-color">{{ 'schools.ai.review.escalate' | transloco }}</dt>
                    <dd>
                      {{ 'schools.ai.hours' | transloco: { n: s.review.escalateAfterHours } }}
                      → {{ 'schools.ai.review.escalateTo.' + s.review.escalateTo | transloco }}
                    </dd>
                  </dl>
                </div>
              </div>
            }
          }
        }
      </section>
    </div>

    @if (schoolId(); as schoolId) {
      <app-grant-dialog
        [(visible)]="grantOpen"
        [payerId]="schoolId"
        [presetKey]="grantKey()"
        [presetEnabled]="grantEnabled()"
        (done)="data.afterGrantChange()"
      />
      <app-policy-dialog
        [(visible)]="policyOpen"
        [payerId]="schoolId"
        [policy]="policy()"
        (done)="data.reloadPolicy()"
      />
    }

    <app-reason-dialog
      [visible]="revoking() !== null"
      (visibleChange)="$event || revoking.set(null)"
      [header]="'schools.plan.revokeDialog.title' | transloco"
      [confirmLabel]="'schools.plan.revokeDialog.confirm' | transloco"
      level="admin"
      [action]="revoke"
      (done)="data.afterGrantChange()"
    >
      @if (revoking(); as g) {
        <p class="text-sm" data-testid="revoke-text">
          {{ 'schools.plan.revokeDialog.textOff' | transloco: { key: g.featureKey } }}
        </p>
        @if (g.reason) {
          <p class="text-muted-color text-xs" data-testid="revoke-grant-reason">
            {{ 'schools.ai.grantReason' | transloco: { reason: g.reason } }}
          </p>
        }
      }
    </app-reason-dialog>
  `,
})
export class SchoolAiTab {
  protected readonly data = inject(SchoolAiData);
  private readonly subscription = inject(SubscriptionApi);
  protected readonly lang = inject(LanguageService).current;
  protected readonly sourceSeverity = SOURCE_SEVERITY;

  protected readonly schoolId = this.data.card.schoolId;

  protected readonly grantOpen = signal(false);
  protected readonly grantKey = signal<string | null>(null);
  protected readonly grantEnabled = signal(true);
  protected readonly policyOpen = signal(false);
  /** The disabling grant whose revoke dialog is open. */
  protected readonly revoking = signal<GrantResponseDto | null>(null);

  protected readonly policy = computed(() => {
    const policy = this.data.policy();
    return policy.kind === 'ready' ? policy.value : null;
  });
  protected readonly policyOff = computed(() => this.policy()?.aiEnabled === false);
  protected readonly settings = computed(() => {
    const settings = this.data.settings();
    return settings.kind === 'ready' ? settings.value : null;
  });

  protected openGrant(key: string, enabled: boolean): void {
    this.grantKey.set(key);
    this.grantEnabled.set(enabled);
    this.grantOpen.set(true);
  }

  protected readonly revoke = (reason: string) =>
    this.subscription.invoke(adminAccountsRevokeGrant, {
      type: PAYER_TYPE,
      externalId: this.schoolId()!,
      grantId: this.revoking()!.id,
      body: { reason },
    });

  protected credits(value: string | null): string {
    return formatCredits(value, this.lang());
  }

  protected percent(row: AiKeyRow): number {
    return usedPercent(row.usage) ?? 0;
  }
}
