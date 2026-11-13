import {
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { Textarea } from 'primeng/textarea';
import { Observable, Subscription, startWith } from 'rxjs';
import { AdminLevel } from '../../core/auth/admin-level';
import { SessionStore } from '../../core/auth/session.store';
import { ActionError, describeActionError } from './action-error';

/** The servers' limit on a reason (`IsAdminReason`: non-empty, at most 500). */
export const REASON_MAX_LENGTH = 500;

/** An admin change: gets the trimmed reason, answers once on success. */
export type ReasonAction<T> = (reason: string) => Observable<T>;

/** A field that may move focus; the first one in the dialog takes it on opening. */
const FOCUSABLE = 'input, select, textarea, button, [tabindex]:not([tabindex="-1"])';

function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() === '' ? { required: true } : null;
}

/**
 * Every change an administrator makes goes through this dialog: the reason is required and lands
 * in the admin journal (§2 of plan 90). The action's own fields are projected above the reason
 * (`ready` says they are valid); the server's refusal is shown inside, and the dialog stays open
 * with what was typed. It closes and emits `done` only after the server agreed.
 *
 * The button that opens it is drawn under `*appIfLevel`; the dialog checks `level` too and shows
 * nothing to a lower level — the server checks once more anyway.
 */
@Component({
  selector: 'app-reason-dialog',
  imports: [ReactiveFormsModule, TranslocoPipe, ButtonDirective, Dialog, Textarea],
  template: `
    <p-dialog
      [(visible)]="visible"
      [header]="header()"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [focusOnShow]="false"
      [closable]="!busy()"
      [closeOnEscape]="!busy()"
      [style]="{ width: '32rem' }"
      [breakpoints]="{ '640px': 'calc(100vw - 2rem)' }"
      [closeAriaLabel]="'reasonDialog.cancel' | transloco"
    >
      @if (allowed()) {
        <form
          #reasonForm
          class="flex flex-col gap-4"
          data-testid="reason-dialog"
          [formGroup]="form"
          (ngSubmit)="submit()"
        >
          <ng-content />

          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium" [for]="fieldId">
              {{ 'reasonDialog.label' | transloco }}
            </label>
            <textarea
              pTextarea
              [id]="fieldId"
              rows="3"
              class="w-full"
              formControlName="reason"
              [attr.maxlength]="maxLength"
              [attr.aria-invalid]="showReasonError() ? 'true' : null"
              [attr.aria-describedby]="fieldId + '-hint'"
              data-testid="reason-input"
              (blur)="attempted.set(true)"
            ></textarea>
            <div
              class="text-muted-color flex justify-between gap-2 text-xs"
              [id]="fieldId + '-hint'"
            >
              @if (showReasonError()) {
                <span class="text-red-600 dark:text-red-400" data-testid="reason-required">
                  {{ 'reasonDialog.required' | transloco }}
                </span>
              } @else {
                <span>{{ 'reasonDialog.hint' | transloco }}</span>
              }
              <span class="tabular-nums" data-testid="reason-counter">
                {{ length() }} / {{ maxLength }}
              </span>
            </div>
          </div>

          @if (error(); as error) {
            <div
              role="alert"
              class="flex flex-col gap-1 rounded-md border border-red-300 px-3 py-2 text-sm dark:border-red-800"
              data-testid="reason-error"
            >
              <span class="flex items-center gap-2">
                <i class="pi pi-exclamation-triangle text-red-500" aria-hidden="true"></i>
                {{ 'reasonDialog.errors.' + error.key | transloco }}
              </span>
              @if (error.code) {
                <span class="text-muted-color font-mono text-xs" data-testid="reason-error-code">
                  {{ error.code }}
                </span>
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
              data-testid="reason-cancel"
              (click)="visible.set(false)"
            >
              {{ 'reasonDialog.cancel' | transloco }}
            </button>
            <button
              pButton
              type="submit"
              [severity]="danger() ? 'danger' : 'primary'"
              [disabled]="busy()"
              data-testid="reason-confirm"
            >
              @if (busy()) {
                <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
              }
              {{ confirmLabel() }}
            </button>
          </div>
        </form>
      }
    </p-dialog>
  `,
})
export class ReasonDialog<T = unknown> {
  readonly visible = model(false);
  readonly header = input.required<string>();
  readonly confirmLabel = input.required<string>();
  /** The lowest level that may run the action. */
  readonly level = input.required<AdminLevel>();
  readonly action = input.required<ReasonAction<T>>();
  /** The projected fields of the action are valid; the reason is checked here. */
  readonly ready = input(true);
  /** Destructive actions (revoke, cancel) get a red confirm button. */
  readonly danger = input(false);
  /** The server agreed; the dialog is already closing. */
  readonly done = output<T>();

  private static nextId = 0;
  protected readonly fieldId = `reason-${ReasonDialog.nextId++}`;
  protected readonly maxLength = REASON_MAX_LENGTH;

  private readonly session = inject(SessionStore);
  private readonly document = inject(DOCUMENT);
  private readonly content = viewChild<ElementRef<HTMLElement>>('reasonForm');

  protected readonly allowed = computed(() => this.session.hasLevel(this.level()));

  protected readonly form = new FormGroup({
    reason: new FormControl('', {
      nonNullable: true,
      validators: [notBlank, Validators.maxLength(REASON_MAX_LENGTH)],
    }),
  });

  private readonly reasonValue = toSignal(
    this.form.controls.reason.valueChanges.pipe(startWith(this.form.controls.reason.value)),
    { requireSync: true },
  );
  protected readonly length = computed(() => this.reasonValue().length);

  protected readonly busy = signal(false);
  protected readonly error = signal<ActionError | null>(null);
  /** The reason's error is shown once the field was left or a submit was tried. */
  protected readonly attempted = signal(false);
  protected readonly showReasonError = computed(
    () => this.attempted() && this.reasonValue().trim() === '',
  );

  private running: Subscription | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.running?.unsubscribe());
    // Each opening starts clean: an earlier refusal or reason must not leak into the next action.
    effect(() => {
      if (!this.visible()) return;
      untracked(() => {
        this.form.reset();
        this.error.set(null);
        this.attempted.set(false);
        this.focusFirstFieldWhenAttached();
      });
    });
  }

  protected submit(): void {
    if (this.busy() || !this.allowed()) return;
    this.attempted.set(true);
    if (this.form.invalid || !this.ready()) return;

    this.busy.set(true);
    this.error.set(null);
    this.running = this.action()(this.reasonValue().trim()).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.running = null;
        this.visible.set(false);
        this.done.emit(result);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.running = null;
        this.error.set(describeActionError(error));
      },
    });
  }

  /**
   * p-dialog creates its content at once but attaches it a few frames later, and `onShow` fires
   * after the animation (see the command palette) — so focus is retried frame by frame.
   */
  private focusFirstFieldWhenAttached(framesLeft = 30): void {
    if (!this.visible()) return;
    const root = this.content()?.nativeElement;
    const field = root?.isConnected ? root.querySelector<HTMLElement>(FOCUSABLE) : null;
    if (field) {
      field.focus();
      if (this.document.activeElement === field) return;
    }
    if (framesLeft > 0) {
      requestAnimationFrame(() => this.focusFirstFieldWhenAttached(framesLeft - 1));
    }
  }
}
