import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SALE_DEFAULTS, Sale } from '@core/models';
import { Subject } from 'rxjs';
import { SalesStore } from '../../data/sales.store';
import { VoidDialog, VoidDialogData } from './void-dialog';

describe('VoidDialog', () => {
  const sale: Sale = {
    ...SALE_DEFAULTS,
    id: 7,
    orderNo: 'POS-HQ-1-20261018-0004',
    date: new Date(2026, 9, 18, 23, 2).toISOString(),
    customer: '',
    lines: [],
    subtotal: 179.1,
    total: 179.1,
    itemCount: 1,
    status: 'paid',
  };
  let response: Subject<Sale>;
  const store = { void: vi.fn() };
  const dialogRef = { close: vi.fn() };

  const create = (data: VoidDialogData) => {
    TestBed.configureTestingModule({
      imports: [VoidDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: SalesStore, useValue: store },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    });
    const fixture = TestBed.createComponent(VoidDialog);
    fixture.detectChanges();
    return fixture;
  };

  const type = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    el.value = value;
    el.dispatchEvent(new Event('input'));
  };

  const confirmButton = (host: HTMLElement) =>
    [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('ยืนยันยกเลิกบิล'))!;

  beforeEach(() => {
    response = new Subject<Sale>();
    store.void.mockReset().mockReturnValue(response);
    dialogRef.close.mockReset();
  });

  it('voids with the approval and closes with the voided sale', () => {
    const fixture = create({ sale, needsApproval: true });
    const host: HTMLElement = fixture.nativeElement;
    const [username, password] = host.querySelectorAll('input');
    type(host.querySelector('textarea')!, 'คีย์รายการผิด');
    type(username, 'admin');
    type(password, 'admin');
    fixture.detectChanges();
    confirmButton(host).click();

    expect(store.void).toHaveBeenCalledWith(7, {
      reason: 'คีย์รายการผิด',
      approval: { username: 'admin', password: 'admin' },
    });
    const voided = { ...sale, status: 'cancelled' } as Sale;
    response.next(voided);
    expect(dialogRef.close).toHaveBeenCalledWith(voided);
  });

  it('stays open with what was typed and shows why when the server refuses', () => {
    const fixture = create({ sale, needsApproval: true });
    const host: HTMLElement = fixture.nativeElement;
    const [username, password] = host.querySelectorAll('input');
    type(host.querySelector('textarea')!, 'คีย์รายการผิด');
    type(username, 'john');
    type(password, '1234');
    fixture.detectChanges();
    confirmButton(host).click();
    response.error(
      new HttpErrorResponse({ status: 400, error: { message: 'ผู้อนุมัติต้องเป็นผู้ดูแลระบบ' } }),
    );
    fixture.detectChanges();

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(host.textContent).toContain('ผู้อนุมัติต้องเป็นผู้ดูแลระบบ');
    expect(host.querySelector('textarea')!.value).toBe('คีย์รายการผิด');
    expect(username.value).toBe('john');
    expect(confirmButton(host).disabled).toBe(false);

    type(username, 'admin');
    fixture.detectChanges();
    expect(host.textContent).not.toContain('ผู้อนุมัติต้องเป็นผู้ดูแลระบบ');
  });
});
