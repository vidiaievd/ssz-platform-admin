import { provideHttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { APP_CONFIG } from '../config/app-config';
import { authGuard } from './auth.guard';
import { SessionStore } from './session.store';
import { adminToken, sessionBody } from './testing';

@Component({ template: 'panel' })
class PanelStub {}

@Component({ template: 'login' })
class LoginStub {}

describe('authGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://gw' } },
        provideRouter([
          { path: 'login', component: LoginStub },
          {
            path: '',
            canActivate: [authGuard],
            canActivateChild: [authGuard],
            children: [
              { path: '', pathMatch: 'full', component: PanelStub },
              { path: 'schools', component: PanelStub },
            ],
          },
        ]),
      ],
    });
  });

  it('lets a signed-in administrator in', async () => {
    TestBed.inject(SessionStore).start(sessionBody(adminToken()));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/schools?page=2');
    expect(TestBed.inject(Router).url).toBe('/schools?page=2');
  });

  it('sends a signed-out visitor to sign-in with where they were heading', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/schools?page=2');
    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Fschools%3Fpage%3D2');
  });

  it('sends a signed-out visitor of the overview to sign-in without returnUrl', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('catches a session that ended between navigations', async () => {
    const session = TestBed.inject(SessionStore);
    session.start(sessionBody(adminToken()));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');

    session.clear();
    await harness.navigateByUrl('/schools');
    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Fschools');
  });
});
