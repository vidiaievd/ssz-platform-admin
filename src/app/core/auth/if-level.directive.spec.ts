import { provideHttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { IfLevelDirective } from './if-level.directive';
import { SessionStore } from './session.store';
import { adminToken, sessionBody } from './testing';

@Component({
  imports: [IfLevelDirective],
  template: `
    <span data-testid="support" *appIfLevel="'support'">support</span>
    <span data-testid="admin" *appIfLevel="'admin'">admin</span>
    <span data-testid="super" *appIfLevel="'super'">super</span>
  `,
})
class Host {}

describe('IfLevelDirective', () => {
  let session: SessionStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://gw' } },
      ],
    });
    session = TestBed.inject(SessionStore);
  });

  async function shown(): Promise<string[]> {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return render(fixture.nativeElement as HTMLElement);
  }

  function render(el: HTMLElement): string[] {
    return Array.from(el.querySelectorAll('[data-testid]'), (e) => e.getAttribute('data-testid')!);
  }

  it('draws nothing without a session', async () => {
    expect(await shown()).toEqual([]);
  });

  it('draws only what support may do', async () => {
    session.start(sessionBody(adminToken({ admin_level: 'support' })));
    expect(await shown()).toEqual(['support']);
  });

  it('draws what admin may do', async () => {
    session.start(sessionBody(adminToken({ admin_level: 'admin' })));
    expect(await shown()).toEqual(['support', 'admin']);
  });

  it('draws everything for super', async () => {
    session.start(sessionBody(adminToken({ admin_level: 'super' })));
    expect(await shown()).toEqual(['support', 'admin', 'super']);
  });

  it('follows the session: a lower level hides, a higher one draws', async () => {
    session.start(sessionBody(adminToken({ admin_level: 'super' })));
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    session.start(sessionBody(adminToken({ admin_level: 'support' })));
    await fixture.whenStable();
    expect(render(el)).toEqual(['support']);

    session.clear();
    await fixture.whenStable();
    expect(render(el)).toEqual([]);

    session.start(sessionBody(adminToken({ admin_level: 'admin' })));
    await fixture.whenStable();
    expect(render(el)).toEqual(['support', 'admin']);
  });
});
