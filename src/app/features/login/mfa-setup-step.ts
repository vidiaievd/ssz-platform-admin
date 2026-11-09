import { Component, computed, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
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
  imports: [ReactiveFormsModule, TranslocoPipe, Button, InputText, Skeleton],
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
                <p-button
                  [icon]="copied() ? 'pi pi-check' : 'pi pi-copy'"
                  [text]="true"
                  severity="secondary"
                  [ariaLabel]="'login.copy' | transloco"
                  [title]="'login.copy' | transloco"
                  (onClick)="copySecret(s.secretKey)"
                />
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
              <p-button
                type="submit"
                class="mt-2"
                [label]="'login.setup.confirm' | transloco"
                [loading]="busy()"
                [fluid]="true"
              />
            </form>
          </li>
        </ol>
      } @else if (failed()) {
        <p-button
          icon="pi pi-refresh"
          severity="secondary"
          [label]="'login.retry' | transloco"
          [loading]="busy()"
          (onClick)="retry.emit()"
        />
      } @else {
        <p-skeleton width="12rem" height="12rem" styleClass="self-center" />
        <p-skeleton height="2.5rem" />
      }

      <p-button
        [link]="true"
        size="small"
        icon="pi pi-arrow-left"
        class="self-start"
        [label]="'login.back' | transloco"
        (onClick)="back.emit()"
      />
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
