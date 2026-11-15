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
import { adminPlansRename } from '../../api/subscription/functions';
import { PlanResponseDto } from '../../api/subscription/models/plan-response-dto';
import { SubscriptionApi } from '../../api/subscription/subscription-api';
import { ReasonDialog } from '../../shared/reason-dialog/reason-dialog';

/** subscription's limit on a plan name (`RenamePlanDto`). */
export const PLAN_NAME_MAX_LENGTH = 200;

/**
 * "Rename plan" (plan 90, phase 8, step 13): the display name only — no new version, subscribers
 * see the new name at once. `super` only; the same name again would change nothing, so it
 * cannot be sent.
 */
@Component({
  selector: 'app-plan-rename-dialog',
  imports: [FormsModule, TranslocoPipe, InputText, ReasonDialog],
  template: `
    <app-reason-dialog
      [(visible)]="visible"
      [(attempted)]="attempted"
      [header]="'plans.card.renameDialog.title' | transloco"
      [confirmLabel]="'plans.card.renameDialog.confirm' | transloco"
      level="super"
      [ready]="problem() === null"
      [action]="rename"
      (done)="done.emit($event)"
    >
      <div class="flex flex-col gap-1">
        <label class="field-required text-sm font-medium" for="plan-name">
          {{ 'plans.card.renameDialog.name' | transloco }}
        </label>
        <input
          pInputText
          id="plan-name"
          class="w-full"
          [attr.maxlength]="maxLength"
          [ngModel]="name()"
          (ngModelChange)="name.set($event)"
          [ngModelOptions]="{ standalone: true }"
          aria-required="true"
          [invalid]="showError()"
          [attr.aria-invalid]="showError() ? 'true' : null"
          aria-describedby="plan-name-hint"
          data-testid="plan-name"
        />
        <span id="plan-name-hint" class="text-xs" data-testid="plan-name-hint">
          @switch (problem()) {
            @case ('required') {
              @if (attempted()) {
                <span class="text-red-600 dark:text-red-400" data-testid="plan-name-error">
                  {{ 'reasonDialog.fieldRequired' | transloco }}
                </span>
              }
            }
            @case ('unchanged') {
              <span class="text-muted-color" data-testid="plan-name-unchanged">
                {{ 'plans.card.renameDialog.unchanged' | transloco }}
              </span>
            }
          }
        </span>
      </div>
      <p class="text-muted-color text-xs">{{ 'plans.card.renameDialog.hint' | transloco }}</p>
    </app-reason-dialog>
  `,
})
export class PlanRenameDialog {
  readonly visible = model(false);
  readonly code = input.required<string>();
  readonly currentName = input.required<string>();
  readonly done = output<PlanResponseDto>();

  private readonly api = inject(SubscriptionApi);

  protected readonly maxLength = PLAN_NAME_MAX_LENGTH;
  protected readonly name = signal('');
  protected readonly attempted = signal(false);

  protected readonly problem = computed<'required' | 'unchanged' | null>(() => {
    const name = this.name().trim();
    if (name === '') return 'required';
    return name === this.currentName() ? 'unchanged' : null;
  });

  protected readonly showError = computed(() => this.problem() === 'required' && this.attempted());

  constructor() {
    // Each opening starts from the name in force.
    effect(() => {
      if (!this.visible()) return;
      untracked(() => this.name.set(this.currentName()));
    });
  }

  protected readonly rename = (reason: string) =>
    this.api.invoke(adminPlansRename, {
      code: this.code(),
      body: { name: this.name().trim(), reason },
    });
}
