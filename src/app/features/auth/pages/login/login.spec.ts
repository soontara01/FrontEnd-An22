import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
});
