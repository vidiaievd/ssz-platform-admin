import { LocalDatePipe } from './local-date.pipe';

describe('LocalDatePipe', () => {
  const pipe = new LocalDatePipe();

  it('formats in the panel language', () => {
    const iso = '2026-03-05T10:00:00.000Z';
    expect(pipe.transform(iso, 'en')).toBe(
      new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(
        new Date(iso),
      ),
    );
    expect(pipe.transform(iso, 'en')).toContain('2026');
    expect(pipe.transform(iso, 'uk')).not.toBe(pipe.transform(iso, 'en'));
  });

  it('renders nothing for missing or invalid input', () => {
    expect(pipe.transform(null, 'uk')).toBe('');
    expect(pipe.transform('', 'uk')).toBe('');
    expect(pipe.transform('not a date', 'uk')).toBe('');
  });
});
