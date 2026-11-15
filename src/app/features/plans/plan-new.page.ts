import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';
import { catchError, throwError } from 'rxjs';
import { adminPlansCreate } from '../../api/subscription/functions';
import { PlanResponseDto } from '../../api/subscription/models/plan-response-dto';
import { SubscriptionApi } from '../../api/subscription/subscription-api';
import { ApiError } from '../../core/auth/api-error';
import { ReasonDialog } from '../../shared/reason-dialog/reason-dialog';
import { PlanChanges } from './plan-changes';
import {
  EditorRow,
  PLAN_CODE_MAX_LENGTH,
  codeProblem,
  editorFeatures,
  editorRows,
  editorValid,
  rowsForAudience,
} from './plan-editor-model';
import { PlanFeaturesEditor } from './plan-features-editor';
import { AUDIENCES, PlanAudience, diffFeatures } from './plan-model';
import { PLAN_NAME_MAX_LENGTH } from './plan-rename-dialog';

/**
 * `/plans/new` — a new plan (plan 90, phase 8, step 14), `super` only: code (lower_snake_case,
 * never changes), name, audience and the keys of its first version. Switching the audience drops
 * the keys the new audience does not take. A taken code is a 409, shown on the code field.
 */
@Component({
  selector: 'app-plan-new-page',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    ButtonDirective,
    InputText,
    SelectButton,
    ReasonDialog,
    PlanChanges,
    PlanFeaturesEditor,
  ],
  template: `
    <section class="flex flex-col gap-4" data-testid="plan-new-page">
      <a class="text-primary flex w-fit items-center gap-1 text-sm" routerLink="/plans">
        <i class="pi pi-arrow-left" aria-hidden="true"></i>
        {{ 'plans.card.back' | transloco }}
      </a>
      <h1 class="text-2xl font-semibold" data-testid="page-title">
        {{ 'plans.editor.newTitle' | transloco }}
      </h1>

      <div class="grid max-w-3xl gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-1">
          <label class="field-required text-sm font-medium" for="plan-code">
            {{ 'plans.editor.code' | transloco }}
          </label>
          <input
            pInputText
            id="plan-code"
            class="w-full font-mono"
            autocomplete="off"
            spellcheck="false"
            [attr.maxlength]="codeMaxLength"
            [ngModel]="code()"
            (ngModelChange)="code.set($event)"
            [ngModelOptions]="{ standalone: true }"
            aria-required="true"
            [invalid]="!!codeError()"
            [attr.aria-invalid]="codeError() ? 'true' : null"
            data-testid="plan-code-input"
          />
          @switch (codeError()) {
            @case ('required') {
              <span class="text-xs text-red-600 dark:text-red-400" data-testid="plan-code-error">
                {{ 'reasonDialog.fieldRequired' | transloco }}
              </span>
            }
            @case ('invalid') {
              <span class="text-xs text-red-600 dark:text-red-400" data-testid="plan-code-error">
                {{ 'plans.editor.codeInvalid' | transloco }}
              </span>
            }
            @case ('taken') {
              <span class="text-xs text-red-600 dark:text-red-400" data-testid="plan-code-error">
                {{ 'plans.editor.codeTaken' | transloco }}
              </span>
            }
            @default {
              <span class="text-muted-color text-xs">{{
                'plans.editor.codeHint' | transloco
              }}</span>
            }
          }
        </div>

        <div class="flex flex-col gap-1">
          <label class="field-required text-sm font-medium" for="plan-new-name">
            {{ 'plans.card.renameDialog.name' | transloco }}
          </label>
          <input
            pInputText
            id="plan-new-name"
            class="w-full"
            [attr.maxlength]="nameMaxLength"
            [ngModel]="name()"
            (ngModelChange)="name.set($event)"
            [ngModelOptions]="{ standalone: true }"
            aria-required="true"
            [invalid]="nameMissing()"
            [attr.aria-invalid]="nameMissing() ? 'true' : null"
            data-testid="plan-new-name"
          />
          @if (nameMissing()) {
            <span class="text-xs text-red-600 dark:text-red-400" data-testid="plan-name-error">
              {{ 'reasonDialog.fieldRequired' | transloco }}
            </span>
          }
        </div>

        <div class="flex flex-col gap-1 sm:col-span-2">
          <span class="text-sm font-medium" id="plan-audience-label">
            {{ 'plans.editor.audience' | transloco }}
          </span>
          <p-selectbutton
            [options]="audiences"
            [allowEmpty]="false"
            [ngModel]="audience()"
            (ngModelChange)="setAudience($event)"
            [ngModelOptions]="{ standalone: true }"
            ariaLabelledBy="plan-audience-label"
            data-testid="plan-audience-input"
          >
            <ng-template #item let-option>
              {{ 'plans.audience.' + option | transloco }}
            </ng-template>
          </p-selectbutton>
        </div>
      </div>

      <app-plan-features-editor
        [rows]="rows()"
        (rowsChange)="rows.set($event)"
        [attempted]="attempted()"
      />

      <div class="flex flex-wrap items-center gap-2">
        <button type="button" pButton data-testid="plan-create" (click)="save()">
          {{ 'plans.editor.create' | transloco }}
        </button>
        <a pButton severity="secondary" [text]="true" routerLink="/plans">
          {{ 'reasonDialog.cancel' | transloco }}
        </a>
      </div>

      <app-reason-dialog
        [(visible)]="confirmOpen"
        [header]="'plans.editor.confirmCreate' | transloco"
        [confirmLabel]="'plans.editor.create' | transloco"
        level="super"
        [action]="create"
        [errorText]="{ conflict: 'plans.editor.codeTaken' | transloco }"
        (done)="created($event)"
      >
        <p class="text-sm" data-testid="create-summary">
          <span class="font-semibold">{{ name().trim() }}</span> ·
          <span class="font-mono">{{ code().trim() }}</span> ·
          {{ 'plans.audience.' + audience() | transloco }}
        </p>
        @if (features().length === 0) {
          <p class="text-muted-color text-sm" data-testid="create-no-keys">
            {{ 'plans.card.noKeys' | transloco }}
          </p>
        } @else {
          <app-plan-changes [changes]="changes()" />
        }
      </app-reason-dialog>
    </section>
  `,
})
export class PlanNewPage {
  private readonly api = inject(SubscriptionApi);
  private readonly router = inject(Router);

