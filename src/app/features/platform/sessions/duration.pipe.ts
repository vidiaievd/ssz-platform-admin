import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { durationParts } from './token-lifetime-rows';

/** Hours in the panel's language: "7 d", "1 d 12 h", "12 h". */
export function formatDuration(transloco: TranslocoService, totalHours: number): string {
  const { days, hours } = durationParts(totalHours);
  if (days === 0) return transloco.translate('platform.sessions.duration.hours', { hours });
  if (hours === 0) return transloco.translate('platform.sessions.duration.days', { days });
  return transloco.translate('platform.sessions.duration.daysHours', { days, hours });
}

/** `{{ 168 | duration }}` → "7 d". Impure: it follows a language switch. */
@Pipe({ name: 'duration', pure: false })
export class DurationPipe implements PipeTransform {
  private readonly transloco = inject(TranslocoService);

  transform(hours: number): string {
    return formatDuration(this.transloco, hours);
  }
}
