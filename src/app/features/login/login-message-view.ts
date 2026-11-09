import { Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Message } from 'primeng/message';
import { LanguageService } from '../../core/i18n/language.service';
import { LoginMessage } from './login-message';

/** One line under the sign-in form; a lock shows its unlock time in the panel's language. */
@Component({
  selector: 'app-login-message',
  imports: [Message, TranslocoPipe],
  // No box of its own: with no message it must not take a gap in the card's flex column.
  host: { class: 'contents' },
  template: `
    @if (message(); as m) {
      <p-message severity="error" role="alert" data-testid="login-message">
        {{ 'login.messages.' + m.key | transloco: params() }}
      </p-message>
    }
  `,
})
export class LoginMessageView {
  private readonly language = inject(LanguageService);

  readonly message = input<LoginMessage | null>(null);

  protected readonly params = computed(() => {
    const until = this.message()?.until;
    if (!until) return {};
    const format = new Intl.DateTimeFormat(this.language.current(), {
      hour: '2-digit',
      minute: '2-digit',
    });
    return { time: format.format(until) };
  });
}
