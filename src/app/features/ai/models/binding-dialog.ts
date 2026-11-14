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
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Tag } from 'primeng/tag';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { AiApi } from '../../../api/ai/ai-api';
import { adminBindingsPut } from '../../../api/ai/functions';
import { BindingResponseDto } from '../../../api/ai/models/binding-response-dto';
import { PutBindingDto } from '../../../api/ai/models/put-binding-dto';
import { ReasonDialog } from '../../../shared/reason-dialog/reason-dialog';
import { AgentBindingRow, ModelOption, Registry, bindableModels } from './agent-binding-rows';

/** The server's bounds (`PutBindingDto`). */
export const TIMEOUT_MIN_MS = 1000;
export const TIMEOUT_MAX_MS = 600_000;
export const PROMPT_VERSION_MAX = 100;
export const TEMPERATURE_MAX = 2;

/** Starting values of a capability that has never been bound. */
const NEW_BINDING = { maxOutputTokens: '2048', timeoutMs: '30000' } as const;

/** A whole number typed in a field; null when it is not one. */
function wholeNumber(text: string): number | null {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/** `0,7` or `0.7`; null when the field is empty or not a number. */
function decimal(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : null;
}

/**
 * "Change models" of one capability (level `super`): the primary model, an optional fallback
 * (another provider is fine), the switch, the prompt version and the limits. Only models of the
 * capability's modality that are not `disabled` are offered; the server checks the rest and its
 * 422 lists every problem inside the dialog. The write carries the version the screen was read
 * at, so someone else's change in between is a 409 ("changed meanwhile"), never overwritten.
 * Output tokens and temperature apply to language models only and are not shown for the others.
 */
@Component({
  selector: 'app-binding-dialog',
  imports: [
    NgTemplateOutlet,
    FormsModule,
    TranslocoPipe,
    InputText,
    Select,
    Tag,
    ToggleSwitch,
    ReasonDialog,
  ],
  template: `
    <app-reason-dialog
      [(visible)]="visible"
      [header]="'ai.models.dialog.title' | transloco: { capability: row()?.capability ?? '' }"
      [confirmLabel]="'ai.models.dialog.confirm' | transloco"
      level="super"
      [ready]="ready()"
      [action]="save"
      [(attempted)]="attempted"
      (done)="done.emit($event)"
    >
      @if (row(); as row) {
        @if (row.requirements.length > 0) {
          <p class="text-muted-color text-xs" data-testid="binding-requirements">
            {{ 'ai.models.dialog.requires' | transloco }}: {{ row.requirements.join(' · ') }}
          </p>
        }

        <div class="flex flex-col gap-1">
          <label class="field-required text-sm font-medium" for="binding-primary">
            {{ 'ai.models.primary' | transloco }}
          </label>
          <p-select
            inputId="binding-primary"
            class="w-full"
            appendTo="body"
            [options]="options()"
            optionLabel="label"
            optionValue="id"
            [ngModel]="primaryId()"
            (ngModelChange)="primaryId.set($event)"
            [ngModelOptions]="{ standalone: true }"
            [placeholder]="'ai.models.dialog.pickModel' | transloco"
            [invalid]="primaryMissing()"
            data-testid="binding-primary"
          >
            <ng-template #item let-option>
              <ng-container
                *ngTemplateOutlet="optionView; context: { $implicit: option }"
              ></ng-container>
            </ng-template>
          </p-select>
          @if (primaryMissing()) {
            <span
              class="text-xs text-red-600 dark:text-red-400"
              data-testid="binding-primary-error"
            >
              {{ 'reasonDialog.fieldRequired' | transloco }}
            </span>
          } @else if (options().length === 0) {
            <span class="text-xs text-red-600 dark:text-red-400" data-testid="binding-no-models">
              {{ 'ai.models.dialog.noModels' | transloco: { modality: row.modality } }}
            </span>
          }
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium" for="binding-fallback">
            {{ 'ai.models.fallback' | transloco }}
          </label>
          <p-select
            inputId="binding-fallback"
            class="w-full"
            appendTo="body"
            [options]="fallbackOptions()"
            optionLabel="label"
            optionValue="id"
            [showClear]="true"
            [ngModel]="fallbackId()"
            (ngModelChange)="fallbackId.set($event ?? null)"
            [ngModelOptions]="{ standalone: true }"
            [placeholder]="'ai.models.dialog.noFallback' | transloco"
            data-testid="binding-fallback"
          >
            <ng-template #item let-option>
              <ng-container
                *ngTemplateOutlet="optionView; context: { $implicit: option }"
              ></ng-container>
            </ng-template>
          </p-select>
          <span class="text-muted-color text-xs">{{
            'ai.models.dialog.fallbackHint' | transloco
          }}</span>
        </div>

        <div class="flex items-center gap-3">
          <p-toggleswitch
            inputId="binding-enabled"
            [ngModel]="enabled()"
            (ngModelChange)="enabled.set($event)"
            [ngModelOptions]="{ standalone: true }"
            data-testid="binding-enabled"
          />
          <label class="text-sm" for="binding-enabled">
            {{
              (enabled() ? 'ai.models.dialog.enabledOn' : 'ai.models.dialog.enabledOff') | transloco
            }}
          </label>
        </div>

        <div class="flex flex-col gap-1">
          <label class="field-required text-sm font-medium" for="binding-prompt">
            {{ 'ai.models.promptVersion' | transloco }}
          </label>
          <input
            pInputText
            id="binding-prompt"
            class="w-full font-mono"
            [attr.maxlength]="promptVersionMax"
            [ngModel]="promptVersion()"
            (ngModelChange)="promptVersion.set($event)"
            [ngModelOptions]="{ standalone: true }"
            aria-required="true"
            [invalid]="promptMissing()"
            [attr.aria-invalid]="promptMissing() ? 'true' : null"
            data-testid="binding-prompt"
          />
          @if (promptMissing()) {
            <span class="text-xs text-red-600 dark:text-red-400" data-testid="binding-prompt-error">
              {{ 'reasonDialog.fieldRequired' | transloco }}
            </span>
          } @else {
            <span class="text-muted-color text-xs">{{
              'ai.models.dialog.promptHint' | transloco
            }}</span>
          }
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          @if (isLlm()) {
            <div class="flex flex-col gap-1">
              <label class="field-required text-sm font-medium" for="binding-max-output">
                {{ 'ai.models.maxOutputTokens' | transloco }}
              </label>
              <input
                pInputText
                id="binding-max-output"
                inputmode="numeric"
                class="w-full tabular-nums"
                [ngModel]="maxOutputTokens()"
                (ngModelChange)="maxOutputTokens.set($event)"
                [ngModelOptions]="{ standalone: true }"
                aria-required="true"
                [invalid]="!!maxOutputError()"
                [attr.aria-invalid]="maxOutputError() ? 'true' : null"
                data-testid="binding-max-output"
              />
              @switch (maxOutputError()) {
                @case ('required') {
                  <span
                    class="text-xs text-red-600 dark:text-red-400"
                    data-testid="binding-max-output-error"
                  >
                    {{ 'reasonDialog.fieldRequired' | transloco }}
                  </span>
                }
                @case ('invalid') {
                  <span
                    class="text-xs text-red-600 dark:text-red-400"
                    data-testid="binding-max-output-error"
                  >
                    {{ 'ai.models.dialog.wholeNumber' | transloco }}
                  </span>
                }
                @case ('tooLarge') {
                  <span
                    class="text-xs text-red-600 dark:text-red-400"
                    data-testid="binding-max-output-error"
                  >
                    {{ 'ai.models.dialog.maxOutputTooLarge' | transloco: { max: outputCeiling() } }}
                  </span>
                }
                @default {
                  @if (outputCeiling() !== null) {
                    <span class="text-muted-color text-xs">
                      {{ 'ai.models.dialog.maxOutputHint' | transloco: { max: outputCeiling() } }}
                    </span>
                  }
                }
              }
            </div>
          }

          <div class="flex flex-col gap-1">
            <label class="field-required text-sm font-medium" for="binding-timeout">
              {{ 'ai.models.timeoutMs' | transloco }}
            </label>
            <input
              pInputText
              id="binding-timeout"
              inputmode="numeric"
              class="w-full tabular-nums"
              [ngModel]="timeoutMs()"
              (ngModelChange)="timeoutMs.set($event)"
              [ngModelOptions]="{ standalone: true }"
              aria-required="true"
              [invalid]="!!timeoutError()"
              [attr.aria-invalid]="timeoutError() ? 'true' : null"
              data-testid="binding-timeout"
            />
            @if (timeoutError() === 'required') {
              <span
                class="text-xs text-red-600 dark:text-red-400"
                data-testid="binding-timeout-error"
              >
                {{ 'reasonDialog.fieldRequired' | transloco }}
              </span>
            } @else if (timeoutError()) {
              <span
                class="text-xs text-red-600 dark:text-red-400"
                data-testid="binding-timeout-error"
              >
                {{
                  'ai.models.dialog.timeoutRange' | transloco: { min: timeoutMin, max: timeoutMax }
                }}
              </span>
            } @else {
              <span class="text-muted-color text-xs">{{
                'ai.models.dialog.timeoutHint' | transloco
              }}</span>
            }
          </div>

          @if (isLlm()) {
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium" for="binding-temperature">
                {{ 'ai.models.temperature' | transloco }}
              </label>
              <input
                pInputText
                id="binding-temperature"
                inputmode="decimal"
                class="w-full tabular-nums"
                [ngModel]="temperature()"
                (ngModelChange)="temperature.set($event)"
                [ngModelOptions]="{ standalone: true }"
                [invalid]="temperatureInvalid()"
                [attr.aria-invalid]="temperatureInvalid() ? 'true' : null"
                data-testid="binding-temperature"
              />
              @if (temperatureInvalid()) {
                <span
                  class="text-xs text-red-600 dark:text-red-400"
                  data-testid="binding-temperature-error"
                >
                  {{ 'ai.models.dialog.temperatureRange' | transloco: { max: temperatureMax } }}
                </span>
              } @else {
                <span class="text-muted-color text-xs">{{
                  'ai.models.dialog.temperatureHint' | transloco
                }}</span>
              }
            </div>
          }
        </div>
      }
    </app-reason-dialog>

    <ng-template #optionView let-option>
      <span class="flex flex-wrap items-center gap-2">
        {{ option.label }}
        <span class="text-muted-color font-mono text-xs">
          {{ option.providerCode }}{{ option.region ? ' · ' + option.region : '' }}
        </span>
        @if (option.status === 'deprecated') {
          <p-tag severity="warn" [value]="'ai.models.status.deprecated' | transloco" />
        }
      </span>
    </ng-template>
  `,
})
export class BindingDialog {
  readonly visible = model(false);
  /** The capability being edited; its binding (if any) is the starting point. */
  readonly row = input<AgentBindingRow | null>(null);
  readonly registry = input.required<Registry>();
  readonly done = output<BindingResponseDto>();

  private readonly ai = inject(AiApi);

  protected readonly promptVersionMax = PROMPT_VERSION_MAX;
  protected readonly timeoutMin = TIMEOUT_MIN_MS;
  protected readonly timeoutMax = TIMEOUT_MAX_MS;
  protected readonly temperatureMax = TEMPERATURE_MAX;

  protected readonly primaryId = signal<string | null>(null);
  protected readonly fallbackId = signal<string | null>(null);
  protected readonly enabled = signal(true);
  protected readonly promptVersion = signal('');
  protected readonly maxOutputTokens = signal('');
  protected readonly timeoutMs = signal('');
  protected readonly temperature = signal('');
  /** A submit was tried: from now on empty required fields are marked (ReasonDialog clears it). */
  protected readonly attempted = signal(false);

  protected readonly isLlm = computed(() => this.row()?.modality === 'llm');

  protected readonly options = computed<ModelOption[]>(() => {
    const row = this.row();
    return row ? bindableModels(row.modality, this.registry()) : [];
  });
  /** The fallback must differ from the primary (the server refuses the same model twice). */
  protected readonly fallbackOptions = computed(() =>
    this.options().filter((o) => o.id !== this.primaryId()),
  );

  private readonly primary = computed(
    () => this.options().find((o) => o.id === this.primaryId()) ?? null,
  );
  private readonly fallback = computed(
    () => this.fallbackOptions().find((o) => o.id === this.fallbackId()) ?? null,
  );

  protected readonly primaryMissing = computed(() => this.attempted() && !this.primary());
  protected readonly promptMissing = computed(
    () => this.attempted() && this.promptVersion().trim() === '',
  );

  /** Both models' output caps bound `maxOutputTokens`; null until a model is chosen. */
  protected readonly outputCeiling = computed(() => {
    const caps = [this.primary(), this.fallback()]
      .map((o) => o?.maxOutput)
      .filter((v): v is number => typeof v === 'number');
    return caps.length > 0 ? Math.min(...caps) : null;
  });

  protected readonly maxOutputError = computed<'required' | 'invalid' | 'tooLarge' | null>(() => {
    if (!this.isLlm()) return null;
    const text = this.maxOutputTokens();
    if (text.trim() === '') return this.attempted() ? 'required' : null;
    const value = wholeNumber(text);
    if (value === null || value < 1) return 'invalid';
    const ceiling = this.outputCeiling();
    return ceiling !== null && value > ceiling ? 'tooLarge' : null;
  });

  protected readonly timeoutError = computed<'required' | 'range' | null>(() => {
    const text = this.timeoutMs();
    if (text.trim() === '') return this.attempted() ? 'required' : null;
    const value = wholeNumber(text);
    return value === null || value < TIMEOUT_MIN_MS || value > TIMEOUT_MAX_MS ? 'range' : null;
  });

  protected readonly temperatureInvalid = computed(() => {
    if (!this.isLlm() || this.temperature().trim() === '') return false;
    const value = decimal(this.temperature());
    return value === null || value > TEMPERATURE_MAX;
  });

  protected readonly ready = computed(
    () =>
      !!this.primary() &&
      // A fallback that is no longer offered (disabled since) must be cleared first.
      (this.fallbackId() === null || !!this.fallback()) &&
      this.promptVersion().trim() !== '' &&
      (!this.isLlm() || (this.maxOutputTokens().trim() !== '' && !this.maxOutputError())) &&
      this.timeoutMs().trim() !== '' &&
      !this.timeoutError() &&
      !this.temperatureInvalid(),
  );

  constructor() {
    // Each opening starts from the binding as the screen read it.
    effect(() => {
      if (!this.visible()) return;
      untracked(() => {
        const binding = this.row()?.binding ?? null;
        this.primaryId.set(binding?.primaryModelId ?? null);
        this.fallbackId.set(binding?.fallbackModelId ?? null);
        this.enabled.set(binding?.enabled ?? true);
        this.promptVersion.set(binding?.promptVersion ?? '');
        this.maxOutputTokens.set(
          binding ? String(binding.maxOutputTokens) : NEW_BINDING.maxOutputTokens,
        );
        this.timeoutMs.set(binding ? String(binding.timeoutMs) : NEW_BINDING.timeoutMs);
        this.temperature.set(
          binding && binding.temperature !== null ? String(binding.temperature) : '',
        );
      });
    });
  }

  protected readonly save = (reason: string) => {
    const row = this.row()!;
    const binding = row.binding;
    const llm = this.isLlm();
    const body: PutBindingDto = {
      primaryModelId: this.primaryId()!,
      fallbackModelId: this.fallbackId(),
      enabled: this.enabled(),
      promptVersion: this.promptVersion().trim(),
      // Not shown for speech and synthesis: the server ignores it there, the stored value stays.
      maxOutputTokens: llm
        ? wholeNumber(this.maxOutputTokens())!
        : (binding?.maxOutputTokens ?? Number(NEW_BINDING.maxOutputTokens)),
      timeoutMs: wholeNumber(this.timeoutMs())!,
      temperature: llm ? decimal(this.temperature()) : (binding?.temperature ?? null),
      // 0 = "only create": a binding someone made meanwhile is a 409, not overwritten.
      expectedVersion: binding?.version ?? 0,
      reason,
    };
    return this.ai.invoke(adminBindingsPut, { capability: row.capability, body });
  };
}
