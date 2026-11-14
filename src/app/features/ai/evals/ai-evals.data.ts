import { DestroyRef, Injectable, InjectionToken, computed, effect, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Observable, map } from 'rxjs';
import { AiApi } from '../../../api/ai/ai-api';
import {
  adminAssistEvalsGet,
  adminAssistEvalsList,
  adminAssistEvalsRun,
  adminRegistryListModels,
  adminRegistryListProviders,
  adminReviewEvalsGet,
  adminReviewEvalsList,
  adminReviewEvalsRun,
  adminVoiceEvalsGet,
  adminVoiceEvalsList,
  adminVoiceEvalsRun,
} from '../../../api/ai/functions';
import { AssistEvalRunDto } from '../../../api/ai/models/assist-eval-run-dto';
import { EvalRunDto } from '../../../api/ai/models/eval-run-dto';
import { ModelResponseDto } from '../../../api/ai/models/model-response-dto';
import { ProviderResponseDto } from '../../../api/ai/models/provider-response-dto';
import { VoiceEvalRunDto } from '../../../api/ai/models/voice-eval-run-dto';
import { ColumnState } from '../../schools/schools-list.data';
import { stateOf } from '../../schools/card/plan/school-plan.data';
import {
  EVAL_RUNS_LIMIT,
  EvalSet,
  EvalSummaryDto,
  SetBinding,
  parseEvalSet,
  parseRunId,
  setBindings,
} from './eval-sets';

/** How often a running run is read again. A run of 100 drafts takes minutes; 5 s is plenty. */
export const EVAL_POLL_MS = new InjectionToken<number>('EVAL_POLL_MS', {
  providedIn: 'root',
  factory: () => 5000,
});

/** The runs list of one set, in one shape for the three. */
export interface EvalRuns {
  readonly set: EvalSet;
  readonly bindings: readonly SetBinding[];
  readonly runs: readonly EvalSummaryDto[];
}

export type EvalRunDetail = EvalRunDto | VoiceEvalRunDto | AssistEvalRunDto;

/** What the run form sends; the fields a set does not take are left out. */
export interface EvalRunRequest {
  readonly modelId: string;
  readonly promptVersion?: string;
  readonly limit?: number;
  readonly pronunciation?: boolean;
}

/**
 * Data of "AI → Eval" (plan 90, phase 7, step 15): the set and the opened run come from the URL
 * (`?set=…&run=…`); the set's runs, the opened run and the model registry are separate reads.
 * While a run is `running` (it answers 202 and works in the background), the list and the opened
 * run are read again every few seconds until it ends.
 */
@Injectable()
export class AiEvalsData {
  private readonly ai = inject(AiApi);
  private readonly pollMs = inject(EVAL_POLL_MS);

  private readonly query = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(
      map((p) => ({ set: parseEvalSet(p.get('set')), runId: parseRunId(p.get('run')) })),
    ),
    { requireSync: true },
  );

  readonly set = computed(() => this.query().set);
  readonly runId = computed(() => this.query().runId);

  private readonly runsResource = rxResource({
    params: () => this.set(),
    stream: ({ params: set }) => this.list(set),
  });

  private readonly runResource = rxResource({
    params: () => {
      const runId = this.runId();
      return runId ? { set: this.set(), runId } : undefined;
    },
    stream: ({ params: { set, runId } }) => this.get(set, runId),
  });

  private readonly modelsResource = rxResource({
    stream: () => this.ai.invoke(adminRegistryListModels),
  });
  private readonly providersResource = rxResource({
    stream: () => this.ai.invoke(adminRegistryListProviders),
  });

  readonly runs = computed<ColumnState<EvalRuns>>(() => stateOf(this.runsResource));
  readonly run = computed<ColumnState<EvalRunDetail> | null>(() =>
    this.runId() ? stateOf(this.runResource) : null,
  );
  readonly models = computed<ColumnState<ModelResponseDto[]>>(() => stateOf(this.modelsResource));
  readonly providers = computed<ColumnState<ProviderResponseDto[]>>(() =>
    stateOf(this.providersResource),
  );

  /** Model names by registry id; empty until the registry is in (ids are shown instead). */
  readonly modelNames = computed(() => {
    const models = this.models();
    return new Map(
      models.kind === 'ready' ? models.value.map((m) => [m.id, m.displayName] as const) : [],
    );
  });

  /** Something is still measuring: the list or the opened run says `running`. */
  readonly running = computed(() => {
    const runs = this.runs();
    const run = this.run();
    return (
      (runs.kind === 'ready' && runs.value.runs.some((r) => r.status === 'running')) ||
      (run?.kind === 'ready' && run.value.status === 'running')
    );
  });

  constructor() {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    inject(DestroyRef).onDestroy(stop);
    // One timer at a time: each answer re-arms it while anything is still running. The states
    // are read (not only `running`, which stays `true`) so that every new answer re-runs this;
    // nothing is armed while a read is in flight.
    effect(() => {
      this.runs();
      this.run();
      stop();
      if (this.runsResource.isLoading() || this.runResource.isLoading()) return;
      if (!this.running()) return;
      timer = setTimeout(() => {
        timer = null;
        this.runsResource.reload();
        if (this.runId()) this.runResource.reload();
      }, this.pollMs);
    });
  }

  /** Starts a run of the current set; answers the new run (`running`). */
  start(request: EvalRunRequest): Observable<EvalSummaryDto> {
    const { modelId, promptVersion, limit, pronunciation } = request;
    switch (this.set()) {
      case 'review_draft':
        return this.ai.invoke(adminReviewEvalsRun, { body: { modelId, promptVersion, limit } });
      case 'voice_review':
        return this.ai.invoke(adminVoiceEvalsRun, { body: { modelId, limit, pronunciation } });
      case 'student_assist':
        return this.ai.invoke(adminAssistEvalsRun, { body: { modelId, promptVersion } });
    }
  }

  reloadRuns(): void {
    this.runsResource.reload();
  }

  reloadRun(): void {
    this.runResource.reload();
  }

  reloadRegistry(): void {
    this.modelsResource.reload();
    this.providersResource.reload();
  }

  private list(set: EvalSet): Observable<EvalRuns> {
    const limit = EVAL_RUNS_LIMIT;
    const source: Observable<{ runs: EvalSummaryDto[] }> =
      set === 'review_draft'
        ? this.ai.invoke(adminReviewEvalsList, { limit })
        : set === 'voice_review'
          ? this.ai.invoke(adminVoiceEvalsList, { limit })
          : this.ai.invoke(adminAssistEvalsList, { limit });
    return source.pipe(map((body) => ({ set, bindings: setBindings(set, body), runs: body.runs })));
  }

  private get(set: EvalSet, runId: string): Observable<EvalRunDetail> {
    switch (set) {
      case 'review_draft':
        return this.ai.invoke(adminReviewEvalsGet, { runId });
      case 'voice_review':
        return this.ai.invoke(adminVoiceEvalsGet, { runId });
      case 'student_assist':
        return this.ai.invoke(adminAssistEvalsGet, { runId });
    }
  }
}
