import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { catchError, throwError } from 'rxjs';
import { adminPlansGet, adminPlansRevise } from '../../api/subscription/functions';
import { PlanResponseDto } from '../../api/subscription/models/plan-response-dto';
import { SubscriptionApi } from '../../api/subscription/subscription-api';
import { ApiError } from '../../core/auth/api-error';
import { ReasonDialog } from '../../shared/reason-dialog/reason-dialog';
import { stateOf } from '../schools/card/plan/school-plan.data';
import { PlanChanges } from './plan-changes';
import { EditorRow, editorFeatures, editorRows, editorValid } from './plan-editor-model';
import { PlanFeaturesEditor } from './plan-features-editor';
import { diffFeatures } from './plan-model';

/**
 * `/plans/:code/new-version` — a new version of a plan (plan 90, phase 8, step 14), `super`
 * only. The editor starts from the current version's keys; the version sent is the complete
 * list, with `expectedVersion` = the version the edit started from. Someone else's version in
 * between is a 409: "reread" moves the base to the plan's new current version and keeps what
 * was typed, the changes are then counted against it. Subscribers stay on their versions — new
 * assignments get the new one.
 */
@Component({
  selector: 'app-plan-version-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    ButtonDirective,
    Skeleton,
    ReasonDialog,
    PlanChanges,
    PlanFeaturesEditor,
  ],
  template: `
    <section class="flex flex-col gap-4" data-testid="plan-version-page">
      <a
        class="text-primary flex w-fit items-center gap-1 text-sm"
        [routerLink]="['/plans', code()]"
      >
        <i class="pi pi-arrow-left" aria-hidden="true"></i>
        {{ 'plans.editor.backToPlan' | transloco }}
      </a>

      @switch (plan().kind) {
        @case ('loading') {
          <p-skeleton height="2rem" width="16rem" />
          <p-skeleton height="16rem" />
        }
        @case ('error') {
          @if (notFound()) {
            <h1 class="text-2xl font-semibold" data-testid="plan-not-found">
              {{ 'plans.card.notFound' | transloco }}
            </h1>
          } @else {
            <p class="text-sm" role="alert" data-testid="plan-failed">
              {{ 'plans.card.failed' | transloco }} ·
              <button type="button" class="text-primary underline" (click)="reread()">
                {{ 'schools.retry' | transloco }}
              </button>
            </p>
          }
        }
        @default {
          @if (details(); as p) {
            <header class="flex flex-col gap-1">
              <h1 class="text-2xl font-semibold" data-testid="page-title">
                {{
                  'plans.editor.versionTitle' | transloco: { plan: p.name, version: base()! + 1 }
                }}
              </h1>
              <p class="text-muted-color text-sm" data-testid="version-base">
                {{ 'plans.editor.versionBase' | transloco: { version: base() } }}
              </p>
            </header>

            @if (p.status === 'archived') {
              <p class="text-sm" role="alert" data-testid="plan-archived-note">
                {{ 'plans.card.archivedNote' | transloco }}
              </p>
            } @else if (rows(); as current) {
              @if (conflict()) {
                <div
                  role="alert"
                  class="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 px-3 py-2 text-sm dark:border-amber-800"
                  data-testid="version-conflict"
                >
                  <i class="pi pi-exclamation-triangle text-amber-500" aria-hidden="true"></i>
                  {{ 'plans.editor.conflict' | transloco }}
                  <button
                    type="button"
                    pButton
                    size="small"
                    severity="secondary"
                    data-testid="version-reread"
                    (click)="reread()"
                  >
                    {{ 'plans.editor.reread' | transloco }}
                  </button>
                </div>
              }

              <app-plan-features-editor
                [rows]="current"
                (rowsChange)="rows.set($event)"
                [attempted]="attempted()"
              />

              <div class="flex flex-col gap-2" data-testid="version-preview">
                <h2 class="text-muted-color text-xs uppercase">
                  {{ 'plans.card.changesFrom' | transloco: { version: base() } }}
                </h2>
                @if (!valid()) {
                  <p class="text-muted-color text-sm" data-testid="version-preview-invalid">
                    {{ 'plans.editor.fixFirst' | transloco }}
                  </p>
                } @else if (changes().length === 0) {
                  <p class="text-muted-color text-sm" data-testid="version-no-changes">
                    {{ 'plans.editor.noChanges' | transloco }}
                  </p>
                } @else {
                  <app-plan-changes [changes]="changes()" />
                }
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  pButton
                  data-testid="version-save"
                  [disabled]="valid() && changes().length === 0"
                  (click)="save()"
                >
                  {{ 'plans.editor.saveVersion' | transloco: { version: base()! + 1 } }}
                </button>
                <a pButton severity="secondary" [text]="true" [routerLink]="['/plans', code()]">
                  {{ 'reasonDialog.cancel' | transloco }}
                </a>
              </div>

              <app-reason-dialog
                [(visible)]="confirmOpen"
                [header]="'plans.editor.confirmVersion' | transloco: { version: base()! + 1 }"
                [confirmLabel]="'plans.editor.saveVersion' | transloco: { version: base()! + 1 }"
                level="super"
                [action]="revise"
                [errorText]="{ conflict: 'plans.editor.conflict' | transloco }"
                (done)="saved($event)"
              >
                <app-plan-changes [changes]="changes()" />
                <p class="text-muted-color text-xs" data-testid="version-reach">
                  {{ 'plans.editor.reach' | transloco }}
                </p>
              </app-reason-dialog>
            }
          }
        }
      }
    </section>
  `,
})
export class PlanVersionPage {
  /** From the route (`:code`). */
  readonly code = input.required<string>();

