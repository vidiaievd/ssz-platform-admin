import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { adminAuditList } from '../../../../api/analytics/functions';
import { AdminAuditEntryDto } from '../../../../api/analytics/models/admin-audit-entry-dto';
import { AnalyticsApi } from '../../../../api/analytics/analytics-api';
import { PayerCard } from '../payer-card';

/** Entries per request; analytics allows 1–200. */
export const JOURNAL_PAGE_SIZE = 50;

export type JournalState = 'loading' | 'ready' | 'error';
export type MoreState = 'idle' | 'loading' | 'error';

/**
 * Data of the "Journal" tab: admin actions on this school (or, on the user card, this account —
 * `targetType=user` gathers auth's account actions and the learner's plan and AI changes) from analytics (`admin/audit` filtered
 * by target), newest first. The pages are keyset-paged by a cursor, so "more" appends the next
 * page to what is on screen; a failed "more" keeps the entries already read.
 */
@Injectable()
export class SchoolJournalData {
  private readonly analytics = inject(AnalyticsApi);
  readonly card = inject(PayerCard);

  readonly items = signal<AdminAuditEntryDto[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly state = signal<JournalState>('loading');
  readonly moreState = signal<MoreState>('idle');

  private request: Subscription | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
    effect(() => {
      const targetId = this.card.payerId();
      if (targetId) untracked(() => this.reload());
    });
  }

  /** Reads the first page again; also the retry of a failed first read. */
  reload(): void {
    const targetId = this.card.payerId();
    if (!targetId) return;
    this.request?.unsubscribe();
    this.items.set([]);
    this.nextCursor.set(null);
    this.moreState.set('idle');
    this.state.set('loading');
    this.request = this.page(targetId).subscribe({
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
    const targetId = this.card.payerId();
    const cursor = this.nextCursor();
    if (!targetId || !cursor || this.moreState() === 'loading') return;
    this.moreState.set('loading');
    this.request = this.page(targetId, cursor).subscribe({
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
      // A payer's type is its journal target type: subscription, ai-service and auth all write it.
      targetType: this.card.payerType,
      targetId,
      limit: JOURNAL_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
  }
}
