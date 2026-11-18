import {
  Component,
  DestroyRef,
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
import { ButtonDirective } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Tag } from 'primeng/tag';
import { Subscription } from 'rxjs';
import { ModelResponseDto } from '../../../api/ai/models/model-response-dto';
import { ProviderResponseDto } from '../../../api/ai/models/provider-response-dto';
import { ApiError } from '../../../core/auth/api-error';
import { SessionStore } from '../../../core/auth/session.store';
import { ActionError, describeActionError } from '../../../shared/reason-dialog/action-error';
import { PROMPT_VERSION_MAX } from '../models/binding-dialog';
import { AiEvalsData, EvalRunRequest } from './ai-evals.data';
import {
  EVAL_FORM,
  EVAL_SET_SIZE,
  EvalSet,
  EvalSummaryDto,
  SetBinding,
  candidates,
  defaultCandidate,
} from './eval-sets';

/** The level the server asks for a run. */
export const EVAL_RUN_LEVEL = 'admin' as const;

interface CandidateOption {
  readonly id: string;
  readonly label: string;
  readonly providerCode: string;
  readonly status: ModelResponseDto['status'];
  readonly disabled: boolean;
  /** Why it cannot be picked: a key missing, or what it lacks. */
  readonly why: string | null;
  readonly blockKey: string | null;
}

/**
 * "New run" of one eval set (level `admin`): a candidate model of the set's modality — any
 * status, it "need not be switched on" — plus, per set, a prompt version (text agents; empty =
 * the binding's), the set size (review and voice, 1–500) and pronunciation (voice). A run is not
 * a change of anything, so there is no reason; the platform pays for its calls (surface
 * `admin_eval`). The server answers 202 with the run `running`; the page then opens it.
 */
