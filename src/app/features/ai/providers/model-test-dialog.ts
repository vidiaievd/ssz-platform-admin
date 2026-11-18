import { JsonPipe } from '@angular/common';
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
import { Dialog } from 'primeng/dialog';
import { Tag } from 'primeng/tag';
import { Textarea } from 'primeng/textarea';
import { Subscription } from 'rxjs';
import { AiApi } from '../../../api/ai/ai-api';
import { adminRegistryTestModel } from '../../../api/ai/functions';
import { ModelResponseDto } from '../../../api/ai/models/model-response-dto';
import { TestModelResponseDto } from '../../../api/ai/models/test-model-response-dto';
import { SessionStore } from '../../../core/auth/session.store';
import { LanguageService } from '../../../core/i18n/language.service';
import { ActionError, describeActionError } from '../../../shared/reason-dialog/action-error';
import { REASON_MAX_LENGTH } from '../../../shared/reason-dialog/reason-dialog';
import { formatMoney } from '../spend/spend-model';

/** The level the server asks for a test. */
export const TEST_LEVEL = 'admin' as const;

/**
 * "Test" of one language model (level `admin`): one short structured call, billed to the
 * platform and written to the ledger and the admin journal (`model.tested`). It changes
 * nothing, so the reason is optional — unlike every other change, it does not go through
 * `ReasonDialog`. The answer stays in the dialog: outcome, latency, cost; a failed call is an
 * answer too (`outcome: error`), only a refused test (404, 422) is an error.
 */