  private readonly api = inject(SubscriptionApi);
  private readonly router = inject(Router);

  private readonly planResource = rxResource({
    params: () => this.code(),
    stream: ({ params: code }) => this.api.invoke(adminPlansGet, { code }),
  });

  protected readonly plan = computed(() => stateOf(this.planResource));
  protected readonly notFound = computed(() => {
    const error = this.planResource.error();
    return !!error && ApiError.from(error).status === 404;
  });
  protected readonly details = computed(() => {
    const plan = this.plan();
    return plan.kind === 'ready' ? plan.value : null;
  });

  /** The version the edit is based on: the plan's current one at the last read. */
  protected readonly base = computed(() => this.details()?.current.version ?? null);

  /** What is being written; set from the first read and kept across rereads. */
  protected readonly rows = signal<EditorRow[] | null>(null);
  protected readonly attempted = signal(false);
  protected readonly confirmOpen = signal(false);
  /** The server had a newer version than `base` at the last save. */
  protected readonly conflict = signal(false);

  protected readonly valid = computed(() => editorValid(this.rows() ?? []));
  protected readonly changes = computed(() => {
    const plan = this.details();
    const rows = this.rows();
    if (!plan || !rows || !this.valid()) return [];
    return diffFeatures(plan.current.features, editorFeatures(rows));
  });

  constructor() {
    effect(() => {
      const plan = this.details();
      if (!plan) return;
      untracked(() => {
        if (this.rows() === null) this.rows.set(editorRows(plan.audience, plan.current.features));
      });
    });
  }

  protected reread(): void {
    this.conflict.set(false);
    this.planResource.reload();
  }

  protected save(): void {
    this.attempted.set(true);
    if (!this.valid() || this.changes().length === 0) return;
    this.confirmOpen.set(true);
  }

  protected readonly revise = (reason: string) =>
    this.api
      .invoke(adminPlansRevise, {
        code: this.code(),
        body: {
          expectedVersion: this.base()!,
          features: editorFeatures(this.rows()!),
          reason,
        },
      })
      .pipe(
        catchError((error: unknown) => {
          if (ApiError.from(error).status === 409) this.conflict.set(true);
          return throwError(() => error);
        }),
      );

  protected saved(plan: PlanResponseDto): void {
    void this.router.navigate(['/plans', plan.code]);
  }
}
