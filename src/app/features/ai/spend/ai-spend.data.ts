import { Injectable, computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { AiApi } from '../../../api/ai/ai-api';
import { adminSpendGet } from '../../../api/ai/functions';
import { PlatformSpendResponseDto } from '../../../api/ai/models/platform-spend-response-dto';
import { ColumnState } from '../../schools/schools-list.data';
import { stateOf } from '../../schools/card/plan/school-plan.data';
import { modelSpendRows, spendChart, spendTotals } from './spend-model';
import { SpendRange, parseSpendRange, presetOf } from './spend-period';

/**
 * Data of "AI → Spend": one read of `GET admin/ai/spend` for the period in the URL. The page
 * shows what the ledger (`ai_calls`) says; nothing is summed here that the server did not send.
 */
@Injectable()
export class AiSpendData {
  private readonly ai = inject(AiApi);

  readonly range = toSignal<SpendRange>(
    inject(ActivatedRoute).queryParamMap.pipe(
      map((p) => parseSpendRange(p.get('from'), p.get('to'))),
    ),
    { requireSync: true },
  );

  /** The preset this range is today, or null for a range picked by hand. */
  readonly preset = computed(() => presetOf(this.range()));

  private readonly spendResource = rxResource({
    params: () => this.range(),
    stream: ({ params: { from, to } }) => this.ai.invoke(adminSpendGet, { from, to }),
  });

  readonly spend = computed<ColumnState<PlatformSpendResponseDto>>(() =>
    stateOf(this.spendResource),
  );

  private readonly ready = computed(() => {
    const s = this.spend();
    return s.kind === 'ready' ? s.value : null;
  });

  readonly totals = computed(() => {
    const s = this.ready();
    return s ? spendTotals(s) : null;
  });
  readonly rows = computed(() => {
    const s = this.ready();
    return s ? modelSpendRows(s) : [];
  });
  readonly chart = computed(() => {
    const s = this.ready();
    return s ? spendChart(s) : null;
  });

  reload(): void {
    this.spendResource.reload();
  }
}