@Component({
  selector: 'app-model-test-dialog',
  imports: [JsonPipe, FormsModule, TranslocoPipe, ButtonDirective, Dialog, Tag, Textarea],
  template: `
    <p-dialog
      [(visible)]="visible"
      [header]="'ai.providers.test.title' | transloco: { model: target()?.displayName ?? '' }"
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
        <form class="flex flex-col gap-4" data-testid="model-test-dialog" (ngSubmit)="run()">
          <p class="text-muted-color text-sm">{{ 'ai.providers.test.hint' | transloco }}</p>

          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium" for="model-test-reason">
              {{ 'ai.providers.test.reason' | transloco }}
            </label>
            <textarea
              pTextarea
              id="model-test-reason"
              rows="2"
              class="w-full"
              name="reason"
              [attr.maxlength]="maxLength"
              [ngModel]="reason()"
              (ngModelChange)="reason.set($event)"
              data-testid="model-test-reason"
            ></textarea>
            <div class="text-muted-color flex justify-between gap-2 text-xs">
              <span>{{ 'ai.providers.test.reasonHint' | transloco }}</span>
              <span class="tabular-nums">{{ reason().length }} / {{ maxLength }}</span>
            </div>
          </div>

          @if (error(); as error) {
            <div
              role="alert"
              class="flex flex-col gap-1 rounded-md border border-red-300 px-3 py-2 text-sm dark:border-red-800"
              data-testid="model-test-error"
            >
              <span class="flex items-center gap-2">
                <i class="pi pi-exclamation-triangle text-red-500" aria-hidden="true"></i>
                {{ 'reasonDialog.errors.' + error.key | transloco }}
              </span>
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

          @if (result(); as r) {
            <div
              role="status"
              class="border-border flex flex-col gap-2 rounded-md border px-3 py-2 text-sm"
              data-testid="model-test-result"
            >
              <div class="flex flex-wrap items-center gap-2">
                <p-tag
                  [severity]="
                    r.outcome === 'ok' ? 'success' : r.outcome === 'error' ? 'danger' : 'warn'
                  "
                  [value]="'ai.providers.test.outcome.' + r.outcome | transloco"
                  data-testid="model-test-outcome"
                />
                @if (r.errorCode) {
                  <span class="font-mono text-xs" data-testid="model-test-error-code">{{
                    r.errorCode
                  }}</span>
                }
                @if (r.retryable !== null && r.outcome !== 'ok') {
                  <span class="text-muted-color text-xs">
                    {{
                      (r.retryable ? 'ai.providers.test.retryable' : 'ai.providers.test.final')
                        | transloco
                    }}
                  </span>
                }
              </div>
              @if (r.errorMessage) {
                <p class="text-xs break-words" data-testid="model-test-message">
                  {{ r.errorMessage }}
                </p>
              }
              <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                <dt class="text-muted-color">{{ 'ai.providers.test.latency' | transloco }}</dt>
                <dd class="tabular-nums" data-testid="model-test-latency">
                  {{ 'ai.providers.test.ms' | transloco: { ms: r.latencyMs } }}
                </dd>
                <dt class="text-muted-color">{{ 'ai.providers.test.cost' | transloco }}</dt>
                <dd class="tabular-nums" data-testid="model-test-cost">
                  @if (cost(); as cost) {
                    {{ cost }}
                    @if (r.credits) {
                      <span class="text-muted-color">
                        · {{ 'ai.providers.test.credits' | transloco: { credits: r.credits } }}
                      </span>
                    }
                  } @else {
                    {{ 'ai.providers.test.noPrice' | transloco }}
                  }
                </dd>
                @if (r.usage; as u) {
                  <dt class="text-muted-color">{{ 'ai.providers.test.tokens' | transloco }}</dt>
                  <dd class="tabular-nums" data-testid="model-test-tokens">
                    {{ u.input }} / {{ u.output }}
                  </dd>
                }
                <dt class="text-muted-color">{{ 'ai.providers.test.callId' | transloco }}</dt>
                <dd class="font-mono break-all">{{ r.callId }}</dd>
              </dl>
              @if (r.output) {
                <details class="text-xs">
                  <summary class="cursor-pointer">
                    {{ 'ai.providers.test.output' | transloco }}
                  </summary>
                  <pre class="mt-1 max-h-48 overflow-auto whitespace-pre-wrap">{{
                    r.output | json
                  }}</pre>
                </details>
              }
            </div>
          }

          <div class="flex justify-end gap-2">
            <button
              pButton
              type="button"
              severity="secondary"
              [text]="true"
              [disabled]="busy()"
              data-testid="model-test-close"
              (click)="visible.set(false)"
            >
              {{ 'ai.providers.test.close' | transloco }}
            </button>
            <button pButton type="submit" [disabled]="busy()" data-testid="model-test-run">
              @if (busy()) {
                <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
              }
              {{ (result() ? 'ai.providers.test.again' : 'ai.providers.test.run') | transloco }}
            </button>
          </div>
        </form>
      }
    </p-dialog>
  `,
})
export class ModelTestDialog {
  readonly visible = model(false);
  readonly target = input<ModelResponseDto | null>(null);
  /** A test ran (whatever its outcome): the ledger has a new row. */
  readonly tested = output<TestModelResponseDto>();

  private readonly ai = inject(AiApi);
  private readonly session = inject(SessionStore);
  private readonly lang = inject(LanguageService).current;

  protected readonly maxLength = REASON_MAX_LENGTH;
  protected readonly allowed = computed(() => this.session.hasLevel(TEST_LEVEL));

  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<ActionError | null>(null);
  protected readonly result = signal<TestModelResponseDto | null>(null);

  /** Cost in its currency; null when the model has no price in effect. */
  protected readonly cost = computed(() => {
    const cost = this.result()?.cost;
    return cost ? formatMoney(cost.micros, cost.currency, this.lang()) : null;
  });

  private running: Subscription | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.running?.unsubscribe());
    // Each opening starts clean: the last model's answer must not show for the next one.
    effect(() => {
      if (!this.visible()) return;
      untracked(() => {
        this.reason.set('');
        this.error.set(null);
        this.result.set(null);
      });
    });
  }

  protected run(): void {
    const target = this.target();
    if (!target || this.busy() || !this.allowed()) return;
    const reason = this.reason().trim();
    this.busy.set(true);
    this.error.set(null);
    this.running = this.ai
      .invoke(adminRegistryTestModel, { id: target.id, body: reason ? { reason } : {} })
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          this.running = null;
          this.result.set(result);
          this.tested.emit(result);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.running = null;
          this.result.set(null);
          this.error.set(describeActionError(error));
        },
      });
  }
}
