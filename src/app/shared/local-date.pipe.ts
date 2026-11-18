import { Pipe, PipeTransform } from '@angular/core';
import { Language } from '../core/i18n/languages';

const formats = new Map<Language, Intl.DateTimeFormat>();

/**
 * A date in the panel's language — `{{ iso | localDate: lang() }}`. `Intl` instead of
 * Angular's DatePipe, which needs locale data registered for uk/nb. Passing the language keeps
 * the pipe pure and still re-renders on a switch. Invalid input renders as an empty string.
 */
@Pipe({ name: 'localDate' })
export class LocalDatePipe implements PipeTransform {
  transform(value: string | null | undefined, lang: Language): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    let format = formats.get(lang);
    if (!format) {
      format = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' });
      formats.set(lang, format);
    }
    return format.format(date);
  }
}