  protected readonly codeMaxLength = PLAN_CODE_MAX_LENGTH;
  protected readonly nameMaxLength = PLAN_NAME_MAX_LENGTH;
  protected readonly audiences = [...AUDIENCES];

  protected readonly code = signal('');
  protected readonly name = signal('');
  protected readonly audience = signal<PlanAudience>('workspace');
  protected readonly rows = signal<EditorRow[]>(editorRows('workspace', []));
  protected readonly attempted = signal(false);
  protected readonly confirmOpen = signal(false);
  /** The server already has a plan with the code last sent. */
  private readonly takenCode = signal<string | null>(null);

  protected readonly codeError = computed<'required' | 'invalid' | 'taken' | null>(() => {
    const code = this.code().trim();
    if (this.takenCode() !== null && this.takenCode() === code) return 'taken';
    const problem = codeProblem(code);
    // An empty code waits for a save attempt; a malformed one shows at once.
    return problem === 'required' && !this.attempted() ? null : problem;
  });
  protected readonly nameMissing = computed(() => this.attempted() && this.name().trim() === '');

  protected readonly features = computed(() =>
    editorValid(this.rows()) ? editorFeatures(this.rows()) : [],
  );
  /** The first version, read as "added" against nothing. */
  protected readonly changes = computed(() => diffFeatures([], this.features()));

  private readonly valid = computed(
    () =>
      codeProblem(this.code()) === null &&
      this.takenCode() !== this.code().trim() &&
      this.name().trim() !== '' &&
      editorValid(this.rows()),
  );

  protected setAudience(audience: PlanAudience): void {
    this.audience.set(audience);
    this.rows.update((rows) => rowsForAudience(rows, audience));
  }

  protected save(): void {
    this.attempted.set(true);
    if (!this.valid()) return;
    this.confirmOpen.set(true);
  }

  protected readonly create = (reason: string) => {
    const code = this.code().trim();
    return this.api
      .invoke(adminPlansCreate, {
        body: {
          code,
          name: this.name().trim(),
          audience: this.audience(),
          features: editorFeatures(this.rows()),
          reason,
        },
      })
      .pipe(
        catchError((error: unknown) => {
          if (ApiError.from(error).status === 409) this.takenCode.set(code);
          return throwError(() => error);
        }),
      );
  };

  protected created(plan: PlanResponseDto): void {
    void this.router.navigate(['/plans', plan.code]);
  }
}
