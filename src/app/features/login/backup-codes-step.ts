import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { Message } from 'primeng/message';
import { copyText, downloadText } from './clipboard';

export const BACKUP_CODES_FILE = 'ssz-admin-backup-codes.txt';

/**
 * The backup codes, shown once right after MFA setup. The panel goes on only after "I saved
 * them"; leaving the page before that asks the browser to confirm.
 */
@Component({
  selector: 'app-backup-codes-step',
  imports: [FormsModule, TranslocoPipe, Button, Checkbox, Message],
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  template: `
    <div class="flex flex-col gap-4">
      <p-message severity="warn">{{ 'login.codes.once' | transloco }}</p-message>
      <p class="text-muted-color text-sm">{{ 'login.codes.explain' | transloco }}</p>

      <ol
        class="bg-emphasis grid grid-cols-2 gap-x-6 gap-y-1 rounded-md p-4 font-mono text-sm"
        data-testid="backup-codes"
      >
        @for (code of codes(); track code) {
          <li>{{ code }}</li>
        }
      </ol>

      <div class="flex flex-wrap gap-2">
        <p-button
          [icon]="copied() ? 'pi pi-check' : 'pi pi-copy'"
          severity="secondary"
          [outlined]="true"
          [label]="(copied() ? 'login.copied' : 'login.copy') | transloco"
          (onClick)="copy()"
        />
        <p-button
          icon="pi pi-download"
          severity="secondary"
          [outlined]="true"
          [label]="'login.codes.download' | transloco"
          data-testid="download-codes"
          (onClick)="download()"
        />
      </div>
      @if (copyFailed()) {
        <small class="text-red-500">{{ 'login.codes.copyFailed' | transloco }}</small>
      }

      <div class="flex items-center gap-2 text-sm">
        <p-checkbox
          [binary]="true"
          inputId="codes-saved"
          [ngModel]="saved()"
          (ngModelChange)="saved.set($event)"
          data-testid="codes-saved"
        />
        <label for="codes-saved">{{ 'login.codes.saved' | transloco }}</label>
      </div>

      <p-button
        [label]="'login.codes.continue' | transloco"
        [disabled]="!saved()"
        [loading]="busy()"
        [fluid]="true"
        data-testid="codes-continue"
        (onClick)="done.emit()"
      />
    </div>
  `,
})
export class BackupCodesStep {
  private readonly transloco = inject(TranslocoService);

  readonly codes = input.required<readonly string[]>();
  readonly email = input('');
  readonly busy = input(false);
  readonly done = output<void>();

  protected readonly saved = signal(false);
  protected readonly copied = signal(false);
  protected readonly copyFailed = signal(false);

  private readonly text = computed(() => this.codes().join('\n'));

  protected async copy(): Promise<void> {
    const ok = await copyText(this.text());
    this.copyFailed.set(!ok);
    if (ok) {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }

  protected download(): void {
    downloadText(BACKUP_CODES_FILE, backupCodesFile(this.transloco, this.email(), this.codes()));
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.saved()) event.preventDefault();
  }
}

/** The saved file: what it is, whose, when — then one code per line. */
export function backupCodesFile(
  transloco: TranslocoService,
  email: string,
  codes: readonly string[],
  now: Date = new Date(),
): string {
  return [
    transloco.translate('login.codes.fileTitle'),
    email,
    now.toISOString().slice(0, 10),
    '',
    ...codes,
    '',
    transloco.translate('login.codes.fileNote'),
    '',
  ].join('\n');
}
