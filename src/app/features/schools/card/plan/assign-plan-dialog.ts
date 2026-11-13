import {
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { adminAccountsAssign } from '../../../../api/subscription/functions';
import { AccountOverviewResponseDto } from '../../../../api/subscription/models/account-overview-response-dto';
import { AssignPlanDto } from '../../../../api/subscription/models/assign-plan-dto';
import { PlanResponseDto } from '../../../../api/subscription/models/plan-response-dto';
import { SubscriptionApi } from '../../../../api/subscription/subscription-api';
import { ReasonDialog } from '../../../../shared/reason-dialog/reason-dialog';
import { ColumnState } from '../../schools-list.data';
import { dayStartUtc, isFutureDay, todayUtc } from './plan-dates';

const STATUSES = ['active', 'trial'] as const;

/**
 * "Change plan" — puts the school on a plan's current version and closes the running
 * subscription. Only plans of the school's audience that are not archived are offered (the
 * server refuses the rest with 422). Choosing the plan the school is already on moves it to the
 * plan's latest version — the tab opens the dialog that way for "move to vN".
 */
@Component({
  selector: 'app-assign-plan-dialog',
  imports: [FormsModule, TranslocoPipe, InputText, Select, SelectButton, ReasonDialog],
  template: `
    <app-reason-dialog
      [(visible)]="visible"
      [header]="'schools.plan.assignDialog.title' | transloco"
      [confirmLabel]="'schools.plan.assignDialog.confirm' | transloco"
      level="admin"
      [ready]="ready()"
      [action]="assign"
      (done)="done.emit($event)"
    >
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium" for="assign-plan">
          {{ 'schools.plan.assignDialog.plan' | transloco }}
        </label>
        @switch (plans().kind) {
          @case ('error') {
            <p class="text-sm" role="alert" data-testid="assign-plans-failed">
              {{ 'schools.plan.assignDialog.plansFailed' | transloco }} ·
              <button type="button" class="text-primary underline" (click)="retryPlans.emit()">
                {{ 'schools.retry' | transloco }}
              </button>
            </p>
          }
          @default {
            <p-select
              inputId="assign-plan"
              class="w-full"
              appendTo="body"
              [options]="options()"
              optionLabel="name"
              optionValue="code"
              [loading]="plans().kind === 'loading'"
              [ngModel]="planCode()"
              (ngModelChange)="planCode.set($event)"
              [ngModelOptions]="{ standalone: true }"
              [placeholder]="'schools.plan.assignDialog.planPlaceholder' | transloco"
              data-testid="assign-plan"
            >
              <ng-template #item let-plan>
                {{ plan.name }}
                <span class="text-muted-color font-mono text-xs">
                  {{ plan.code }} · v{{ plan.current.version }}
                </span>
              </ng-template>
            </p-select>
          }
        }
        @if (sameAsCurrent()) {
          <span class="text-muted-color text-xs" data-testid="assign-same-plan">
            {{ 'schools.plan.assignDialog.samePlan' | transloco: { version: chosenVersion() } }}
          </span>
        }
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-sm font-medium" id="assign-status-label">
          {{ 'schools.plan.assignDialog.status' | transloco }}
        </span>
        <p-selectbutton
          [options]="statuses"
          [allowEmpty]="false"
          [ngModel]="status()"
          (ngModelChange)="status.set($event)"
          [ngModelOptions]="{ standalone: true }"
          ariaLabelledBy="assign-status-label"
          data-testid="assign-status"
        >
          <ng-template #item let-status>
            {{ 'schools.plan.subscriptionStatus.' + status | transloco }}
          </ng-template>
        </p-selectbutton>
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium" for="assign-period-end">
          {{
            (status() === 'trial'
              ? 'schools.plan.assignDialog.trialEnd'
              : 'schools.plan.assignDialog.periodEnd'
            ) | transloco
          }}
        </label>
        <input
          pInputText
          id="assign-period-end"
          type="date"
          class="sm:w-56"
          [min]="today"
          [ngModel]="periodEnd()"
          (ngModelChange)="periodEnd.set($event ?? '')"
          [ngModelOptions]="{ standalone: true }"
          [attr.aria-invalid]="periodInvalid() ? 'true' : null"
          data-testid="assign-period-end"
        />
        @if (periodInvalid()) {
          <span class="text-xs text-red-600 dark:text-red-400" data-testid="assign-period-error">
            {{ 'schools.plan.assignDialog.periodInvalid' | transloco }}
          </span>
        } @else {
          <span class="text-muted-color text-xs">
            {{
              (status() === 'trial'
                ? 'schools.plan.assignDialog.trialHint'
                : 'schools.plan.assignDialog.periodHint'
              ) | transloco
            }}
          </span>
        }
      </div>
    </app-reason-dialog>
  `,
})
export class AssignPlanDialog {
  readonly visible = model(false);
  readonly payerType = input<'workspace' | 'user'>('workspace');
  readonly payerId = input.required<string>();
  /** Plans the payer may be put on (its audience, not archived). */
  readonly plans = input.required<ColumnState<PlanResponseDto[]>>();
  /** The plan the payer is on now; preset on opening. */
  readonly currentCode = input<string | null>(null);
  readonly done = output<AccountOverviewResponseDto>();
  readonly retryPlans = output<void>();

  private readonly subscription = inject(SubscriptionApi);

  protected readonly statuses = [...STATUSES];
  protected readonly today = todayUtc();

  protected readonly planCode = signal<string | null>(null);
  protected readonly status = signal<(typeof STATUSES)[number]>('active');
  protected readonly periodEnd = signal('');

  protected readonly options = computed(() => {
    const plans = this.plans();
    return plans.kind === 'ready' ? plans.value : [];
  });
  protected readonly sameAsCurrent = computed(
    () => !!this.planCode() && this.planCode() === this.currentCode(),
  );
  protected readonly chosenVersion = computed(
    () => this.options().find((p) => p.code === this.planCode())?.current.version ?? null,
  );
  protected readonly periodInvalid = computed(
    () => !!this.periodEnd() && !isFutureDay(this.periodEnd()),
  );

  /** A trial needs its end; an open-ended active plan does not. */
  protected readonly ready = computed(
    () =>
      !!this.planCode() &&
      this.options().some((p) => p.code === this.planCode()) &&
      !this.periodInvalid() &&
      (this.status() !== 'trial' || !!this.periodEnd()),
  );

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      untracked(() => {
        const current = this.currentCode();
        // A current plan that is archived or of another audience is not offered.
        this.planCode.set(this.options().some((p) => p.code === current) ? current : null);
        this.status.set('active');
        this.periodEnd.set('');
      });
    });
  }

  protected readonly assign = (reason: string) => {
    const body: AssignPlanDto = {
      planCode: this.planCode()!,
      status: this.status(),
      periodEnd: this.periodEnd() ? dayStartUtc(this.periodEnd()) : null,
      reason,
    };
    return this.subscription.invoke(adminAccountsAssign, {
      type: this.payerType(),
      externalId: this.payerId(),
      body,
    });
  };
}
