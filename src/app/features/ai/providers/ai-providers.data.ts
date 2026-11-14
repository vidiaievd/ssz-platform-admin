import { Injectable, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AiApi } from '../../../api/ai/ai-api';
import {
  adminBreakersList,
  adminRegistryListModels,
  adminRegistryListProviders,
} from '../../../api/ai/functions';
import { BreakerBoardDto } from '../../../api/ai/models/breaker-board-dto';
import { ModelResponseDto } from '../../../api/ai/models/model-response-dto';
import { ProviderResponseDto } from '../../../api/ai/models/provider-response-dto';
import { ColumnState } from '../../schools/schools-list.data';
import { stateOf } from '../../schools/card/plan/school-plan.data';
import { ProviderCard, RegistryChange, providerCards, strandedBy } from './provider-cards';

/**
 * Data of "AI → Providers": providers, models and the breaker board — three reads that fail
 * alone. Without providers there is nothing to show; without models a card says so; without the
 * board the breaker column is "—" and the dialogs cannot warn before a switch.
 */
@Injectable()
export class AiProvidersData {
  private readonly ai = inject(AiApi);

  private readonly providersResource = rxResource({
    stream: () => this.ai.invoke(adminRegistryListProviders),
  });
  private readonly modelsResource = rxResource({
    stream: () => this.ai.invoke(adminRegistryListModels),
  });
  private readonly breakersResource = rxResource({
    stream: () => this.ai.invoke(adminBreakersList),
  });

  readonly providers = computed<ColumnState<ProviderResponseDto[]>>(() =>
    stateOf(this.providersResource),
  );
  readonly models = computed<ColumnState<ModelResponseDto[]>>(() => stateOf(this.modelsResource));
  readonly board = computed<ColumnState<BreakerBoardDto>>(() => stateOf(this.breakersResource));

  readonly cards = computed<ProviderCard[]>(() => {
    const providers = this.providers();
    if (providers.kind !== 'ready') return [];
    const models = this.models();
    const board = this.board();
    return providerCards(
      providers.value,
      models.kind === 'ready' ? models.value : null,
      board.kind === 'ready' ? board.value.items : null,
    );
  });

  /** The agents a change would strand; null when the reads it needs are not in. */
  strandedBy(change: RegistryChange): string[] | null {
    const providers = this.providers();
    const models = this.models();
    const board = this.board();
    if (providers.kind !== 'ready' || models.kind !== 'ready' || board.kind !== 'ready') {
      return null;
    }
    return strandedBy(change, providers.value, models.value, board.value.items);
  }

  reloadProviders(): void {
    this.providersResource.reload();
  }

  reloadModels(): void {
    this.modelsResource.reload();
  }

  reloadBreakers(): void {
    this.breakersResource.reload();
  }

  reloadAll(): void {
    this.reloadProviders();
    this.reloadModels();
    this.reloadBreakers();
  }
}
