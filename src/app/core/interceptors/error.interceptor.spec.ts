import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { silentUnauthorized } from '../http/silent-unauthorized';
import { NotificationService } from '../services/notification.service';
import { errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  const assign = vi.fn();
  const notify = { error: vi.fn() };

  beforeEach(() => {
    localStorage.clear();
    assign.mockClear();
    notify.error.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: DOCUMENT, useValue: { location: { assign } } },
        { provide: NotificationService, useValue: notify },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  /** Sends a request answered with `status`; resolves with the status the caller sees. */
  const fail = (method: string, url: string, status: number, message?: string) => {
    const result = firstValueFrom(http.request(method, url)).then(
      () => 200,
      (e: { status: number }) => e.status,
    );
    backend.expectOne(url).flush(message ? { message } : null, { status, statusText: 'Error' });
    return result;
  };
  const loggedOut = () => assign.mock.calls.length > 0;

  it('shows the server message and passes 4xx / 5xx on without logging out', async () => {
    expect(await fail('GET', '/api/products', 500, 'ระบบขัดข้อง')).toBe(500);
    expect(notify.error).toHaveBeenLastCalledWith('ระบบขัดข้อง');
    expect(await fail('POST', '/api/sales', 400, 'ยอดไม่ตรง')).toBe(400);
    expect(notify.error).toHaveBeenLastCalledWith('ยอดไม่ตรง');
    expect(await fail('PUT', '/api/settings/store', 403, 'เฉพาะผู้ดูแลระบบ')).toBe(403);
    expect(notify.error).toHaveBeenCalledTimes(3);
    expect(loggedOut()).toBe(false);
  });

  it('logs out on 401 from any endpoint but login', async () => {
    expect(await fail('GET', '/api/products', 401, 'เซสชันหมดอายุ')).toBe(401);
    // AuthService.logout(): the web server's session first (E48), then the login page, which
    // says why — a snackbar would not survive the reload (C3-6)
    backend.expectOne('/api/auth/logout').flush(null);
    expect(assign).toHaveBeenCalledWith('/auth/login?expired=1');
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('stays quiet on a 401 marked silent (GET /me when a page opens, logout — E48)', async () => {
    const result = firstValueFrom(http.get('/api/me', { context: silentUnauthorized() })).then(
      () => 200,
      (e: { status: number }) => e.status,
    );
    backend.expectOne('/api/me').flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(await result).toBe(401);
    expect(notify.error).not.toHaveBeenCalled();
    expect(loggedOut()).toBe(false);
  });

  it('does not log out on a refused login (401)', async () => {
    expect(
      await fail('POST', '/api/auth/login', 401, 'รหัสบริษัท ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง'),
    ).toBe(401);
    expect(notify.error).toHaveBeenCalledWith('รหัสบริษัท ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง');
    expect(loggedOut()).toBe(false);
  });

  it('does not log out on a wrong auth/verify (400, POS unlock / approval)', async () => {
    expect(await fail('POST', '/api/auth/verify', 400, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')).toBe(
      400,
    );
    expect(loggedOut()).toBe(false);
  });

  it('ends only the platform admin session on a 401 of the platform API (E36)', async () => {
    expect(await fail('GET', '/api/platform/companies', 401, 'หมดอายุ')).toBe(401);
    expect(assign).toHaveBeenCalledWith('/platform/login?expired=1');
    // the shop session is not logged out (no POST /api/auth/logout — verify() checks)
  });
});
