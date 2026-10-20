import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signInForTest } from '../auth/auth.testing';
import { TerminalService } from '../services/terminal.service';
import { terminalInterceptor } from './terminal.interceptor';

describe('terminalInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([terminalInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    // Logged in to company 1
    signInForTest({ user: { id: 1 }, company: { id: 1, code: 'DEMO', name: 'DEMO' } });
  });

  it('sends no terminal until the device is set, then the stored number', () => {
    http.get('/api/sales').subscribe();
    expect(backend.expectOne('/api/sales').request.headers.has('X-Terminal-Id')).toBe(false);

    const terminal = TestBed.inject(TerminalService);
    terminal.set(3);
    terminal.set(0); // ignored
    http.get('/api/sales').subscribe();
    expect(backend.expectOne('/api/sales').request.headers.get('X-Terminal-Id')).toBe('3');
    expect(localStorage.getItem('an22.pos.terminal.1')).toBe('3');

    terminal.clear();
    http.get('/api/sales').subscribe();
    expect(backend.expectOne('/api/sales').request.headers.has('X-Terminal-Id')).toBe(false);
    expect(localStorage.getItem('an22.pos.terminal.1')).toBeNull();
    backend.verify();
  });

  it('never sends the terminal to the platform API', () => {
    TestBed.inject(TerminalService).set(3);
    http.get('/api/platform/companies').subscribe();
    const req = backend.expectOne('/api/platform/companies');
    expect(req.request.headers.has('X-Terminal-Id')).toBe(false);
    backend.verify();
  });
});
