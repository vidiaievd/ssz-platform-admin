import { EnvironmentProviders, inject, makeEnvironmentProviders } from '@angular/core';
import { AiApiConfiguration } from '../../api/ai/ai-api-configuration';
import { AnalyticsApiConfiguration } from '../../api/analytics/analytics-api-configuration';
import { ContentApiConfiguration } from '../../api/content/content-api-configuration';
import { OrganizationApiConfiguration } from '../../api/organization/organization-api-configuration';
import { SubscriptionApiConfiguration } from '../../api/subscription/subscription-api-configuration';
import { UserProfileApiConfiguration } from '../../api/user-profile/user-profile-api-configuration';
import { APP_CONFIG } from '../config/app-config';

/**
 * Configurations of the generated clients (src/app/api, `npm run api:gen`). Every client goes
 * through the gateway — the specs' paths already carry `/api/v1` — so all of them share
 * `apiBaseUrl` from config.json; the interceptor adds the Bearer there. A new client is added here.
 */
const CLIENT_CONFIGURATIONS = [
  AiApiConfiguration,
  AnalyticsApiConfiguration,
  ContentApiConfiguration,
  OrganizationApiConfiguration,
  SubscriptionApiConfiguration,
  UserProfileApiConfiguration,
] as const;

/** Points every generated client at the gateway from the runtime config. */
export function provideApiClients(): EnvironmentProviders {
  return makeEnvironmentProviders(
    CLIENT_CONFIGURATIONS.map((Configuration) => ({
      provide: Configuration,
      useFactory: () => {
        const configuration = new Configuration();
        configuration.rootUrl = inject(APP_CONFIG).apiBaseUrl;
        return configuration;
      },
    })),
  );
}
