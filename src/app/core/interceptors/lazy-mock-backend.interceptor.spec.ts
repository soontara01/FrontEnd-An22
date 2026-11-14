import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { LoginResponse, MfaChallenge, PaymentMethod, totpCode, totpStep } from '../models';
import { lazyMockBackendInterceptor } from './lazy-mock-backend.interceptor';

describe('lazyMockBackendInterceptor', () => {
  let http: HttpClient;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([lazyMockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  it('loads the mock on demand and answers like the real interceptor', async () => {
    const challenge = await firstValueFrom(
      http.post<MfaChallenge & { demoSecret: string }>('/api/auth/login', {
        companyCode: 'DEMO',
        username: 'admin',
        password: 'admin',
      }),
    );
    expect(challenge.mfa).toBe('setup'); // every login asks the Authenticator code (E57)
    const login = await firstValueFrom(
      http.post<LoginResponse>('/api/auth/mfa/verify', {
        code: totpCode(challenge.demoSecret, totpStep(Date.now())),
      }),
    );
    expect(login.company.code).toBe('DEMO');
    expect('token' in login).toBe(false); // the mock's web part keeps it (E48)
    // Second request reuses the loaded module (and its injected services) — and the session.
    const methods = await firstValueFrom(http.get<PaymentMethod[]>('/api/payment-methods'));
    expect(methods[0].type).toBe('cash');
  });
});
