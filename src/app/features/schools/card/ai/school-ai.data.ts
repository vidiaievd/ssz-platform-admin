import { Injectable, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AiApi } from '../../../../api/ai/ai-api';
import { adminPayerPoliciesGet, adminUsageGet } from '../../../../api/ai/functions';
import { PayerPolicyResponseDto } from '../../../../api/ai/models/payer-policy-response-dto';
import { PayerUsageResponseDto } from '../../../../api/ai/models/payer-usage-response-dto';
import { adminSchoolsSettings } from '../../../../api/organization/functions';
import { AdminSchoolSettingsDto } from '../../../../api/organization/models/admin-school-settings-dto';
import { OrganizationApi } from '../../../../api/organization/organization-api';
import { adminAccountsGet } from '../../../../api/subscription/functions';
import { SubscriptionApi } from '../../../../api/subscription/subscription-api';
import { ColumnState } from '../../schools-list.data';
import { PAYER_TYPE, noAccountAsNull, stateOf } from '../plan/school-plan.data';
import { SchoolCardData } from '../school-card.data';
import { AiKeyRow, aiKeyRows } from './ai-key-rows';

/**
 * Data of the "AI & services" tab: the AI keys as the gate reads them and what is spent
 * (ai-service), the live grants that explain where a key's state comes from (subscription), the
 * payer policy (ai-service) and the school's own AI and review settings (organization, read only).
 * Four independent reads: one failing leaves the others on screen (§5, rule 5).
 */
@Injectable()
export class SchoolAiData {
  private readonly ai = inject(AiApi);
  private readonly subscription = inject(SubscriptionApi);
  private readonly organization = inject(OrganizationApi);
  readonly card = inject(SchoolCardData);

  private readonly usageResource = rxResource({
    params: () => this.card.schoolId(),
    stream: ({ params: payerId }) =>
      this.ai.invoke(adminUsageGet, { payerType: PAYER_TYPE, payerId }),
  });

  /** Read on its own, not from the usage answer: the policy stays when the tariff is down. */
  private readonly policyResource = rxResource({
    params: () => this.card.schoolId(),
    stream: ({ params: payerId }) =>
      this.ai.invoke(adminPayerPoliciesGet, { payerType: PAYER_TYPE, payerId }),
  });

  private readonly accountResource = rxResource({
    params: () => this.card.schoolId(),
    stream: ({ params: externalId }) =>
      this.subscription
        .invoke(adminAccountsGet, { type: PAYER_TYPE, externalId })
        .pipe(noAccountAsNull),
  });

  private readonly settingsResource = rxResource({
    params: () => this.card.schoolId(),
    stream: ({ params: schoolId }) => this.organization.invoke(adminSchoolsSettings, { schoolId }),
  });

  readonly usage = computed<ColumnState<PayerUsageResponseDto>>(() => stateOf(this.usageResource));
  readonly policy = computed<ColumnState<PayerPolicyResponseDto>>(() =>
    stateOf(this.policyResource),
  );
  readonly settings = computed<ColumnState<AdminSchoolSettingsDto>>(() =>
    stateOf(this.settingsResource),
  );
  /** The grants could not be read (the rows then show no source). */
  readonly grantsFailed = computed(() => !!this.accountResource.error());

  /** The keys with their source; empty until the usage is read. */
  readonly rows = computed<AiKeyRow[]>(() => {
    const usage = this.usage();
    if (usage.kind !== 'ready') return [];
    const account = this.accountResource.hasValue() ? this.accountResource.value() : undefined;
    // No account = no grants; still unknown while loading or after a failure.
    const grants = account === undefined ? null : (account?.grants ?? []);
    return aiKeyRows(usage.value.features, grants);
  });

  reloadUsage(): void {
    this.usageResource.reload();
  }

  reloadPolicy(): void {
    this.policyResource.reload();
  }

  reloadGrants(): void {
    this.accountResource.reload();
  }

  reloadSettings(): void {
    this.settingsResource.reload();
  }

  /** After a grant is issued or revoked: the keys, their grants and the card's header. */
  afterGrantChange(): void {
    this.usageResource.reload();
    this.accountResource.reload();
    this.card.reloadPlan();
  }
}
