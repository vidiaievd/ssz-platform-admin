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
import { SelectButton } from 'primeng/selectbutton';
import { Select } from 'primeng/select';
import { adminAccountsIssueGrant } from '../../../../api/subscription/functions';
import { AccountOverviewResponseDto } from '../../../../api/subscription/models/account-overview-response-dto';
import { IssueGrantDto } from '../../../../api/subscription/models/issue-grant-dto';
import { SubscriptionApi } from '../../../../api/subscription/subscription-api';
import { ReasonDialog } from '../../../../shared/reason-dialog/reason-dialog';
import { FEATURE_KEYS, featureKind } from './feature-keys';
import { dayStartUtc, isFutureDay, todayUtc } from './plan-dates';

/** Seats as subscription accepts them: a whole number, at least 1. */
const SEATS = /^[1-9]\d{0,8}$/;

/** Credits as subscription accepts them (`plan.ts`): a decimal string, never a float. */
const CREDITS = /^\d{1,12}(\.\d{1,6})?$/;

const EFFECTS = [
  { value: true, key: 'on' },
  { value: false, key: 'off' },
] as const;

/**
 * "Issue a grant" — a key on top of the plan (with credits added to the plan's, or unmetered)
 * or, with `enabled: false`, the key switched off for the term even where the plan gives it
 * (§6.3, decision 1). The "AI & services" tab opens it with the key and the effect preset.
 */
@Component({
  selector: 'app-grant-dialog',
  imports: [FormsModule, TranslocoPipe, InputText, Select, SelectButton, ReasonDialog],
  template: `
    <app-reason-dialog
      [(visible)]="visible"
      [header]="'schools.plan.grantDialog.title' | transloco"
      [confirmLabel]="'schools.plan.grantDialog.confirm' | transloco"
      level="admin"
      [ready]="ready()"
      [action]="issue"
      (done)="done.emit($event)"
    >
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium" for="grant-key">
          {{ 'schools.plan.grantDialog.key' | transloco }}
        </label>
        <p-select
          inputId="grant-key"
          class="w-full"
          appendTo="body"
          [options]="keys"
          optionLabel="key"
          optionValue="key"
          [ngModel]="featureKey()"
          (ngModelChange)="featureKey.set($event)"
          [ngModelOptions]="{ standalone: true }"
          [placeholder]="'schools.plan.grantDialog.keyPlaceholder' | transloco"
          data-testid="grant-key"
        />
      </div>

      @if (!isSeats()) {
        <div class="flex flex-col gap-1">
          <span class="text-sm font-medium" id="grant-effect-label">
            {{ 'schools.plan.grantDialog.effect' | transloco }}
          </span>
          <p-selectbutton
            [options]="effects"
            optionLabel="key"
            optionValue="value"
            [allowEmpty]="false"
            [ngModel]="enabled()"
            (ngModelChange)="enabled.set($event)"
            [ngModelOptions]="{ standalone: true }"
            ariaLabelledBy="grant-effect-label"
            data-testid="grant-effect"
          >
            <ng-template #item let-option>
              {{ 'schools.plan.effect.' + option.key | transloco }}
            </ng-template>
          </p-selectbutton>
          <span class="text-muted-color text-xs">
            @if (enabled()) {
              {{ 'schools.plan.grantDialog.onHint' | transloco }}
            } @else {
              {{ 'schools.plan.grantDialog.offHint' | transloco }}
            }
          </span>
        </div>
      } @else {
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium" for="grant-seats">
            {{ 'schools.plan.grantDialog.seats' | transloco }}
          </label>
          <input
            pInputText
            id="grant-seats"
            inputmode="numeric"
            class="w-full"
            [ngModel]="seats()"
            (ngModelChange)="seats.set($event)"
            [ngModelOptions]="{ standalone: true }"
            [attr.aria-invalid]="seatsInvalid() ? 'true' : null"
            data-testid="grant-seats"
          />
          @if (seatsInvalid()) {
            <span class="text-xs text-red-600 dark:text-red-400" data-testid="grant-seats-error">
              {{ 'schools.plan.grantDialog.seatsInvalid' | transloco }}
            </span>
          } @else {
            <span class="text-muted-color text-xs">
              {{ 'schools.plan.grantDialog.seatsHint' | transloco }}
            </span>
          }
        </div>
      }

      @if (takesCredits()) {
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium" for="grant-credits">
            {{ 'schools.plan.grantDialog.credits' | transloco }}
          </label>
          <input
            pInputText
            id="grant-credits"
            inputmode="decimal"
            class="w-full"
            [ngModel]="credits()"
            (ngModelChange)="credits.set($event)"
            [ngModelOptions]="{ standalone: true }"
            [attr.aria-invalid]="creditsInvalid() ? 'true' : null"
            data-testid="grant-credits"
          />
          @if (creditsInvalid()) {
            <span class="text-xs text-red-600 dark:text-red-400" data-testid="grant-credits-error">
              {{ 'schools.plan.grantDialog.creditsInvalid' | transloco }}
            </span>
          } @else {
            <span class="text-muted-color text-xs">
              {{ 'schools.plan.grantDialog.creditsHint' | transloco }}
            </span>
          }
        </div>
      }

      <div class="grid gap-3 sm:grid-cols-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium" for="grant-starts">
            {{ 'schools.plan.grantDialog.startsAt' | transloco }}
          </label>
          <input
            pInputText
            id="grant-starts"
            type="date"
            [min]="today"
            [ngModel]="startsAt()"
            (ngModelChange)="startsAt.set($event ?? '')"
            [ngModelOptions]="{ standalone: true }"
            data-testid="grant-starts"
          />
          <span class="text-muted-color text-xs">
            {{ 'schools.plan.grantDialog.startsHint' | transloco }}
          </span>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium" for="grant-ends">
            {{ 'schools.plan.grantDialog.endsAt' | transloco }}
          </label>
          <input
            pInputText
            id="grant-ends"
            type="date"
            [min]="today"
            [ngModel]="endsAt()"
            (ngModelChange)="endsAt.set($event ?? '')"
            [ngModelOptions]="{ standalone: true }"
            [attr.aria-invalid]="periodInvalid() ? 'true' : null"
            data-testid="grant-ends"
          />
          @if (periodInvalid()) {
            <span class="text-xs text-red-600 dark:text-red-400" data-testid="grant-period-error">
              {{ 'schools.plan.grantDialog.periodInvalid' | transloco }}
            </span>
          } @else {
            <span class="text-muted-color text-xs">
              {{ 'schools.plan.dayHint' | transloco }}
            </span>
          }
        </div>
      </div>
    </app-reason-dialog>
  `,
})
export class GrantDialog {
  readonly visible = model(false);
  readonly payerType = input<'workspace' | 'user'>('workspace');
  readonly payerId = input.required<string>();
  /** Preset of the key and its effect, applied on every opening. */
  readonly presetKey = input<string | null>(null);
  readonly presetEnabled = input(true);
  readonly done = output<AccountOverviewResponseDto>();

