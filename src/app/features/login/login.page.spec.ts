import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { adminToken, sessionBody, settle } from '../../core/auth/testing';
import { APP_CONFIG } from '../../core/config/app-config';
import { backupCodesFile } from './backup-codes-step';
import { LoginPage } from './login.page';
// Real English texts, so a missing key would show up as the key itself.
import en from '../../../../public/i18n/en.json';

const BASE = 'http://gw/api/v1/auth/admin/session';
const LATER = '2999-01-01T00:00:00Z';

describe('LoginPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        LoginPage,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://gw' } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(LoginPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const query = <T extends Element = HTMLElement>(selector: string) =>
      el.querySelector<T & Element>(selector) as T | null;
    const type = (selector: string, value: string) => {
      const input = query<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const submit = async () => {
      query<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
    };
    const stable = async () => {
      await settle();
      await fixture.whenStable();
    };
    return { fixture, el, query, type, submit, stable };
  }

  it('does not call the server with an empty form', async () => {
    const { query, submit } = await render();
    await submit();
    http.expectNone(`${BASE}/login`);
    expect(query('[data-testid="password-step-invalid"]')?.textContent).toContain(
      'Enter your email and password.',
    );
  });

  it('shows and hides the password with the eye button', async () => {
    const { query, stable } = await render();
    const input = query<HTMLInputElement>('#login-password')!;
    const toggle = query<HTMLButtonElement>('[data-testid="toggle-password"]')!;
    expect(input.type).toBe('password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    toggle.click();
    await stable();
    expect(input.type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    toggle.click();
    await stable();
    expect(input.type).toBe('password');
  });

  it('password → MFA → wrong code shows the message', async () => {
    const { query, type, submit, stable } = await render();
    type('#login-email', 'admin@example.no');
    type('#login-password', 'pw');
    await submit();
    http
      .expectOne(`${BASE}/login`)
      .flush({ mfaRequired: true, challenge: { mfaChallengeToken: 'c', expiresAt: LATER } });
    await stable();

    expect(query('[data-testid="login-title"]')?.textContent).toContain('Two-factor verification');
    type('#login-code', '000000');
    await submit();
    http
      .expectOne(`${BASE}/mfa`)
      .flush({ code: 'INVALID_TOTP_CODE' }, { status: 401, statusText: 'Unauthorized' });
    await stable();

    expect(query('[data-testid="login-message"]')?.textContent).toContain('Wrong code.');
  });

  it('setup shows the QR and secret; backup codes need "saved" before continuing', async () => {
    const { query, el, type, submit, stable, fixture } = await render();
    type('#login-email', 'admin@example.no');
    type('#login-password', 'pw');
    await submit();
    http
      .expectOne(`${BASE}/login`)
      .flush({ mfaSetupRequired: true, setup: { mfaSetupToken: 's', expiresAt: LATER } });
    await stable();
    http.expectOne(`${BASE}/mfa-setup`).flush({
      secretKey: 'JBSWY3DPEHPK3PXP',
      qrCodeUri: 'otpauth://totp/x',
      qrCodeImageBase64: 'iVBO',
    });
    await stable();

    expect(query<HTMLImageElement>('[data-testid="setup-qr"]')?.src).toBe(
      'data:image/png;base64,iVBO',
    );
    expect(query('[data-testid="setup-secret"]')?.textContent).toBe('JBSW Y3DP EHPK 3PXP');

    type('#setup-code', '654 321');
    await submit();
    const confirm = http.expectOne(`${BASE}/mfa-setup/confirm`);
    expect(confirm.request.body).toEqual({ mfaSetupToken: 's', code: '654321' });
    confirm.flush({
      ...sessionBody(adminToken()),
      backupCodes: ['AAAAAAAA-0001', 'BBBBBBBB-0002'],
    });
    await stable();

    expect(query('[data-testid="backup-codes"]')?.textContent).toContain('BBBBBBBB-0002');
    const continueButton = () =>
      el.querySelector<HTMLButtonElement>('[data-testid="codes-continue"]')!;
    expect(continueButton().disabled).toBe(true);

    el.querySelector<HTMLInputElement>('#codes-saved')!.click();
    await fixture.whenStable();
    expect(continueButton().disabled).toBe(false);
  });

  it('the backup-codes file names the account and the date', () => {
    const transloco = TestBed.inject(TranslocoService);
    const text = backupCodesFile(
      transloco,
      'admin@example.no',
      ['AAAAAAAA-0001', 'BBBBBBBB-0002'],
      new Date('2026-11-09T12:00:00Z'),
    );
    expect(text.split('\n')).toEqual([
      'SSZ admin panel backup codes',
      'admin@example.no',
      '2026-11-09',
      '',
      'AAAAAAAA-0001',
      'BBBBBBBB-0002',
      '',
      'Each code works once. Keep this file somewhere safe.',
      '',
    ]);
  });
});
