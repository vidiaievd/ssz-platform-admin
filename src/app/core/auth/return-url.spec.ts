import { safeReturnUrl } from './return-url';

describe('safeReturnUrl', () => {
  it('keeps a path inside the panel, query included', () => {
    expect(safeReturnUrl('/schools?status=active&page=2')).toBe('/schools?status=active&page=2');
  });

  it.each([
    [null],
    [undefined],
    [''],
    ['schools'],
    ['//evil.example/x'],
    ['/\\evil.example'],
    ['https://evil.example'],
    ['javascript:alert(1)'],
    ['/schools\n'],
    ['/login'],
    ['/login?returnUrl=%2F'],
  ])('falls back to / for %j', (raw) => {
    expect(safeReturnUrl(raw)).toBe('/');
  });
});
