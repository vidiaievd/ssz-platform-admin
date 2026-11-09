import {
  Component,
  DOCUMENT,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslocoPipe, translateObjectSignal } from '@jsverse/transloco';
import { ButtonDirective } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Tag } from 'primeng/tag';
import { adminSchoolsList } from '../../api/organization/functions';
import { OrganizationApi } from '../../api/organization/organization-api';
import { SessionStore } from '../../core/auth/session.store';
import { NAV_SECTIONS, NavSection } from '../nav-sections';
import {
  PaletteOption,
  SCHOOL_SEARCH_LIMIT,
  SCHOOL_SEARCH_MIN,
  SEARCH_TERM_MAX,
  SchoolSearchState,
  isPaletteHotkey,
  keepActive,
  matchSections,
  moveActive,
  normalizeTerm,
  paletteOptions,
} from './palette-options';
import { PALETTE_SEARCH_DELAY_MS, searchSchools } from './school-search';

const LISTBOX_ID = 'palette-listbox';

/**
 * Ctrl+K (⌘K) — jump to a section of the panel or to a school (plan 90, phase 2, step 7).
 * Sections are matched locally in the panel's language; schools come from
 * `admin/schools?search=&limit=8` after a short pause, and every new key cancels the pause
 * and the request before it. Arrows move, Enter opens, Esc closes. Users join in phase 6.
 */