@Component({
  selector: 'app-eval-run-dialog',
  imports: [FormsModule, TranslocoPipe, ButtonDirective, Checkbox, Dialog, InputText, Select, Tag],
  template: `
    <p-dialog
      [(visible)]="visible"
      [header]="'ai.evals.run.title' | transloco: { set: ('ai.evals.set.' + set() | transloco) }"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [closable]="!busy()"
      [closeOnEscape]="!busy()"
      [style]="{ width: '36rem' }"
      [breakpoints]="{ '640px': 'calc(100vw - 2rem)' }"
      [closeAriaLabel]="'reasonDialog.cancel' | transloco"
    >
      @if (allowed()) {
        <form class="flex flex-col gap-4" data-testid="eval-run-dialog" (ngSubmit)="submit()">
          <p class="text-muted-color text-sm">{{ 'ai.evals.run.hint.' + set() | transloco }}</p>

          <div class="flex flex-col gap-1">
            <label class="field-required text-sm font-medium" for="eval-run-model">
              {{ 'ai.evals.run.model' | transloco }}
            </label>
            <p-select
              inputId="eval-run-model"
              class="w-full"
              appendTo="body"
              [options]="options()"
              optionLabel="label"
              optionValue="id"
              optionDisabled="disabled"
              [ngModel]="modelId()"
              (ngModelChange)="modelId.set($event)"
              [ngModelOptions]="{ standalone: true }"
              [placeholder]="'ai.models.dialog.pickModel' | transloco"
              [invalid]="modelMissing()"
              data-testid="eval-run-model"
            >
              <ng-template #item let-option>
                <span class="flex flex-col">
                  <span class="flex flex-wrap items-center gap-2">
                    {{ option.label }}
                    <span class="text-muted-color font-mono text-xs">{{
                      option.providerCode
                    }}</span>
                    @if (option.status !== 'active') {
                      <p-tag
                        [severity]="option.status === 'disabled' ? 'danger' : 'warn'"
                        [value]="'ai.models.status.' + option.status | transloco"
                      />
                    }
                  </span>
                  @if (option.blockKey) {
                    <span class="text-xs">
                      {{ 'ai.evals.run.blocked.' + option.blockKey | transloco }}
                      @if (option.why) {
                        <span class="font-mono">{{ option.why }}</span>
                      }
                    </span>
                  }
                </span>
              </ng-template>
            </p-select>
            @if (modelMissing()) {
              <span
                class="text-xs text-red-600 dark:text-red-400"
                data-testid="eval-run-model-error"
              >
                {{ 'reasonDialog.fieldRequired' | transloco }}
              </span>
            } @else if (models() === null) {
              <span class="text-muted-color text-xs" data-testid="eval-run-models-wait">
                {{ 'ai.evals.run.modelsWait' | transloco }}
              </span>
            } @else if (options().length === 0) {
              <span class="text-xs text-red-600 dark:text-red-400" data-testid="eval-run-no-models">
                {{ 'ai.evals.run.noModels' | transloco }}
              </span>
            } @else {
              <span class="text-muted-color text-xs">{{
                'ai.evals.run.modelHint' | transloco
              }}</span>
            }
          </div>

          @if (form().promptVersion) {
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium" for="eval-run-prompt">
                {{ 'ai.models.promptVersion' | transloco }}
              </label>
              <input
                pInputText
                id="eval-run-prompt"
                class="w-full font-mono"
                name="promptVersion"
                [attr.maxlength]="promptVersionMax"
                [placeholder]="boundPrompt() ?? ''"
                [ngModel]="promptVersion()"
                (ngModelChange)="promptVersion.set($event)"
                data-testid="eval-run-prompt"
              />
              <span class="text-muted-color text-xs">
                @if (boundPrompt(); as bound) {
                  {{ 'ai.evals.run.promptHint' | transloco: { version: bound } }}
                } @else {
                  {{ 'ai.evals.run.promptUnbound' | transloco }}
                }
              </span>
            </div>
          }

          @if (form().limit) {
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium" for="eval-run-limit">
                {{ 'ai.evals.run.limit.' + set() | transloco }}
              </label>
              <input
                pInputText
                id="eval-run-limit"
                class="w-32 tabular-nums"
                name="limit"
                inputmode="numeric"
                [ngModel]="limit()"
                (ngModelChange)="limit.set($event)"
                [invalid]="limitInvalid()"
                [attr.aria-invalid]="limitInvalid() ? 'true' : null"
                data-testid="eval-run-limit"
              />
              <span
                class="text-xs"
                [class.text-muted-color]="!limitInvalid()"
                [class.text-red-600]="limitInvalid()"
                data-testid="eval-run-limit-hint"
              >
                {{ 'ai.evals.run.limitHint' | transloco: bounds }}
              </span>
            </div>
          }

          @if (form().pronunciation) {
            <div class="flex items-start gap-2">
              <p-checkbox
                inputId="eval-run-pronunciation"
                [binary]="true"
                [ngModel]="pronunciation()"
                (ngModelChange)="pronunciation.set($event)"
                [ngModelOptions]="{ standalone: true }"
                data-testid="eval-run-pronunciation"
              />
              <label class="text-sm" for="eval-run-pronunciation">
                {{ 'ai.evals.run.pronunciation' | transloco }}
                <span class="text-muted-color block text-xs">
                  {{ 'ai.evals.run.pronunciationHint' | transloco }}
                </span>
              </label>
            </div>
          }

          @if (error(); as error) {
            <div
              role="alert"
              class="flex flex-col gap-1 rounded-md border border-red-300 px-3 py-2 text-sm dark:border-red-800"
              data-testid="eval-run-error"
            >
              <span class="flex items-center gap-2">
                <i class="pi pi-exclamation-triangle text-red-500" aria-hidden="true"></i>
                {{ 'ai.evals.run.errors.' + error.key | transloco }}
              </span>
              @if (error.message) {
                <span class="text-xs break-words" data-testid="eval-run-error-message">{{
                  error.message
                }}</span>
              }
              @if (error.code) {
                <span class="text-muted-color font-mono text-xs">{{ error.code }}</span>
              }
              @if (error.details.length > 0) {
                <ul class="list-disc pl-5 text-xs">
                  @for (detail of error.details; track $index) {
                    <li>{{ detail }}</li>
                  }
                </ul>
              }
            </div>
          }

          <p class="text-muted-color text-xs">{{ 'ai.evals.run.paid' | transloco }}</p>

          <div class="flex justify-end gap-2">
            <button
              pButton
              type="button"
              severity="secondary"
              [text]="true"
              [disabled]="busy()"
              data-testid="eval-run-cancel"
              (click)="visible.set(false)"
            >
              {{ 'reasonDialog.cancel' | transloco }}
            </button>
            <button pButton type="submit" [disabled]="busy()" data-testid="eval-run-start">
              @if (busy()) {
                <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
              }
              {{ 'ai.evals.run.start' | transloco }}
            </button>
          </div>
        </form>
      }
    </p-dialog>
  `,
})
export class EvalRunDialog {
  readonly visible = model(false);
  readonly set = input.required<EvalSet>();
  readonly bindings = input.required<readonly SetBinding[]>();
  /** The registry; null while it loads or when it failed (the form then waits). */
  readonly models = input<readonly ModelResponseDto[] | null>(null);
  readonly providers = input<readonly ProviderResponseDto[] | null>(null);
  /** The run started (202): the server's summary, `running`. */
  readonly started = output<EvalSummaryDto>();