  private readonly subscription = inject(SubscriptionApi);

  protected readonly keys = [...FEATURE_KEYS];
  protected readonly today = todayUtc();

  protected readonly featureKey = signal<string | null>(null);
  protected readonly enabled = signal(true);
  protected readonly credits = signal('');
  protected readonly seats = signal('');
  protected readonly startsAt = signal('');
  protected readonly endsAt = signal('');

  protected readonly effects = [...EFFECTS];

  /** A seats key is a limit: it is never switched off and takes `max` instead of credits. */
  protected readonly isSeats = computed(() => {
    const key = this.featureKey();
    return !!key && featureKind(key) === 'seats';
  });
  protected readonly seatsInvalid = computed(
    () => this.isSeats() && this.seats().trim() !== '' && !SEATS.test(this.seats().trim()),
  );

  /** Credits only add to an AI key that is switched on; a switch-off carries none. */
  protected readonly takesCredits = computed(() => {
    const key = this.featureKey();
    return this.enabled() && !!key && featureKind(key) === 'ai_credits';
  });
  protected readonly creditsInvalid = computed(
    () =>
      this.takesCredits() && this.credits().trim() !== '' && !CREDITS.test(this.credits().trim()),
  );
  /** A filled end that is not ahead of today, or not after the start. */
  protected readonly periodInvalid = computed(() => {
    const ends = this.endsAt();
    if (!ends) return false;
    const starts = this.startsAt();
    return !isFutureDay(ends) || (!!starts && dayStartUtc(starts) !== null && ends <= starts);
  });

  protected readonly ready = computed(
    () =>
      !!this.featureKey() &&
      !!this.endsAt() &&
      !this.periodInvalid() &&
      !this.creditsInvalid() &&
      (!this.isSeats() || SEATS.test(this.seats().trim())) &&
      (!this.startsAt() || dayStartUtc(this.startsAt()) !== null),
  );

  constructor() {
    // Each opening starts from the preset, like the reason under it.
    effect(() => {
      if (!this.visible()) return;
      untracked(() => {
        this.featureKey.set(this.presetKey());
        this.enabled.set(this.presetEnabled());
        this.credits.set('');
        this.seats.set('');
        this.startsAt.set('');
        this.endsAt.set('');
      });
    });
  }

  protected readonly issue = (reason: string) =>
    this.subscription.invoke(adminAccountsIssueGrant, {
      type: this.payerType(),
      externalId: this.payerId(),
      body: this.body(reason),
    });

  private body(reason: string): IssueGrantDto {
    const body: IssueGrantDto = {
      featureKey: this.featureKey()!,
      enabled: this.isSeats() ? true : this.enabled(),
      endsAt: dayStartUtc(this.endsAt())!,
      reason,
    };
    // A start today or earlier is "now"; the server takes an omitted start as now.
    const starts = this.startsAt();
    if (starts && isFutureDay(starts)) body.startsAt = dayStartUtc(starts)!;
    if (this.isSeats()) body.limits = { max: Number(this.seats().trim()) };
    if (this.takesCredits()) {
      const credits = this.credits().trim();
      body.monthlyCredits = credits === '' ? null : credits;
    }
    return body;
  }
}
