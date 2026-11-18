import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Checkbox } from 'primeng/checkbox';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';
import { EditorRow, KeyState, RowProblem, rowProblems } from './plan-editor-model';
import { termsOf } from './plan-model';
import { PlanTerms } from './plan-terms';

const STATES: readonly KeyState[] = ['absent', 'off', 'on'];

/**
 * The key list of a version being written (plan 90, phase 8, step 14): each catalog key of the
 * audience is left out, off or on; an `ai_credits` key on takes monthly credits (or "unmetered",
 * ticked on purpose), a key's own limits take numbers, required ones (`seats.students` `max`)
 * must be given. The rules copy subscription's `validatePlanFeatures`; the server checks again.
 * Errors of empty required fields show once a save was tried (`attempted`); a malformed value
 * shows at once.
 */
@Component({
  selector: 'app-plan-features-editor',
  imports: [FormsModule, TranslocoPipe, Checkbox, InputText, SelectButton, PlanTerms],
  template: `
    <div class="border-border overflow-x-auto rounded-md border">
      <table class="w-full min-w-[44rem] text-sm" data-testid="features-editor">
        <thead>
          <tr class="border-border text-muted-color border-b text-left text-xs">
            <th scope="col" class="px-3 py-2 font-medium">{{ 'plans.card.key' | transloco }}</th>
            <th scope="col" class="px-3 py-2 font-medium">
              {{ 'plans.editor.state' | transloco }}
            </th>
            <th scope="col" class="px-3 py-2 font-medium">
              {{ 'plans.editor.settings' | transloco }}
            </th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.key; let i = $index) {
            @let problems = problemsOf(row);
            <tr
              class="border-border border-t align-top"
              data-testid="editor-row"
              [attr.data-key]="row.key"
              [attr.data-state]="row.state"
            >
              <td class="px-3 py-2">
                <div class="font-mono text-xs" [id]="row.key + '-label'">{{ row.key }}</div>
                <div class="text-muted-color text-xs">
                  @switch (row.kind) {
                    @case ('ai_credits') {
                      {{ 'plans.editor.kind.ai_credits' | transloco }}
                    }
                    @case ('switch') {
                      {{ 'plans.editor.kind.switch' | transloco }}
                    }
                    @case ('seats') {
                      {{ 'plans.editor.kind.seats' | transloco }}
                    }
                    @default {
                      {{ 'plans.editor.kind.unknown' | transloco }}
                    }
                  }
                </div>
              </td>
              <td class="px-3 py-2">
                @if (row.kind === null) {
                  @if (row.original) {
                    <app-plan-terms [featureKey]="row.key" [terms]="terms(row.original)" />
                  }
                } @else {
                  <p-selectbutton
                    size="small"
                    [options]="states"
                    [allowEmpty]="false"
                    [ngModel]="row.state"
                    (ngModelChange)="patch(i, { state: $event })"
                    [ngModelOptions]="{ standalone: true }"
                    [ariaLabelledBy]="row.key + '-label'"
                    data-testid="editor-state"
                  >
                    <ng-template #item let-option>
                      {{ 'plans.editor.states.' + option | transloco }}
                    </ng-template>
                  </p-selectbutton>
                }
              </td>
              <td class="px-3 py-2">
                @if (row.kind === null) {
                  <span class="text-muted-color text-xs" data-testid="editor-unknown">
                    {{ 'plans.editor.unknownKept' | transloco }}
                  </span>
                } @else if (row.foreign && row.state !== 'absent') {
                  <span class="text-xs text-red-600 dark:text-red-400" data-testid="editor-foreign">
                    {{ 'plans.editor.foreign' | transloco }}
                  </span>
                } @else if (row.state === 'on') {
                  <div class="flex flex-wrap items-start gap-x-4 gap-y-2">
                    @if (row.kind === 'ai_credits') {
                      @let creditsError = errorOf(problems, 'credits');
                      <div class="flex flex-col gap-1">
                        <label class="text-xs font-medium" [for]="row.key + '-credits'">
                          {{ 'plans.editor.credits' | transloco }}
                        </label>
                        <div class="flex items-center gap-3">
                          <input
                            pInputText
                            pSize="small"
                            class="w-32"
                            inputmode="decimal"
                            [id]="row.key + '-credits'"
                            [disabled]="row.unmetered"
                            [ngModel]="row.credits"
                            (ngModelChange)="patch(i, { credits: $event })"
                            [ngModelOptions]="{ standalone: true }"
                            [invalid]="!!creditsError"
                            [attr.aria-invalid]="creditsError ? 'true' : null"
                            data-testid="editor-credits"
                          />
                          <span class="flex items-center gap-1">
                            <p-checkbox
                              [inputId]="row.key + '-unmetered'"
                              [binary]="true"
                              [ngModel]="row.unmetered"
                              (ngModelChange)="patch(i, { unmetered: $event })"
                              [ngModelOptions]="{ standalone: true }"
                              data-testid="editor-unmetered"
                            />
                            <label class="text-xs" [for]="row.key + '-unmetered'">
                              {{ 'plans.editor.unmetered' | transloco }}
                            </label>
                          </span>
                        </div>
                        @if (creditsError === 'required') {
                          <span
                            class="text-xs text-red-600 dark:text-red-400"
                            data-testid="editor-credits-error"
                          >
                            {{ 'plans.editor.creditsRequired' | transloco }}
                          </span>
                        } @else if (creditsError === 'invalid') {
                          <span
                            class="text-xs text-red-600 dark:text-red-400"
                            data-testid="editor-credits-error"
                          >
                            {{ 'schools.plan.grantDialog.creditsInvalid' | transloco }}
                          </span>
                        }
                      </div>
                    }
                    @for (name of row.limitNames; track name) {
                      @let limitError = errorOf(problems, 'limit', name);
                      <div class="flex flex-col gap-1">
                        <label
                          class="font-mono text-xs"
                          [class.field-required]="row.requiredLimits.includes(name)"
                          [for]="row.key + '-' + name"
                        >
                          {{ name }}
                        </label>
                        <input
                          pInputText
                          pSize="small"
                          class="w-32"
                          inputmode="decimal"
                          [id]="row.key + '-' + name"
                          [ngModel]="row.limits[name]"
                          (ngModelChange)="patchLimit(i, name, $event)"
                          [ngModelOptions]="{ standalone: true }"
                          [attr.aria-required]="row.requiredLimits.includes(name) ? 'true' : null"
                          [invalid]="!!limitError"
                          [attr.aria-invalid]="limitError ? 'true' : null"
                          data-testid="editor-limit"
                          [attr.data-limit]="name"
                        />
                        @if (limitError === 'required') {
                          <span
                            class="text-xs text-red-600 dark:text-red-400"
                            data-testid="editor-limit-error"
                          >
                            {{ 'reasonDialog.fieldRequired' | transloco }}
                          </span>
                        } @else if (limitError === 'invalid') {
                          <span
                            class="text-xs text-red-600 dark:text-red-400"
                            data-testid="editor-limit-error"
                          >
                            @if (row.kind === 'seats') {
                              {{ 'plans.editor.wholeNumber' | transloco }}
                            } @else {
                              {{ 'plans.editor.number' | transloco }}
                            }
                          </span>
                        } @else if (!row.requiredLimits.includes(name)) {
                          <span class="text-muted-color text-xs">
                            {{ 'plans.editor.limitOptional' | transloco }}
                          </span>
                        }
                      </div>
                    }
                    @if (row.kind === 'switch' && row.limitNames.length === 0) {
                      <span class="text-muted-color text-xs">—</span>
                    }
                  </div>
                } @else {
                  <span class="text-muted-color text-xs">—</span>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class PlanFeaturesEditor {
  readonly rows = model.required<EditorRow[]>();
  /** A save was tried: empty required fields show their errors from now on. */
  readonly attempted = input(false);

  protected readonly states = [...STATES];
  protected readonly terms = termsOf;

  protected problemsOf(row: EditorRow): RowProblem[] {
    return rowProblems(row);
  }

  /**
   * The problem of one field, if it should show now: "required" waits for a save attempt,
   * "invalid" shows as soon as it is typed.
   */
  protected errorOf(
    problems: readonly RowProblem[],
    field: 'credits' | 'limit',
    limit?: string,
  ): 'required' | 'invalid' | null {
    const found = problems.find(
      (p) => p.field === field && (field !== 'limit' || (p.field === 'limit' && p.limit === limit)),
    );
    if (!found || found.problem === 'foreign') return null;
    return found.problem === 'required' && !this.attempted() ? null : found.problem;
  }

  protected patch(index: number, change: Partial<EditorRow>): void {
    this.rows.update((rows) => rows.map((r, i) => (i === index ? { ...r, ...change } : r)));
  }

  protected patchLimit(index: number, name: string, value: string): void {
    this.rows.update((rows) =>
      rows.map((r, i) => (i === index ? { ...r, limits: { ...r.limits, [name]: value } } : r)),
    );
  }
}
