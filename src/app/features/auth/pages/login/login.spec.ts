import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { environment } from '@env/environment';
import Login from './login';

describe('Login', () => {
  const useMock = environment.useMock;
  afterEach(() => (environment.useMock = useMock));

  function render(
    mock: boolean,
    expired?: string,
    unavailable = false,
  ): { text: string; username: string } {
    environment.useMock = mock;
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        {
          provide: AuthService,
          useValue: { companyCode: signal('DEMO'), unavailable: signal(unavailable) },
        },
        provideRouter([]),
      ],
    });
    const fixture = TestBed.createComponent(Login);
    if (expired) fixture.componentRef.setInput('expired', expired);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('input[formControlName="username"]');
    return { text: el.textContent ?? '', username: input?.value ?? '' };
  }

  it('hints and prefills the seed login on the mock', () => {
    const { text, username } = render(true);
    expect(text).toContain('ทดลองใช้: บริษัท DEMO');
    expect(username).toBe('admin');
  });

  it('shows no seed login on a real backend (C3-2)', () => {
    const { text, username } = render(false);
    expect(text).not.toContain('ทดลองใช้');
    expect(text).not.toContain('admin');
    expect(username).toBe('');
  });

  it('says the session expired when sent here by a 401 (?expired=1, C3-6)', () => {
    expect(render(false).text).not.toContain('เซสชันหมดอายุ');
    TestBed.resetTestingModule();
    expect(render(false, '1').text).toContain('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  });

  it('says the system is not answering when /me failed with a server error (V2-U-14)', () => {
    const { text } = render(false, undefined, true);
    expect(text).toContain('ระบบไม่ตอบสนองชั่วคราว');
    expect(text).not.toContain('เซสชันหมดอายุ');
  });

  describe('Microsoft Authenticator (E55)', () => {
    const assign = vi.fn();
    const login = vi.fn();
    const verifyMfa = vi.fn();

    function open(mfa = false) {
      assign.mockReset();
      login.mockReset();
      verifyMfa.mockReset();
      environment.useMock = false;
      TestBed.configureTestingModule({
        imports: [Login],
        providers: [
          {
            provide: AuthService,
            useValue: {
              companyCode: signal('DEMO'),
              unavailable: signal(false),
              login,
              verifyMfa,
            },
          },
          // The real document (Angular renders into it) with a stub `location.assign`.
          {
            provide: DOCUMENT,
            useValue: new Proxy(document, {
              get: (doc, key) => {
                if (key === 'location') return { assign };
                const value = Reflect.get(doc, key) as unknown;
                return typeof value === 'function' ? value.bind(doc) : value;
              },
            }),
          },
          provideRouter([]),
        ],
      });
      const fixture = TestBed.createComponent(Login);
      if (mfa) fixture.componentRef.setInput('mfa', true);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const type = (selector: string, value: string) => {
        const input = el.querySelector<HTMLInputElement>(selector)!;
        input.value = value;
        input.dispatchEvent(new Event('input'));
      };
      const submit = async () => {
        el.querySelector('form')!.dispatchEvent(new Event('submit'));
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
      };
      return { fixture, el, type, submit };
    }

    it('asks /auth/login-mfa logins for the code and goes in after it', async () => {
      const { el, type, submit } = open(true);
      expect(el.textContent).toContain('เข้าสู่ระบบด้วย Microsoft Authenticator');
      expect(el.textContent).toContain('เข้าสู่ระบบด้วยรหัสผ่านอย่างเดียว');
      login.mockReturnValue(of({ mfa: 'verify' }));
      type('input[formControlName="username"]', 'somchai');
      type('input[formControlName="password"]', '1234');
      await submit();
      expect(login).toHaveBeenCalledWith({
        companyCode: 'DEMO',
        username: 'somchai',
        password: '1234',
        mfa: true,
      });
      expect(assign).not.toHaveBeenCalled();
      expect(el.textContent).toContain('รหัส 6 หลัก');

      verifyMfa.mockReturnValue(throwError(() => new Error('400')));
      type('input[autocomplete="one-time-code"]', '123 456');
      await submit();
      expect(verifyMfa).toHaveBeenCalledWith('123456');
      expect(assign).not.toHaveBeenCalled();

      verifyMfa.mockReturnValue(of({}));
      type('input[autocomplete="one-time-code"]', '654321');
      await submit();
      expect(assign).toHaveBeenCalledWith('/');
    });

    it('goes straight in from /auth/login when the server asks no code', async () => {
      const { el, type, submit } = open();
      expect(el.textContent).toContain('เข้าสู่ระบบด้วย Microsoft Authenticator');
      login.mockReturnValue(of({ user: {}, company: {}, branches: [] }));
      type('input[formControlName="username"]', 'somchai');
      type('input[formControlName="password"]', '1234');
      await submit();
      expect(login.mock.calls[0][0]).not.toHaveProperty('mfa');
      expect(assign).toHaveBeenCalledWith('/');
    });

    it('shows the set-up QR step when the server asks for it', async () => {
      const { el, type, submit } = open();
      login.mockReturnValue(
        of({ mfa: 'setup', setup: { secret: 'ABCDEFGHIJKLMNOP', otpauthUrl: 'otpauth://x' } }),
      );
      type('input[formControlName="username"]', 'somchai');
      type('input[formControlName="password"]', '1234');
      await submit();
      expect(el.textContent).toContain('ตั้งค่า Microsoft Authenticator ให้บัญชี');
      expect(el.textContent).toContain('ABCD EFGH IJKL MNOP');
      expect(el.textContent).toContain('ยืนยันและเข้าสู่ระบบ');
    });
  });
});
