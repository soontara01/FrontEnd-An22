import { ChangeDetectionStrategy, Component, Injector, inject, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { filter, switchMap } from 'rxjs';
import {
  CASH_ROUNDING_LABEL,
  PAYMENT_TYPE_ICON,
  PAYMENT_TYPE_LABEL,
  PaymentMethod,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { openConfirm } from '@shared/components/confirm-dialog/confirm-dialog';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { StatCard } from '@shared/components/stat-card/stat-card';
import { MATERIAL } from '@shared/material';
import { PaymentMethodStore } from '../../data/payment-method.store';
import {
  PaymentMethodFormData,
  PaymentMethodFormDialog,
} from '../../dialogs/payment-method-form-dialog/payment-method-form-dialog';

/** Payment methods = POS tender buttons, in button order (master-data tab). */
@Component({
  selector: 'app-payment-method-list',
  imports: [
    CurrencyPipe,
    DecimalPipe,
    MatTableModule,
    StatCard,
    EmptyState,
    LoadingSpinner,
    MATERIAL,
  ],
  templateUrl: './payment-method-list.html',
  styleUrl: './payment-method-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PaymentMethodList {
  protected readonly store = inject(PaymentMethodStore);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);
  private readonly notify = inject(NotificationService);

  protected readonly columns = [
    'order',
    'name',
    'type',
    'limits',
    'fee',
    'details',
    'status',
    'actions',
  ];
  protected readonly typeIcon = PAYMENT_TYPE_ICON;
  /** Row being moved (disables the order buttons meanwhile). */
  protected readonly moving = signal(false);

  constructor() {
    this.store.load();
  }

  protected typeText(m: PaymentMethod): string {
    return PAYMENT_TYPE_LABEL[m.type];
  }

  protected icon(m: PaymentMethod): string {
    return PAYMENT_TYPE_ICON[m.type];
  }

  /** Type-specific settings in one line, e.g. 'ปัดเป็น 25 สตางค์' / 'ผ่อน 3, 6, 10 เดือน'. */
  protected details(m: PaymentMethod): string {
    const parts: string[] = [];
    if (m.type === 'cash') parts.push(CASH_ROUNDING_LABEL[m.cashRounding], 'ทอนเงินได้');
    if (m.type === 'qr') parts.push(`PromptPay ${m.promptPayId}`);
    if (m.type === 'installment') parts.push(`ผ่อน ${m.installmentMonths.join(', ')} เดือน`);
    if (m.requireReference) parts.push(`ต้องกรอก${m.referenceLabel}`);
    if (m.bankAccount) parts.push(`เข้าบัญชี ${m.bankAccount}`);
    return parts.join(' · ');
  }

  /** Why the method cannot be deleted ('' = it can). */
  protected deleteBlocker(m: PaymentMethod): string {
    return this.store.isLastActiveCash(m.id) ? 'ต้องมีเงินสดที่เปิดใช้งานอย่างน้อย 1 ช่องทาง' : '';
  }

  protected move(m: PaymentMethod, direction: -1 | 1): void {
    this.moving.set(true);
    this.store.move(m.id, direction).subscribe({
      complete: () => this.moving.set(false),
      error: () => this.moving.set(false),
    });
  }

  protected openForm(method?: PaymentMethod): void {
    this.dialog
      .open<PaymentMethodFormDialog, PaymentMethodFormData, PaymentMethod>(
        PaymentMethodFormDialog,
        {
          data: { method },
          width: '560px',
          maxWidth: '95vw',
          // Route-scoped PaymentMethodStore lives in this injector.
          injector: this.injector,
          autoFocus: false,
        },
      )
      .afterClosed()
      .subscribe((saved) => {
        if (saved)
          this.notify.success(method ? `บันทึก ${saved.name} แล้ว` : `เพิ่ม ${saved.name} แล้ว`);
      });
  }

  protected remove(m: PaymentMethod): void {
    openConfirm(this.dialog, {
      title: 'ลบช่องทางชำระเงิน',
      message: `ต้องการลบ ${m.code} - ${m.name} ใช่หรือไม่?`,
      confirmText: 'ลบ',
    })
      .pipe(
        filter(Boolean),
        switchMap(() => this.store.remove(m.id)),
      )
      .subscribe(() => this.notify.success(`ลบ ${m.name} แล้ว`));
  }
}
