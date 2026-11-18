import { Injectable, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { AiApi } from '../../../api/ai/ai-api';
import {
  adminBindingsList,
  adminRegistryListModels,
  adminRegistryListProviders,
} from '../../../api/ai/functions';
import { CapabilityBindingResponseDto } from '../../../api/ai/models/capability-binding-response-dto';
import { ColumnState } from '../../schools/schools-list.data';
import { stateOf } from '../../schools/card/plan/school-plan.data';
import { AgentBindingRow, Registry, agentBindingRows } from './agent-binding-rows';

/**
 * Data of "AI → Agent models": every capability with its binding, and the model registry
 * (models + providers) that names the bound models. Two independent reads: without the
 * registry the rows still show, with model ids instead of names, and editing waits for it.
 */
@Injectable()
export class AgentBindingsData {
  private readonly ai = inject(AiApi);

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

  readonly bindings = computed<ColumnState<CapabilityBindingResponseDto[]>>(() =>
    stateOf(this.bindingsResource),
  );
  readonly registry = computed<ColumnState<Registry>>(() => stateOf(this.registryResource));

  readonly rows = computed<AgentBindingRow[]>(() => {
    const bindings = this.bindings();
    if (bindings.kind !== 'ready') return [];
    const registry = this.registry();
    return agentBindingRows(bindings.value, registry.kind === 'ready' ? registry.value : null);
  });

  readonly unbound = computed(() => this.rows().filter((r) => !r.binding).length);

  reloadBindings(): void {
    this.bindingsResource.reload();
  }

  reloadRegistry(): void {
    this.registryResource.reload();
  }
}
