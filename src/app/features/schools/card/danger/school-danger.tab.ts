import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Tag } from 'primeng/tag';
import { Observable } from 'rxjs';
import {
  adminSchoolLifecycleClose,
  adminSchoolLifecyclePurge,
  adminSchoolLifecycleReactivate,
  adminSchoolLifecycleRestore,
  adminSchoolLifecycleSuspend,
} from '../../../../api/organization/functions';
import { OrganizationApi } from '../../../../api/organization/organization-api';
import { SchoolLifecycleDto } from '../../../../api/organization/models/school-lifecycle-dto';
import { IfLevelDirective } from '../../../../core/auth/if-level.directive';
import { SessionStore } from '../../../../core/auth/session.store';
import { LanguageService } from '../../../../core/i18n/language.service';
import { LocalDatePipe } from '../../../../shared/local-date.pipe';
import { ReasonDialog } from '../../../../shared/reason-dialog/reason-dialog';
import { STATUS_SEVERITY, daysUntil } from '../../school-lifecycle';
import { SchoolCardData } from '../school-card.data';
import { LifecycleTransition, TransitionRule, transitionsFrom } from './lifecycle-transitions';

/**
 * "Danger zone" tab of the school card (plan 90, phase 5, step 13): where the school is in its
 * life (`active → suspended → closed → purged`), the dates the timer works to, and the moves the
 * viewer's level allows. Every move asks for a reason; closing at once and an early purge also ask
 * for the school's name typed in. After a move the card is read again, so the header follows.
 */
@Component({
  selector: 'app-school-danger-tab',
  imports: [
    FormsModule,
    TranslocoPipe,
    ButtonDirective,
    InputText,
    Tag,
    LocalDatePipe,
    IfLevelDirective,
    ReasonDialog,
  ],
  template: `
    @if (school(); as school) {
      <section class="flex flex-col gap-4" data-testid="danger">
        <div
          class="border-border flex flex-col gap-2 rounded-md border p-4"
          data-testid="danger-status"
        >
          <h2 class="text-base font-semibold">{{ 'schools.danger.title' | transloco }}</h2>
          <div class="flex flex-wrap items-center gap-2">
            <p-tag
              [severity]="statusSeverity[school.status]"
              [value]="'schools.status.' + school.status | transloco"
              data-testid="danger-status-tag"
            />
            @if (school.statusChangedAt) {
              <span class="text-muted-color text-sm" data-testid="danger-changed-at">
                {{
                  'schools.danger.since'
                    | transloco: { date: (school.statusChangedAt | localDate: lang()) }
                }}
              </span>
            }
          </div>
          <p class="text-muted-color text-sm">
            {{ 'schools.danger.stage.' + school.status | transloco }}
          </p>
          @if (school.statusReason) {
            <p class="text-sm" data-testid="danger-reason">
              {{ 'schools.danger.lastReason' | transloco }}: {{ school.statusReason }}
            </p>
          }
          @if (school.status === 'suspended' && school.closesAt) {
            <p class="text-sm tabular-nums" data-testid="danger-closes-at">
              {{
                'schools.card.closesAt'
                  | transloco
                    : { date: (school.closesAt | localDate: lang()), n: days(school.closesAt) }
              }}
            </p>
          }
          @if (school.status === 'closed' && school.purgeAt) {
            <p class="text-sm tabular-nums" data-testid="danger-purge-at">
              {{
                'schools.card.purgeAt'
                  | transloco
                    : { date: (school.purgeAt | localDate: lang()), n: days(school.purgeAt) }
              }}
            </p>
          }
        </div>

        @if (rules().length === 0) {
          <p class="text-muted-color text-sm" data-testid="danger-none">
            {{ 'schools.danger.none' | transloco }}
          </p>
        } @else {
          <ul class="flex flex-col gap-3" data-testid="danger-actions">
            @for (rule of rules(); track rule.transition) {
              <li
                class="border-border flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border p-4"
                [attr.data-testid]="'danger-' + rule.transition"
              >
                <div class="flex min-w-0 flex-1 flex-col gap-1">
                  <span class="font-medium">
                    {{ 'schools.danger.transitions.' + rule.transition + '.title' | transloco }}
                  </span>
                  <span class="text-muted-color text-sm">
                    {{ 'schools.danger.transitions.' + rule.transition + '.text' | transloco }}
                  </span>
                </div>
                <ng-container *appIfLevel="rule.level">
                  <button
                    type="button"
                    pButton
                    size="small"
                    [severity]="rule.confirmName ? 'danger' : 'secondary'"
                    [attr.data-testid]="'danger-open-' + rule.transition"
                    (click)="open(rule)"
                  >
                    {{ 'schools.danger.transitions.' + rule.transition + '.button' | transloco }}
                  </button>
                </ng-container>
                @if (!can(rule)) {
                  <span class="text-muted-color text-xs" data-testid="danger-level-note">
                    {{ 'schools.danger.needsLevel.' + rule.level | transloco }}
                  </span>
                }
              </li>
            }
          </ul>
        }

        @if (pending(); as rule) {
          <app-reason-dialog
            [visible]="true"
            (visibleChange)="$event || pending.set(null)"
            [header]="'schools.danger.transitions.' + rule.transition + '.title' | transloco"
            [confirmLabel]="'schools.danger.transitions.' + rule.transition + '.button' | transloco"
            [level]="rule.level"
            [danger]="rule.confirmName"
            [ready]="!rule.confirmName || nameMatches()"
            [action]="run"
            (done)="data.reload()"
          >
            <p class="text-sm">
              {{ 'schools.danger.transitions.' + rule.transition + '.text' | transloco }}
            </p>
            @if (rule.confirmName) {
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium" for="danger-confirm-name">
                  {{ 'schools.danger.confirmName' | transloco: { name: school.name } }}
                </label>
                <input
                  pInputText
                  id="danger-confirm-name"
                  autocomplete="off"
                  class="w-full"
                  [ngModel]="typed()"
                  (ngModelChange)="typed.set($event)"
                  [ngModelOptions]="{ standalone: true }"
                  data-testid="danger-confirm-name"
                />
              </div>
            }
          </app-reason-dialog>
        }
      </section>
    }
  `,
})
export class SchoolDangerTab {
  protected readonly data = inject(SchoolCardData);
  private readonly organization = inject(OrganizationApi);
  private readonly session = inject(SessionStore);
  protected readonly lang = inject(LanguageService).current;

