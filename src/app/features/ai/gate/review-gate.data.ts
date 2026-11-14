import { Injectable, computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { forkJoin, map } from 'rxjs';
import { AiApi } from '../../../api/ai/ai-api';
import {
  adminBindingsList,
  adminRegistryListModels,
  adminRegistryListProviders,
} from '../../../api/ai/functions';
import { AnalyticsApi } from '../../../api/analytics/analytics-api';
import { adminReviewGate } from '../../../api/analytics/functions';
import { ReviewGateDto } from '../../../api/analytics/models/review-gate-dto';
import { ColumnState } from '../../schools/schools-list.data';
import { stateOf } from '../../schools/card/plan/school-plan.data';
import { Registry } from '../models/agent-binding-rows';
import { GateRange, gatePresetOf, parseGateRange } from './gate-period';
import {
  DirectBinding,
  directBinding,
  gateRows,
  gateSummary,
  visibleRows,
} from './review-gate-model';

/**
 * Data of "AI → Q2 gate": analytics' `GET admin/ai/review-gate` for the period in the URL, and
 * from ai-service the `review_direct` binding (which model the gate is about) and the registry
 * (model names). Three independent reads: without the binding or the registry the table still
 * shows, with no mark or with model ids.
 */
@Injectable()
export class ReviewGateData {
  private readonly ai = inject(AiApi);
  private readonly analytics = inject(AnalyticsApi);
  private readonly query = inject(ActivatedRoute).queryParamMap;

  readonly range = toSignal<GateRange>(
    this.query.pipe(map((p) => parseGateRange(p.get('from'), p.get('to')))),
    // By value: `?bound=` changes the query too, and must not read the gate again.
    { requireSync: true, equal: (a, b) => a.from === b.from && a.to === b.to },
  );
  /** `?bound=1` — only the rows of the model bound to `review_direct`. */
  readonly boundOnly = toSignal(this.query.pipe(map((p) => p.get('bound') === '1')), {
    requireSync: true,
  });

  readonly preset = computed(() => gatePresetOf(this.range()));

  private readonly gateResource = rxResource({
    params: () => this.range(),
    stream: ({ params: { from, to } }) =>
      this.analytics.invoke(adminReviewGate, { from: from ?? undefined, to: to ?? undefined }),
  });

  private readonly bindingsResource = rxResource({
    stream: () => this.ai.invoke(adminBindingsList),
  });

  private readonly registryResource = rxResource({
    stream: () =>
      forkJoin({
        models: this.ai.invoke(adminRegistryListModels),
        providers: this.ai.invoke(adminRegistryListProviders),
      }),
  });

  readonly gate = computed<ColumnState<ReviewGateDto>>(() => stateOf(this.gateResource));

  private readonly registry = computed<Registry | null>(() => {
    const r = stateOf(this.registryResource);
    return r.kind === 'ready' ? r.value : null;
  });

  readonly binding = computed<DirectBinding>(() => {
    const b = stateOf(this.bindingsResource);
    if (b.kind !== 'ready') return { kind: b.kind };
    return directBinding(b.value, this.registry());
  });

  readonly rows = computed(() => {
    const g = this.gate();
    return g.kind === 'ready' ? gateRows(g.value, this.binding(), this.registry()) : [];
  });

  readonly visible = computed(() => visibleRows(this.rows(), this.boundOnly()));

  readonly summary = computed(() => gateSummary(this.rows(), this.binding()));

  reload(): void {
    this.gateResource.reload();
    this.bindingsResource.reload();
  }

  reloadBinding(): void {
    this.bindingsResource.reload();
  }
}
