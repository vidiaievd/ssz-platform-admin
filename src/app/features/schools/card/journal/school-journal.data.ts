import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { adminAuditList } from '../../../../api/analytics/functions';
import { AdminAuditEntryDto } from '../../../../api/analytics/models/admin-audit-entry-dto';
import { AnalyticsApi } from '../../../../api/analytics/analytics-api';
import { PAYER_TYPE } from '../plan/school-plan.data';
import { SchoolCardData } from '../school-card.data';

/** Entries per request; analytics allows 1–200. */
export const JOURNAL_PAGE_SIZE = 50;

export type JournalState = 'loading' | 'ready' | 'error';
export type MoreState = 'idle' | 'loading' | 'error';

/**
 * Data of the "Journal" tab: admin actions on this school from analytics (`admin/audit` filtered
 * by target), newest first. The pages are keyset-paged by a cursor, so "more" appends the next
 * page to what is on screen; a failed "more" keeps the entries already read.
 */
@Injectable()
export class SchoolJournalData {
  private readonly analytics = inject(AnalyticsApi);
  readonly card = inject(SchoolCardData);

  readonly items = signal<AdminAuditEntryDto[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly state = signal<JournalState>('loading');
  readonly moreState = signal<MoreState>('idle');

  private request: Subscription | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
    effect(() => {
      const schoolId = this.card.schoolId();
      if (schoolId) untracked(() => this.reload());
    });
  }

  /** Reads the first page again; also the retry of a failed first read. */
  reload(): void {
    const schoolId = this.card.schoolId();
    if (!schoolId) return;
    this.request?.unsubscribe();
    this.items.set([]);
    this.nextCursor.set(null);
    this.moreState.set('idle');
    this.state.set('loading');
    this.request = this.page(schoolId).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.nextCursor.set(page.nextCursor);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  /** Appends the next page; does nothing without a cursor or while a read is under way. */
  more(): void {
    const schoolId = this.card.schoolId();
    const cursor = this.nextCursor();
    if (!schoolId || !cursor || this.moreState() === 'loading') return;
    this.moreState.set('loading');
    this.request = this.page(schoolId, cursor).subscribe({
      next: (page) => {
        this.items.update((items) => [...items, ...page.items]);
        this.nextCursor.set(page.nextCursor);
        this.moreState.set('idle');
      },
      error: () => this.moreState.set('error'),
    });
  }

  private page(targetId: string, cursor?: string) {
    return this.analytics.invoke(adminAuditList, {
      targetType: PAYER_TYPE,
      targetId,
      limit: JOURNAL_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
  }
}
