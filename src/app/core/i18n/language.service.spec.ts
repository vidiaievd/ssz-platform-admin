import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { LanguageService } from './language.service';

describe('LanguageService', () => {
  let active: string;

  beforeEach(() => {
    localStorage.clear();
    active = '';
    TestBed.configureTestingModule({
      providers: [
        {
          provide: TranslocoService,
          useValue: { setActiveLang: (lang: string) => (active = lang) },
        },
      ],
    });
  });

  it('starts in Ukrainian when nothing is stored', () => {
    const service = TestBed.inject(LanguageService);
    service.init();
    expect(service.current()).toBe('uk');
    expect(active).toBe('uk');
    expect(document.documentElement.lang).toBe('uk');
  });

  it('starts in the stored language', () => {
    localStorage.setItem('ssz-admin.lang', 'nb');
    const service = TestBed.inject(LanguageService);
    service.init();
    expect(active).toBe('nb');
  });

  it('ignores an unknown stored language', () => {
    localStorage.setItem('ssz-admin.lang', 'de');
    expect(TestBed.inject(LanguageService).current()).toBe('uk');
  });

  it('switches and remembers', () => {
    const service = TestBed.inject(LanguageService);
    service.set('en');
    expect(active).toBe('en');
    expect(localStorage.getItem('ssz-admin.lang')).toBe('en');
  });
});
