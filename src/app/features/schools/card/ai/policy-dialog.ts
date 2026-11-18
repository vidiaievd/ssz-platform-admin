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
import { Checkbox } from 'primeng/checkbox';
import { SelectButton } from 'primeng/selectbutton';
import { AiApi } from '../../../../api/ai/ai-api';
import { adminPayerPoliciesPut } from '../../../../api/ai/functions';
import { PayerPolicyResponseDto } from '../../../../api/ai/models/payer-policy-response-dto';
import { PutPayerPolicyDto } from '../../../../api/ai/models/put-payer-policy-dto';
import { ReasonDialog } from '../../../../shared/reason-dialog/reason-dialog';

export type AiRegion = NonNullable<PutPayerPolicyDto['allowedRegions']>[number];

/** ai-service's regions (`registry.types.ts`), matched literally: `global` is a region of its own. */
export const AI_REGIONS: readonly AiRegion[] = ['eu', 'us', 'global', 'local'];

const SWITCH = [
  { value: true, key: 'on' },
  { value: false, key: 'off' },
] as const;

/**
 * "Change AI policy" of a payer: the switch for all of its AI and the regions its models may run
 * in (`null` = any). Opens with the policy in force; the change goes to the admin journal with
 * the reason (plan 90, phase 3, step 3).
 */
@Component({
  selector: 'app-policy-dialog',
  imports: [FormsModule, TranslocoPipe, Checkbox, SelectButton, ReasonDialog],
  template: `
    <app-reason-dialog
      [(visible)]="visible"
      [header]="'schools.ai.policyDialog.title' | transloco"
      [confirmLabel]="'schools.ai.policyDialog.confirm' | transloco"
      level="admin"
      [ready]="ready()"
      [action]="save"
      (done)="done.emit($event)"
    >
      <div class="flex flex-col gap-1">
        <span class="text-sm font-medium" id="policy-ai-label">
          {{ 'schools.ai.policyDialog.aiEnabled' | transloco }}
        </span>
        <p-selectbutton
          [options]="switchOptions"
          optionLabel="key"
          optionValue="value"
          [allowEmpty]="false"
          [ngModel]="aiEnabled()"
          (ngModelChange)="aiEnabled.set($event)"
          [ngModelOptions]="{ standalone: true }"
          ariaLabelledBy="policy-ai-label"
          data-testid="policy-ai"
        >
          <ng-template #item let-option>
            {{ 'schools.plan.effect.' + option.key | transloco }}
          </ng-template>
        </p-selectbutton>
        <span class="text-muted-color text-xs">
          @if (aiEnabled()) {
            {{ 'schools.ai.policyDialog.onHint' | transloco }}
          } @else {
            {{ 'schools.ai.policyDialog.offHint' | transloco }}
          }
        </span>
      </div>

      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm font-medium">
          {{ 'schools.ai.policyDialog.regions' | transloco }}
        </legend>
        <div class="flex items-center gap-2 text-sm">
          <p-checkbox
            [binary]="true"
            inputId="policy-any-region"
            [ngModel]="anyRegion()"
            (ngModelChange)="anyRegion.set($event)"
            [ngModelOptions]="{ standalone: true }"
            data-testid="policy-any-region"
          />
          <label for="policy-any-region">{{ 'schools.ai.anyRegion' | transloco }}</label>
        </div>
        @if (!anyRegion()) {
          <div class="flex flex-wrap gap-x-4 gap-y-2 pl-6" data-testid="policy-regions">
            @for (region of regions; track region) {
              <div class="flex items-center gap-2 text-sm">
                <p-checkbox
                  [binary]="true"
                  [inputId]="'policy-region-' + region"
                  [ngModel]="selected().includes(region)"
                  (ngModelChange)="toggle(region, $event)"
                  [ngModelOptions]="{ standalone: true }"
                  [attr.data-testid]="'policy-region-' + region"
                />
                <label [for]="'policy-region-' + region">
                  {{ 'schools.ai.region.' + region | transloco }}
                </label>
              </div>
            }
          </div>
          @if (selected().length === 0) {
            <span class="text-xs text-red-600 dark:text-red-400" data-testid="policy-regions-error">
              {{ 'schools.ai.policyDialog.regionsRequired' | transloco }}
            </span>
          } @else {
            <span class="text-muted-color text-xs">
              {{ 'schools.ai.policyDialog.regionsHint' | transloco }}
            </span>
          }
        }
      </fieldset>
    </app-reason-dialog>
  `,
})
export class PolicyDialog {
  readonly visible = model(false);
  readonly payerType = input<'workspace' | 'user'>('workspace');
  readonly payerId = input.required<string>();
  /** The policy in force; the dialog opens with it. */
  readonly policy = input<PayerPolicyResponseDto | null>(null);
  readonly done = output<PayerPolicyResponseDto>();

  private readonly ai = inject(AiApi);

  protected readonly regions = AI_REGIONS;
  protected readonly switchOptions = [...SWITCH];

  protected readonly aiEnabled = signal(true);
  protected readonly anyRegion = signal(true);
  protected readonly selected = signal<AiRegion[]>([]);

  protected readonly ready = computed(() => this.anyRegion() || this.selected().length > 0);

  constructor() {
    // Each opening starts from the policy in force, like the reason under it.
    effect(() => {
      if (!this.visible()) return;
      untracked(() => {
        const policy = this.policy();
        this.aiEnabled.set(policy?.aiEnabled ?? true);
        const regions = policy?.allowedRegions ?? null;
        this.anyRegion.set(regions === null);
        this.selected.set(regions ? [...regions] : []);
      });
    });
  }

  protected toggle(region: AiRegion, on: boolean): void {
    this.selected.update((list) => {
      const rest = list.filter((r) => r !== region);
      // Kept in the catalog's order, so the journal's before/after compare cleanly.
      return on ? AI_REGIONS.filter((r) => r === region || rest.includes(r)) : rest;
    });
  }

  protected readonly save = (reason: string) =>
    this.ai.invoke(adminPayerPoliciesPut, {
      payerType: this.payerType(),
      payerId: this.payerId(),
      body: {
        aiEnabled: this.aiEnabled(),
        allowedRegions: this.anyRegion() ? null : this.selected(),
        reason,
      },
    });
}