@Component({
  selector: 'app-command-palette',
  imports: [
    NgTemplateOutlet,
    TranslocoPipe,
    ButtonDirective,
    Dialog,
    IconField,
    InputIcon,
    InputText,
    Tag,
  ],
  host: { '(document:keydown)': 'onDocumentKeydown($event)' },
  template: `
    <button
      pButton
      type="button"
      severity="secondary"
      [text]="true"
      class="md:!border-border hidden md:!inline-flex md:w-64 md:!justify-start md:!border"
      [attr.aria-label]="'palette.open' | transloco"
      aria-haspopup="dialog"
      [attr.aria-keyshortcuts]="isMac ? 'Meta+K' : 'Control+K'"
      data-testid="palette-trigger"
      (click)="show()"
    >
      <i class="pi pi-search" aria-hidden="true"></i>
      <span class="text-muted-color flex-1 text-left text-sm">{{
        'palette.open' | transloco
      }}</span>
      <kbd
        class="border-border text-muted-color rounded border px-1.5 text-xs"
        aria-hidden="true"
        >{{ hotkeyLabel }}</kbd
      >
    </button>
    <button
      pButton
      type="button"
      class="md:hidden"
      severity="secondary"
      [text]="true"
      [rounded]="true"
      [iconOnly]="true"
      [attr.aria-label]="'palette.open' | transloco"
      aria-haspopup="dialog"
      data-testid="palette-trigger-compact"
      (click)="show()"
    >
      <i class="pi pi-search" aria-hidden="true"></i>
    </button>

    <p-dialog
      [(visible)]="open"
      [header]="'palette.title' | transloco"
      [modal]="true"
      [dismissableMask]="true"
      [draggable]="false"
      [resizable]="false"
      [focusOnShow]="false"
      position="top"
      [style]="{ width: '40rem' }"
      [breakpoints]="{ '640px': 'calc(100vw - 2rem)' }"
      [closeAriaLabel]="'palette.close' | transloco"
    >
      <div class="flex flex-col gap-3" data-testid="palette">
        <p-iconfield>
          <p-inputicon class="pi pi-search" />
          <input
            #input
            pInputText
            type="text"
            class="w-full"
            role="combobox"
            aria-autocomplete="list"
            [attr.aria-expanded]="options().length > 0"
            [attr.aria-controls]="listboxId"
            [attr.aria-activedescendant]="activeId()"
            [attr.aria-label]="'palette.placeholder' | transloco"
            [placeholder]="'palette.placeholder' | transloco"
            [value]="query()"
            [attr.maxlength]="searchMax"
            autocomplete="off"
            spellcheck="false"
            data-testid="palette-input"
            (input)="query.set(input.value)"
            (keydown)="onInputKeydown($event)"
          />
        </p-iconfield>

        <div [id]="listboxId" role="listbox" class="-mx-2 max-h-[60vh] overflow-y-auto">
          @if (sectionOptions().length > 0) {
            <div role="group" [attr.aria-labelledby]="listboxId + '-sections'">
              <div
                [id]="listboxId + '-sections'"
                class="text-muted-color px-2 pt-1 pb-1 text-xs font-medium uppercase"
              >
                {{ 'palette.sections' | transloco }}
              </div>
              @for (option of sectionOptions(); track option.id; let i = $index) {
                <ng-container
                  *ngTemplateOutlet="row; context: { $implicit: option, index: i }"
                ></ng-container>
              }
            </div>
          }

          @if (canSearchSchools()) {
            <div role="group" [attr.aria-labelledby]="listboxId + '-schools'">
              <div
                [id]="listboxId + '-schools'"
                class="text-muted-color px-2 pt-3 pb-1 text-xs font-medium uppercase"
              >
                {{ 'palette.schools' | transloco }}
              </div>
              @for (option of schoolOptions(); track option.id; let i = $index) {
                <ng-container
                  *ngTemplateOutlet="
                    row;
                    context: { $implicit: option, index: sectionOptions().length + i }
                  "
                ></ng-container>
              }
            </div>
          }
        </div>

        @if (canSearchSchools()) {
          <div class="text-muted-color flex min-h-6 items-center gap-2 text-sm" aria-live="polite">
            @switch (schools().kind) {
              @case ('idle') {
                <span data-testid="palette-hint">{{
                  (term().length === 0 ? 'palette.hint' : 'palette.minChars')
                    | transloco: { min: minChars }
                }}</span>
              }
              @case ('loading') {
                <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
                <span data-testid="palette-searching">{{ 'palette.searching' | transloco }}</span>
              }
              @case ('ready') {
                @if (schoolOptions().length === 0) {
                  <span data-testid="palette-no-schools">{{
                    'palette.noSchools' | transloco
                  }}</span>
                }
              }
              @case ('error') {
                <span data-testid="palette-error">{{ errorKey() | transloco }}</span>
                <button
                  pButton
                  type="button"
                  size="small"
                  severity="secondary"
                  [text]="true"
                  data-testid="palette-retry"
                  (click)="retry()"
                >
                  {{ 'palette.retry' | transloco }}
                </button>
              }
            }
          </div>
        }

        <div class="text-muted-color hidden gap-4 text-xs sm:flex" aria-hidden="true">
          <span><kbd>↑</kbd> <kbd>↓</kbd> {{ 'palette.keys.move' | transloco }}</span>
          <span><kbd>Enter</kbd> {{ 'palette.keys.open' | transloco }}</span>
          <span><kbd>Esc</kbd> {{ 'palette.keys.close' | transloco }}</span>
        </div>
      </div>
    </p-dialog>

    <ng-template #row let-option let-index="index">
      <!-- Combobox pattern: focus stays in the field, which drives the options by keyboard
           (aria-activedescendant); an option is never focusable itself. -->
      <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
      <div
        role="option"
        [id]="option.id"
        [attr.aria-selected]="index === activeIndex()"
        class="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm"
        [class.bg-emphasis]="index === activeIndex()"
        [attr.data-testid]="'palette-option'"
        [attr.data-option]="option.id"
        (mousemove)="activate(index)"
        (mousedown)="$event.preventDefault()"
        (click)="choose(option)"
      >
        @switch (option.kind) {
          @case ('section') {
            <i [class]="option.section.icon" aria-hidden="true"></i>
            <span class="flex-1">{{ sectionLabel(option.section) }}</span>
          }
          @case ('school') {
            <i class="pi pi-building text-muted-color" aria-hidden="true"></i>
            <span class="min-w-0 flex-1 truncate">
              {{ option.school.name }}
              <span class="text-muted-color">· {{ option.school.slug }}</span>
            </span>
            <span class="text-muted-color text-xs">{{
              'schools.kind.' + option.school.kind | transloco
            }}</span>
            @if (option.school.status !== 'active') {
              <p-tag
                [value]="'schools.status.' + option.school.status | transloco"
                [severity]="option.school.status === 'deleted' ? 'danger' : 'warn'"
              />
            }
          }
          @case ('allSchools') {
            <i class="pi pi-list text-muted-color" aria-hidden="true"></i>
            <span class="flex-1">{{
              'palette.allResults' | transloco: { total: option.total }
            }}</span>
          }
        }
      </div>
    </ng-template>
  `,
})
export class CommandPalette {
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);
  private readonly organization = inject(OrganizationApi);
  private readonly navLabels = translateObjectSignal('nav');
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');
  private readonly document = inject(DOCUMENT);

  protected readonly listboxId = LISTBOX_ID;
  protected readonly minChars = SCHOOL_SEARCH_MIN;
  protected readonly searchMax = SEARCH_TERM_MAX;
  protected readonly isMac = /Mac|iPhone|iPad/.test(
    this.document.defaultView?.navigator.userAgent ?? '',
  );
  protected readonly hotkeyLabel = this.isMac ? '⌘K' : 'Ctrl K';

  readonly open = signal(false);
  protected readonly query = signal('');
  /** Closing the palette empties the term, which also drops a search still in flight. */
  protected readonly term = computed(() => (this.open() ? normalizeTerm(this.query()) : ''));
  private readonly attempt = signal(0);

  private readonly sections = computed(() =>
    NAV_SECTIONS.filter((s) => !s.minLevel || this.session.hasLevel(s.minLevel)),
  );

  /** Schools are searched only by someone who may open the schools section. */
  protected readonly canSearchSchools = computed(() =>
    this.sections().some((s) => s.id === 'schools'),
  );

  protected readonly schools = toSignal(
    searchSchools(
      toObservable(
        computed(() => ({
          term: this.canSearchSchools() ? this.term() : '',
          attempt: this.attempt(),
        })),
      ),
      (term) =>
        this.organization.invoke(adminSchoolsList, { search: term, limit: SCHOOL_SEARCH_LIMIT }),
      inject(PALETTE_SEARCH_DELAY_MS),
    ),
    { initialValue: { kind: 'idle' } as SchoolSearchState },
  );

  protected readonly options = computed(() =>
    paletteOptions(
      matchSections(this.sections(), (s) => this.sectionLabel(s), this.term()),
      this.schools(),
    ),
  );
  protected readonly sectionOptions = computed(() =>
    this.options().filter((o) => o.kind === 'section'),
  );
  protected readonly schoolOptions = computed(() =>
    this.options().filter((o) => o.kind !== 'section'),
  );

  /** The active option by id, so it survives the list changing around it. */
  protected readonly activeId = linkedSignal<PaletteOption[], string | null>({
    source: this.options,
    computation: (options, previous) => {
      const index = keepActive(options, previous?.value ?? null);
      return index < 0 ? null : options[index].id;
    },
  });
  protected readonly activeIndex = computed(() =>
    this.options().findIndex((o) => o.id === this.activeId()),
  );

  protected readonly errorKey = computed(() => {
    const state = this.schools();
    return state.kind === 'error' && state.error.isNetworkError
      ? 'schools.errors.network'
      : 'palette.failed';
  });

  constructor() {
    // Keep the active option in view while the arrows walk a long list.
    afterRenderEffect(() => {
      const id = this.activeId();
      if (!this.open() || !id) return;
      this.document.getElementById(id)?.scrollIntoView?.({ block: 'nearest' });
    });
  }

  /** Each opening starts empty. */
  show(): void {
    this.query.set('');
    // The DOM too, right now: a key typed before the next render would otherwise be added to
    // the previous term still sitting in the field.
    const field = this.input()?.nativeElement;
    if (field) field.value = '';
    this.open.set(true);
    this.focusInputWhenAttached();
  }

  protected sectionLabel(section: NavSection): string {
    const label = this.navLabels()[section.id];
    return typeof label === 'string' ? label : section.id;
  }

  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (!isPaletteHotkey(event)) return;
    // The browser's own Ctrl+K (address bar search) must not fire as well.
    event.preventDefault();
    if (this.open()) this.open.set(false);
    else this.show();
  }

  protected onInputKeydown(event: KeyboardEvent): void {
    const count = this.options().length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        this.activate(moveActive(this.activeIndex(), count, event.key === 'ArrowDown' ? 1 : -1));
        break;
      case 'Enter': {
        event.preventDefault();
        const option = this.options()[this.activeIndex()];
        if (option) this.choose(option);
        break;
      }
    }
  }

  protected activate(index: number): void {
    this.activeId.set(this.options()[index]?.id ?? null);
  }

  protected choose(option: PaletteOption): void {
    this.open.set(false);
    switch (option.kind) {
      case 'section':
        void this.router.navigateByUrl('/' + option.section.path);
        break;
      case 'school':
        void this.router.navigate(['/schools', option.school.id]);
        break;
      case 'allSchools':
        void this.router.navigate(['/schools'], { queryParams: { q: option.term } });
        break;
    }
  }

  protected retry(): void {
    this.attempt.update((n) => n + 1);
    this.focusInput();
  }

  protected focusInput(): void {
    this.input()?.nativeElement.focus();
  }

  /**
   * The dialog creates its content at once but attaches it to the page a few frames later,
   * and `onShow` waits for the end of the animation — too late for someone who presses
   * Ctrl+K and types straight away. So: try every frame until the field takes the focus.
   */
  private focusInputWhenAttached(framesLeft = 30): void {
    if (!this.open()) return;
    const field = this.input()?.nativeElement;
    if (field?.isConnected) {
      field.focus();
      if (this.document.activeElement === field) return;
    }
    if (framesLeft > 0) {
      requestAnimationFrame(() => this.focusInputWhenAttached(framesLeft - 1));
    }
  }
}