  private readonly data = inject(AiEvalsData);
  private readonly session = inject(SessionStore);

  protected readonly promptVersionMax = PROMPT_VERSION_MAX;
  protected readonly bounds = EVAL_SET_SIZE;
  protected readonly allowed = computed(() => this.session.hasLevel(EVAL_RUN_LEVEL));
  protected readonly form = computed(() => EVAL_FORM[this.set()]);

  protected readonly modelId = signal<string | null>(null);
  protected readonly promptVersion = signal('');
  protected readonly limit = signal(String(EVAL_SET_SIZE.default));
  protected readonly pronunciation = signal(false);
  protected readonly attempted = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<(ActionError & { message: string | null }) | null>(null);

  private readonly candidates = computed(() => {
    const models = this.models();
    return models ? candidates(this.set(), models, this.providers(), this.pronunciation()) : [];
  });

  protected readonly options = computed<CandidateOption[]>(() =>
    this.candidates().map((c) => ({
      id: c.model.id,
      label: c.model.displayName,
      providerCode: c.model.providerCode,
      status: c.model.status,
      disabled: c.block !== null,
      blockKey: c.block,
      why: c.block === 'lacksFeatures' ? c.lacking.join(', ') : null,
    })),
  );

  /** Today's prompt version of the set's agent: what an empty field runs. */
  protected readonly boundPrompt = computed(
    () => this.bindings()[0]?.binding?.promptVersion ?? null,
  );

  protected readonly modelMissing = computed(() => {
    if (!this.attempted()) return false;
    const id = this.modelId();
    return !id || !this.options().some((o) => o.id === id && !o.disabled);
  });

  private readonly parsedLimit = computed(() => {
    const text = this.limit().trim();
    if (!/^\d+$/.test(text)) return null;
    const n = Number(text);
    return n >= EVAL_SET_SIZE.min && n <= EVAL_SET_SIZE.max ? n : null;
  });

  protected readonly limitInvalid = computed(
    () => this.form().limit && this.parsedLimit() === null,
  );

  private running: Subscription | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.running?.unsubscribe());
    // Each opening starts clean, on today's primary model of the set.
    effect(() => {
      if (!this.visible()) return;
      untracked(() => {
        this.promptVersion.set('');
        this.limit.set(String(EVAL_SET_SIZE.default));
        this.pronunciation.set(false);
        this.attempted.set(false);
        this.error.set(null);
        this.modelId.set(defaultCandidate(this.candidates(), this.bindings()));
      });
    });
    // The registry may come in after the dialog opened: pick the default then.
    effect(() => {
      const list = this.candidates();
      if (!this.visible()) return;
      untracked(() => {
        if (this.modelId() === null) this.modelId.set(defaultCandidate(list, this.bindings()));
      });
    });
  }

  protected submit(): void {
    if (this.busy() || !this.allowed()) return;
    this.attempted.set(true);
    if (this.modelMissing() || this.limitInvalid()) return;

    const form = this.form();
    const prompt = this.promptVersion().trim();
    const request: EvalRunRequest = {
      modelId: this.modelId()!,
      ...(form.promptVersion && prompt ? { promptVersion: prompt } : {}),
      ...(form.limit ? { limit: this.parsedLimit()! } : {}),
      ...(form.pronunciation ? { pronunciation: this.pronunciation() } : {}),
    };

    this.busy.set(true);
    this.error.set(null);
    this.running = this.data.start(request).subscribe({
      next: (run) => {
        this.busy.set(false);
        this.running = null;
        this.visible.set(false);
        this.started.emit(run);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.running = null;
        const e = ApiError.from(error);
        // The 422s of a run are prose worth reading ("no settled drafts yet", the known prompt
        // versions); a code-like message is already shown as the code.
        const message = e.status === 422 || e.status === 503 ? e.message : null;
        this.error.set({
          ...describeActionError(error),
          message: message && message !== e.code ? message : null,
        });
      },
    });
  }
}
