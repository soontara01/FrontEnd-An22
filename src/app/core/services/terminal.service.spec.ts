import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signInForTest } from '../auth/auth.testing';
import { TerminalService } from './terminal.service';

describe('TerminalService', () => {
  function create(companyId: number | null): TerminalService {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    if (companyId !== null) {
      signInForTest({ user: { id: 1 }, company: { id: companyId, code: `C${companyId}` } });
    }
    return TestBed.inject(TerminalService);
  }

  beforeEach(() => localStorage.clear());

  it('keeps the terminal per company (E42)', () => {
    localStorage.setItem('an22.pos.terminal.2', '7');
    const terminal = create(1);
    expect(terminal.terminalId()).toBeNull();
    terminal.set(3);
    expect(terminal.terminalId()).toBe(3);
    expect(localStorage.getItem('an22.pos.terminal.1')).toBe('3');
    expect(localStorage.getItem('an22.pos.terminal.2')).toBe('7');
  });

  it('moves the device-wide terminal of before E42 into the first company read, once', () => {
    localStorage.setItem('an22.pos.terminal', '4');
    const terminal = create(1);
    expect(terminal.terminalId()).toBe(4);
    expect(localStorage.getItem('an22.pos.terminal')).toBeNull();
    expect(localStorage.getItem('an22.pos.terminal.1')).toBe('4');
  });

  it("does not overwrite a company's own terminal with the old value", () => {
    localStorage.setItem('an22.pos.terminal', '4');
    localStorage.setItem('an22.pos.terminal.1', '2');
    expect(create(1).terminalId()).toBe(2);
    expect(localStorage.getItem('an22.pos.terminal')).toBeNull();
  });

  it('has no terminal and stores nothing while logged out', () => {
    localStorage.setItem('an22.pos.terminal', '4');
    const terminal = create(null);
    expect(terminal.terminalId()).toBeNull();
    terminal.set(3);
    expect(terminal.terminalId()).toBeNull();
    expect(localStorage.getItem('an22.pos.terminal')).toBe('4'); // waits for a company
  });
});
