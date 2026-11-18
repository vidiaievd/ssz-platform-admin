import { parseAppConfig } from './app-config';

describe('parseAppConfig', () => {
  it('accepts a gateway URL and drops trailing slashes', () => {
    expect(parseAppConfig({ apiBaseUrl: 'http://localhost/' })).toEqual({
      apiBaseUrl: 'http://localhost',
    });
  });

  it('rejects a missing or empty apiBaseUrl', () => {
    expect(() => parseAppConfig({})).toThrow(/apiBaseUrl/);
    expect(() => parseAppConfig({ apiBaseUrl: ' ' })).toThrow(/apiBaseUrl/);
  });

  it('rejects something that is not an http(s) URL', () => {
    expect(() => parseAppConfig({ apiBaseUrl: 'localhost' })).toThrow(/not a URL/);
    expect(() => parseAppConfig({ apiBaseUrl: 'ftp://x' })).toThrow(/http/);
  });

  it('keeps a license key and drops an empty one', () => {
    expect(parseAppConfig({ apiBaseUrl: 'http://x', primeUiLicense: ' key ' }).primeUiLicense).toBe(
      'key',
    );
    expect(parseAppConfig({ apiBaseUrl: 'http://x', primeUiLicense: '' })).toEqual({
      apiBaseUrl: 'http://x',
    });
    expect(() => parseAppConfig({ apiBaseUrl: 'http://x', primeUiLicense: 1 })).toThrow(/string/);
  });

  it('rejects a non-object', () => {
    expect(() => parseAppConfig(null)).toThrow(/object/);
  });
});
