import { InjectionToken } from '@angular/core';

/**
 * Settings that differ per deployment. They are read at runtime from `/config.json`
 * (see `loadAppConfig`), not baked in at build time, so one build serves every environment:
 * a container only has to put its own `config.json` next to `index.html`.
 */
export interface AppConfig {
  /** Gateway origin, without a trailing slash, e.g. `http://localhost` or `https://api.example.no`. */
  readonly apiBaseUrl: string;
  /**
   * PrimeUI license key (PrimeNG 22+ is licensed; free under the Community license). Without
   * it PrimeNG shows an "Invalid PrimeUI License" notice. It ends up in the browser anyway —
   * it is verified offline — but it is not committed: the repository is public.
   */
  readonly primeUiLicense?: string;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

/** Checks the raw JSON and normalises it; throws with a readable message on a bad file. */
export function parseAppConfig(raw: unknown): AppConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('config.json: expected an object');
  }
  const { apiBaseUrl, primeUiLicense } = raw as Record<string, unknown>;
  if (typeof apiBaseUrl !== 'string' || apiBaseUrl.trim() === '') {
    throw new Error('config.json: "apiBaseUrl" must be a non-empty string');
  }
  let url: URL;
  try {
    url = new URL(apiBaseUrl);
  } catch {
    throw new Error(`config.json: "apiBaseUrl" is not a URL: ${apiBaseUrl}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('config.json: "apiBaseUrl" must be http(s)');
  }
  if (primeUiLicense !== undefined && typeof primeUiLicense !== 'string') {
    throw new Error('config.json: "primeUiLicense" must be a string');
  }
  return {
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ''),
    ...(primeUiLicense?.trim() ? { primeUiLicense: primeUiLicense.trim() } : {}),
  };
}

/** Fetches `/config.json` before Angular starts; `cache: 'no-store'` so a redeploy is seen at once. */
export async function loadAppConfig(url = '/config.json'): Promise<AppConfig> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`config.json: HTTP ${response.status}`);
  }
  return parseAppConfig(await response.json());
}
