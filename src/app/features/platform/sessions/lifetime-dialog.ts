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
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';
import {
  ClientType,
  TokenLifetimes,
  TokenLifetimesApi,
} from '../../../core/auth/token-lifetimes.api';
import { ReasonDialog } from '../../../shared/reason-dialog/reason-dialog';
import { DurationPipe } from './duration.pipe';
import { LifetimeUnit, naturalUnit, parseLifetime } from './token-lifetime-rows';

/** The pair being changed and what it has now. */
export interface LifetimeTarget {
  readonly role: string;
  readonly clientType: ClientType;
  readonly hours: number;
  /** No row of its own: the fallback is in force, saving creates the row. */
  readonly isFallback: boolean;
}

const UNITS: readonly LifetimeUnit[] = ['hours', 'days'];

/**
 * "Change lifetime" of one role × client (plan 90, phase 8, step 11). The value is typed in
 * hours or days, checked against the server's bounds before sending; the server ignores a pair
 * sent with its current value, so an unchanged value cannot be saved. `super` only.
 */
@Component({
  selector: 'app-lifetime-dialog',
  imports: [FormsModule, TranslocoPipe, InputText, SelectButton, ReasonDialog, DurationPipe],
  template: `
    <app-reason-dialog
      [(visible)]="visible"
      [(attempted)]="attempted"
      [header]="'platform.sessions.dialog.title' | transloco"
      [confirmLabel]="'platform.sessions.dialog.confirm' | transloco"
      level="super"
      [ready]="ready()"
      [action]="save"
      (done)="done.emit($event)"
    >
      @if (target(); as t) {
        <p class="text-sm" data-testid="lifetime-target">
          {{ 'platform.sessions.roles.' + t.role | transloco: { role: t.role } }} ·
          {{ 'platform.sessions.clients.' + t.clientType | transloco }}
        </p>
        <p class="text-muted-color text-sm" data-testid="lifetime-current">
          {{ 'platform.sessions.dialog.current' | transloco: { value: (t.hours | duration) } }}
          @if (t.isFallback) {
            · {{ 'platform.sessions.dialog.fallbackNow' | transloco }}
          }
        </p>
      }

      @let boundsText =
        'platform.sessions.dialog.bounds'
          | transloco: { min: (bounds().minHours | duration), max: (bounds().maxHours | duration) };
      <div class="flex flex-col gap-1">
        <label class="field-required text-sm font-medium" for="lifetime-value">
          {{ 'platform.sessions.dialog.value' | transloco }}
        </label>
        <div class="flex flex-wrap items-center gap-2">
          <input
            pInputText
            id="lifetime-value"
            inputmode="numeric"
            class="w-32 tabular-nums"
            [ngModel]="raw()"
            (ngModelChange)="raw.set($event)"
            [ngModelOptions]="{ standalone: true }"
            aria-required="true"
            [invalid]="showError()"
            [attr.aria-invalid]="showError() ? 'true' : null"
            aria-describedby="lifetime-value-hint"
            data-testid="lifetime-value"
          />
          <p-selectbutton
            [options]="units"
            [allowEmpty]="false"
            [ngModel]="unit()"
            (ngModelChange)="setUnit($event)"
            [ngModelOptions]="{ standalone: true }"
            [ariaLabel]="'platform.sessions.dialog.unit' | transloco"
            data-testid="lifetime-unit"
          >
            <ng-template #item let-option>
              {{ 'platform.sessions.dialog.units.' + option | transloco }}
            </ng-template>
          </p-selectbutton>
        </div>
        <span id="lifetime-value-hint" class="text-xs" data-testid="lifetime-hint">
          @switch (problem()) {
            @case ('required') {
              @if (attempted()) {
                <span class="text-red-600 dark:text-red-400" data-testid="lifetime-error">
                  {{ 'reasonDialog.fieldRequired' | transloco }}
                </span>
              } @else {
                <span class="text-muted-color">{{ boundsText }}</span>
              }
            }
            @case ('wholeNumber') {
              <span class="text-red-600 dark:text-red-400" data-testid="lifetime-error">
                {{ 'platform.sessions.dialog.wholeNumber' | transloco }}
              </span>
            }
            @case ('outOfBounds') {
              <span class="text-red-600 dark:text-red-400" data-testid="lifetime-error">
                {{ boundsText }}
              </span>
            }
            @case ('unchanged') {
              <span class="text-muted-color" data-testid="lifetime-unchanged">
                {{ 'platform.sessions.dialog.unchanged' | transloco }}
              </span>
            }
            @default {
              <span class="text-muted-color" data-testid="lifetime-preview">
                = {{ hours()! | duration }}
              </span>
            }
          }
        </span>
      </div>

      <p class="text-muted-color text-xs" data-testid="lifetime-applies">
        {{ 'platform.sessions.appliesNote' | transloco }}
      </p>
    </app-reason-dialog>
  `,
})
export class LifetimeDialog {
  readonly visible = model(false);
  readonly target = input<LifetimeTarget | null>(null);
  /** The bounds from the read; auth enforces the same. */
  readonly bounds = input<{ minHours: number; maxHours: number }>({ minHours: 1, maxHours: 2160 });
  readonly done = output<TokenLifetimes>();

  private readonly api = inject(TokenLifetimesApi);

  protected readonly units = [...UNITS];
  protected readonly raw = signal('');
  protected readonly unit = signal<LifetimeUnit>('hours');
  protected readonly attempted = signal(false);

  private readonly parsed = computed(() => parseLifetime(this.raw(), this.unit(), this.bounds()));
  protected readonly hours = computed(() => {
    const p = this.parsed();
    return 'hours' in p ? p.hours : null;
  });

  /** Why the value cannot be saved, or null. */
  protected readonly problem = computed(() => {
    const p = this.parsed();
    if ('error' in p) return p.error;
    const t = this.target();
    // A fallback cell saved with the fallback value still creates the row — that is a change.
    if (t && !t.isFallback && p.hours === t.hours) return 'unchanged';
    return null;
  });

  protected readonly ready = computed(() => this.problem() === null);
  protected readonly showError = computed(() => {
    const problem = this.problem();
    if (problem === 'wholeNumber' || problem === 'outOfBounds') return true;
    return problem === 'required' && this.attempted();
  });

  constructor() {
    // Each opening starts from the value in force, in its natural unit.
    effect(() => {
      if (!this.visible()) return;
      untracked(() => {
        const t = this.target();
        const hours = t?.hours ?? 0;
        const unit = naturalUnit(hours);
        this.unit.set(unit);
        this.raw.set(t ? String(unit === 'days' ? hours / 24 : hours) : '');
      });
    });
  }

  /** Switching the unit keeps the duration when it fits the new unit, else keeps the number. */
  protected setUnit(unit: LifetimeUnit): void {
    const hours = this.hours();
    if (hours !== null) {
      if (unit === 'hours') this.raw.set(String(hours));
      else if (hours % 24 === 0) this.raw.set(String(hours / 24));
    }
    this.unit.set(unit);
  }

  protected readonly save = (reason: string) => {
    const t = this.target()!;
    return this.api.update(
      [{ role: t.role, clientType: t.clientType, refreshLifetimeHours: this.hours()! }],
      reason,
    );
  };
}
