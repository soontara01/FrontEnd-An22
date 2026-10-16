import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
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
    localStorage.setItem('an22.token', JSON.stringify('mock-jwt-token.t1.u1'));
    localStorage.setItem('an22.company', JSON.stringify({ id: 1, code: 'DEMO', name: 'ร้าน' }));
    localStorage.setItem('an22.user', JSON.stringify({ id: 1, name: 'Admin', role: 'admin' }));
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
    expect(localStorage.getItem('an22.token')).not.toBeNull();
  });

  it('logs out on 401 from any endpoint but login', async () => {
    expect(await fail('GET', '/api/products', 401, 'เซสชันหมดอายุ')).toBe(401);
    expect(notify.error).toHaveBeenCalledWith('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    expect(assign).toHaveBeenCalledWith('/auth/login');
    expect(localStorage.getItem('an22.token')).toBeNull();
    expect(localStorage.getItem('an22.user')).toBeNull();
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
    expect(localStorage.getItem('an22.token')).not.toBeNull();
  });
});