  protected readonly statusSeverity = STATUS_SEVERITY;
  protected readonly school = this.data.school;
  protected readonly days = (iso: string) => daysUntil(iso);

  /** The moves the school's status allows, lowest level first; the viewer's level only hides buttons. */
  protected readonly rules = computed(() => {
    const school = this.school();
    return school ? transitionsFrom(school.status) : [];
  });

  protected readonly pending = signal<TransitionRule | null>(null);
  protected readonly typed = signal('');
  protected readonly nameMatches = computed(
    () => this.typed().trim() === this.school()?.name.trim(),
  );

  protected can(rule: TransitionRule): boolean {
    return this.session.hasLevel(rule.level);
  }

  protected open(rule: TransitionRule): void {
    this.typed.set('');
    this.pending.set(rule);
  }

  protected readonly run = (reason: string): Observable<SchoolLifecycleDto> => {
    const schoolId = this.school()!.id;
    const body = { reason };
    const call: Record<LifecycleTransition, () => Observable<SchoolLifecycleDto>> = {
      suspend: () => this.organization.invoke(adminSchoolLifecycleSuspend, { schoolId, body }),
      reactivate: () =>
        this.organization.invoke(adminSchoolLifecycleReactivate, { schoolId, body }),
      close: () => this.organization.invoke(adminSchoolLifecycleClose, { schoolId, body }),
      restore: () => this.organization.invoke(adminSchoolLifecycleRestore, { schoolId, body }),
      purge: () => this.organization.invoke(adminSchoolLifecyclePurge, { schoolId, body }),
    };
    return call[this.pending()!.transition]();
  };
}
