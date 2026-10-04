import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { LoginResponse, PaymentMethod } from '../models';
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
    const login = await firstValueFrom(
      http.post<LoginResponse>('/api/auth/login', { username: 'admin', password: 'admin' }),
    );
    expect(login.token).toBe('mock-jwt-token');
    // Second request reuses the loaded module (and its injected services).
    const methods = await firstValueFrom(http.get<PaymentMethod[]>('/api/payment-methods'));
    expect(methods[0].type).toBe('cash');
  });
});
