import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AdminLevel } from '../../core/auth/admin-level';
import { SessionStore } from '../../core/auth/session.store';
import { adminToken, sessionBody, settle } from '../../core/auth/testing';
import { APP_CONFIG } from '../../core/config/app-config';
import { ReasonDialog } from './reason-dialog';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../public/i18n/en.json';

@Component({
  imports: [ReasonDialog],
  template: `
    <app-reason-dialog
      [(visible)]="open"
      header="Change plan"
      confirmLabel="Change"
      [level]="level()"
      [ready]="ready()"
      [action]="action"
      (done)="done.push($event)"
    >
      <input data-testid="extra-field" />
    </app-reason-dialog>
  `,
})
class Host {
  readonly open = signal(false);
  readonly level = signal<AdminLevel>('admin');
  readonly ready = signal(true);
  readonly done: unknown[] = [];
  readonly reasons: string[] = [];
  answer: () => Observable<unknown> = () => of('ok');
  readonly action = (reason: string) => {
    this.reasons.push(reason);
    return this.answer();
  };
}

function httpError(status: number, body: unknown = null): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body, url: 'http://gw/x' });
}

describe('ReasonDialog', () => {
  let host: Host;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://gw' } },
      ],
    });
  });

  async function stable(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await settle();
      TestBed.tick();
    }
  }

  async function mount(level: AdminLevel = 'admin'): Promise<void> {
    TestBed.inject(SessionStore).start(sessionBody(adminToken({ admin_level: level })));
    const fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await stable();
  }

  async function show(): Promise<void> {
    host.open.set(true);
    await vi.waitFor(async () => {
      await stable();
      expect(find('reason-input')?.isConnected).toBe(true);
    });
  }

  // p-dialog renders into the page, not into the host element.
  const find = <T extends HTMLElement = HTMLElement>(testId: string) =>
    document.body.querySelector<T>(`[data-testid="${testId}"]`);
  const text = (testId: string) => find(testId)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

  async function type(value: string): Promise<void> {
    const field = find<HTMLTextAreaElement>('reason-input')!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await stable();
  }

  async function confirm(): Promise<void> {
    find<HTMLButtonElement>('reason-confirm')!.click();
    await stable();
  }

  it('requires a reason before calling the action', async () => {
    await mount();
    await show();
    await type('   ');
    await confirm();
    expect(host.reasons).toEqual([]);
    expect(text('reason-required')).toBe('Name the reason for this change.');
    expect(host.open()).toBe(true);
  });

  it('sends the trimmed reason, closes and emits the result', async () => {
    await mount();
    await show();
    await type('  Agreed with the school, ticket #142 ');
    expect(text('reason-counter')).toBe('38 / 500');
    await confirm();
    expect(host.reasons).toEqual(['Agreed with the school, ticket #142']);
    expect(host.done).toEqual(['ok']);
    expect(host.open()).toBe(false);
  });

  it('does not call the action while the projected fields are not ready', async () => {
    await mount();
    host.ready.set(false);
    await show();
    await type('reason');
    await confirm();
    expect(host.reasons).toEqual([]);
    host.ready.set(true);
    await stable();
    await confirm();
    expect(host.reasons).toEqual(['reason']);
  });

  it('shows the refusal inside and stays open with what was typed', async () => {
    await mount();
    host.answer = () =>
      throwError(() =>
        httpError(422, { statusCode: 422, code: 'grant_disable_with_allowance', message: 'x' }),
      );
    await show();
    await type('Switch the key off');
    await confirm();
    expect(text('reason-error')).toContain('The server refused the change.');
    expect(text('reason-error-code')).toBe('grant_disable_with_allowance');
    expect(host.open()).toBe(true);
    expect(find<HTMLTextAreaElement>('reason-input')!.value).toBe('Switch the key off');
    expect(host.done).toEqual([]);
  });

  it('reads a 409 as "changed meanwhile"', async () => {
    await mount();
    host.answer = () => throwError(() => httpError(409, { statusCode: 409, message: 'stale' }));
    await show();
    await type('reason');
    await confirm();
    expect(text('reason-error')).toContain('It has changed meanwhile.');
  });

  it('blocks closing and a second submit while the server answers', async () => {
    await mount();
    const answer = new Subject<string>();
    host.answer = () => answer;
    await show();
    await type('reason');
    await confirm();
    expect(find<HTMLButtonElement>('reason-confirm')!.disabled).toBe(true);
    expect(find<HTMLButtonElement>('reason-cancel')!.disabled).toBe(true);
    await confirm();
    expect(host.reasons).toHaveLength(1);
    answer.next('ok');
    answer.complete();
    await stable();
    expect(host.done).toEqual(['ok']);
  });

  it('starts clean on the next opening', async () => {
    await mount();
    host.answer = () => throwError(() => httpError(500));
    await show();
    await type('first try');
    await confirm();
    expect(find('reason-error')).not.toBeNull();
    find<HTMLButtonElement>('reason-cancel')!.click();
    await stable();
    expect(host.open()).toBe(false);

    await show();
    expect(find<HTMLTextAreaElement>('reason-input')!.value).toBe('');
    expect(find('reason-error')).toBeNull();
    expect(find('reason-required')).toBeNull();
  });

  it('shows nothing to a level below the action', async () => {
    await mount('support');
    host.open.set(true);
    await stable();
    await stable();
    expect(find('reason-dialog')).toBeNull();
    expect(host.reasons).toEqual([]);
  });
});
