import { Component, computed, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Skeleton } from 'primeng/skeleton';
import { MfaSetupSecret } from '../../core/auth/admin-session.api';
import { copyText } from './clipboard';
import { cleanTotpCode, totpCodeValidator } from './code-field';

/**
 * MFA setup for an administrator who has none: scan the QR (or type the secret), then the first
 * code turns MFA on. `secret` is null while it loads; `failed` offers another try.
 */
@Component({
  selector: 'app-mfa-setup-step',
  imports: [ReactiveFormsModule, TranslocoPipe, ButtonDirective, InputText, Skeleton],
  template: `
    <div class="flex flex-col gap-4">
      <p class="text-muted-color text-sm">{{ 'login.setup.intro' | transloco }}</p>

      @if (secret(); as s) {
        <ol class="flex list-decimal flex-col gap-4 ps-5 text-sm">
          <li>
            <div class="flex flex-col gap-3">
              <span>{{ 'login.setup.scan' | transloco }}</span>
              <img
                class="size-48 self-center rounded-md bg-white p-2"
                [src]="qrSrc()"
                [alt]="'login.setup.qrAlt' | transloco"
                data-testid="setup-qr"
              />
              <span class="text-muted-color">{{ 'login.setup.orEnter' | transloco }}</span>
              <div class="flex items-center gap-2">
                <code
                  class="bg-emphasis grow rounded-md px-3 py-2 font-mono text-sm break-all"
                  data-testid="setup-secret"
                  >{{ groupedSecret() }}</code
                >
                <button
                  pButton
                  type="button"
                  [text]="true"
                  [iconOnly]="true"
                  severity="secondary"
                  [attr.aria-label]="'login.copy' | transloco"
                  [title]="'login.copy' | transloco"
                  (click)="copySecret(s.secretKey)"
                >
                  <i [class]="copied() ? 'pi pi-check' : 'pi pi-copy'" aria-hidden="true"></i>
                </button>
              </div>
              <a class="text-primary text-sm underline sm:hidden" [href]="s.qrCodeUri">
                {{ 'login.setup.openApp' | transloco }}
              </a>
            </div>
          </li>
          <li>
            <form class="flex flex-col gap-2" [formGroup]="form" (ngSubmit)="submit()" novalidate>
              <label for="setup-code">{{ 'login.setup.enterCode' | transloco }}</label>
              <input
                pInputText
                id="setup-code"
                [formControl]="code"
                inputmode="numeric"
                autocomplete="one-time-code"
                placeholder="123456"
                maxlength="7"
                class="font-mono text-lg tracking-[0.3em]"
                [invalid]="showErrors() && code.invalid"
              />
              @if (showErrors() && code.invalid) {
                <small class="text-red-500">{{ 'login.codeFormat' | transloco }}</small>
              }
              <button pButton type="submit" class="mt-2" [fluid]="true" [disabled]="busy()">
                @if (busy()) {
                  <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
                }
                {{ 'login.setup.confirm' | transloco }}
              </button>
            </form>
          </li>
        </ol>
      } @else if (failed()) {
        <button
          pButton
          type="button"
          severity="secondary"
          class="self-start"
          [disabled]="busy()"
          (click)="retry.emit()"
        >
          <i [class]="busy() ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'" aria-hidden="true"></i>
          {{ 'login.retry' | transloco }}
        </button>
      } @else {
        <p-skeleton width="12rem" height="12rem" styleClass="self-center" />
        <p-skeleton height="2.5rem" />
      }

      <button
        pButton
        type="button"
        [link]="true"
        size="small"
        class="self-start"
        (click)="back.emit()"
      >
        <i class="pi pi-arrow-left" aria-hidden="true"></i>
        {{ 'login.back' | transloco }}
      </button>
    </div>
  `,
})
export class MfaSetupStep {
  private readonly fb = inject(NonNullableFormBuilder);

  readonly secret = input<MfaSetupSecret | null>(null);
  readonly failed = input(false);
  readonly busy = input(false);
  readonly submitted = output<string>();
  readonly retry = output<void>();
  readonly back = output<void>();

  protected readonly showErrors = signal(false);
  protected readonly copied = signal(false);
  protected readonly code = this.fb.control('', totpCodeValidator);
  protected readonly form = this.fb.group({ code: this.code });

  protected readonly qrSrc = computed(() => {
    const image = this.secret()?.qrCodeImageBase64;
    return image ? `data:image/png;base64,${image}` : '';
  });

  /** `JBSW Y3DP EHPK 3PXP` reads and types easier than one long run. */
  protected readonly groupedSecret = computed(
    () =>
      this.secret()
        ?.secretKey.match(/.{1,4}/g)
        ?.join(' ') ?? '',
  );

  protected async copySecret(secret: string): Promise<void> {
    if (await copyText(secret)) {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }

  protected submit(): void {
    if (this.busy()) return;
    if (this.code.invalid) {
      this.showErrors.set(true);
      return;
    }
    this.submitted.emit(cleanTotpCode(this.code.value));
    this.code.reset();
    this.showErrors.set(false);
  }
}
