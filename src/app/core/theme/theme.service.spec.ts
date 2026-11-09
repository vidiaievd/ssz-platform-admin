import { TestBed } from '@angular/core/testing';
import { DARK_CLASS, ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove(DARK_CLASS);
  });

  it('defaults to following the system', () => {
    const theme = TestBed.inject(ThemeService);
    expect(theme.mode()).toBe('system');
  });

  it('puts the dark class on <html> and remembers the choice', () => {
    const theme = TestBed.inject(ThemeService);
    theme.setMode('dark');
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
    expect(localStorage.getItem('ssz-admin.theme')).toBe('dark');

    theme.setMode('light');
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
  });

  it('cycles light → dark → system', () => {
    const theme = TestBed.inject(ThemeService);
    theme.setMode('light');
    theme.cycle();
    expect(theme.mode()).toBe('dark');
    theme.cycle();
    expect(theme.mode()).toBe('system');
    theme.cycle();
    expect(theme.mode()).toBe('light');
  });

  it('ignores a garbage stored value', () => {
    localStorage.setItem('ssz-admin.theme', 'purple');
    expect(TestBed.inject(ThemeService).mode()).toBe('system');
  });
});
