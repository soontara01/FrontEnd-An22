import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { branchInterceptor } from './branch.interceptor';

describe('branchInterceptor', () => {
  const setup = () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([branchInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    return { http: TestBed.inject(HttpClient), backend: TestBed.inject(HttpTestingController) };
  };
  const save = (key: string, value: unknown) =>
    localStorage.setItem(`an22.${key}`, JSON.stringify(value));

  beforeEach(() => localStorage.clear());

  it('sends no branch when logged out', () => {
    const { http, backend } = setup();
    http.get('/api/sales').subscribe();
    expect(backend.expectOne('/api/sales').request.headers.has('X-Branch-Id')).toBe(false);
    backend.verify();
  });

  it('sends the current branch of the session', () => {
    save('token', 'mock-jwt-token.t1.u1');
    save('company', { id: 1, code: 'DEMO', name: 'ร้าน', taxId: '', active: true });
    save('branches', [
      { id: 7, code: 'HQ', name: 'สำนักงานใหญ่', branchNo: '00000', active: true },
    ]);
    const { http, backend } = setup();
    http.get('/api/sales').subscribe();
    expect(backend.expectOne('/api/sales').request.headers.get('X-Branch-Id')).toBe('7');
    backend.verify();
  });
});
