import { provideHttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { APP_CONFIG } from '../config/app-config';
import { MIN_LEVEL, levelGuard } from './level.guard';
import { SessionStore } from './session.store';
import { adminToken, sessionBody } from './testing';

@Component({ template: 'gated' })
class GatedStub {}

@Component({ template: 'not found' })
class NotFoundStub {}

describe('levelGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://gw' } },
        provideRouter([
          { path: 'open', canMatch: [levelGuard], component: GatedStub },
          {
            path: 'admins',
            canMatch: [levelGuard],
            data: { [MIN_LEVEL]: 'super' },
            component: GatedStub,
          },
          {
            path: 'grants',
            canMatch: [levelGuard],
            data: { [MIN_LEVEL]: 'admin' },
            component: GatedStub,
          },
          {
            path: 'typo',
            canMatch: [levelGuard],
            data: { [MIN_LEVEL]: 'root' },
            component: GatedStub,
          },
          { path: '**', component: NotFoundStub },
        ]),
      ],
    });
  });

  async function visit(level: string | null, url: string): Promise<string> {
    if (level) TestBed.inject(SessionStore).start(sessionBody(adminToken({ admin_level: level })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return (harness.routeNativeElement?.textContent ?? '').trim();
  }

  it('opens a route without a level to every level', async () => {
    expect(await visit('support', '/open')).toBe('gated');
  });

  it('matches the required level and above', async () => {
    expect(await visit('admin', '/grants')).toBe('gated');
  });

  it('matches above the required level', async () => {
    expect(await visit('super', '/grants')).toBe('gated');
  });

  it('falls through to not-found below the required level', async () => {
    expect(await visit('admin', '/admins')).toBe('not found');
    expect(TestBed.inject(Router).url).toBe('/admins');
  });

  it('matches nobody without a session', async () => {
    expect(await visit(null, '/grants')).toBe('not found');
  });

  it('matches nobody for a misspelt level', async () => {
    expect(await visit('super', '/typo')).toBe('not found');
  });
});
