import { ChangeDetectionStrategy, Component, Injector, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { filter, switchMap } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { PosTerminal, missingPosId } from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { TerminalService } from '@core/services/terminal.service';
import { openConfirm } from '@shared/components/confirm-dialog/confirm-dialog';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { StatCard } from '@shared/components/stat-card/stat-card';
import { MATERIAL } from '@shared/material';
import { httpErrorShown } from '@core/http/http-error-shown';
import { PosTerminalStore } from '../../data/pos-terminal.store';
import {
  PosTerminalFormData,
  PosTerminalFormDialog,
} from '../../dialogs/pos-terminal-form-dialog/pos-terminal-form-dialog';

/**
 * POS terminal registry (master-data tab, docs/terminal-plan.md): number + name + Revenue Dept POS
 * ID per cash drawer. Admins edit; a device is set to its terminal in Settings → "เครื่องนี้".
 */
@Component({
  selector: 'app-pos-terminal-list',
  imports: [MatTableModule, StatCard, EmptyState, LoadingSpinner, MATERIAL],
  templateUrl: './pos-terminal-list.html',
  styleUrl: '../payment-method-list/payment-method-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PosTerminalList {
  protected readonly store = inject(PosTerminalStore);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);
  private readonly notify = inject(NotificationService);
  private readonly auth = inject(AuthService);
  /** The terminal this device is set to (null = none) */
  protected readonly thisTerminal = inject(TerminalService).terminalId;

  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly columns = ['id', 'branch', 'name', 'posId', 'status', 'actions'];

  constructor() {
    this.store.load();
  }

  protected branchCode(t: PosTerminal): string {
    return this.store.branches().find((b) => b.id === t.branchId)?.code ?? `#${t.branchId}`;
  }

  /** Admins edit terminals of the branches they work in (a company admin: all, E6). */
  protected canEdit(t: PosTerminal): boolean {
    return (
      this.isAdmin() &&
      (this.auth.isCompanyAdmin() || this.auth.branches().some((b) => b.id === t.branchId))
    );
  }

  protected posIdMissing(t: PosTerminal): boolean {
    return missingPosId(t, this.store.vatRegistered());
  }

  protected openForm(terminal?: PosTerminal): void {
    this.dialog
      .open<PosTerminalFormDialog, PosTerminalFormData, PosTerminal>(PosTerminalFormDialog, {
        data: { terminal },
        width: '520px',
        maxWidth: '95vw',
        // Route-scoped PosTerminalStore lives in this injector.
        injector: this.injector,
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) this.notify.success(`บันทึกเครื่อง ${saved.id} แล้ว`);
      });
  }

  protected remove(t: PosTerminal): void {
    openConfirm(this.dialog, {
      title: 'ลบเครื่อง POS',
      message: `ต้องการลบเครื่อง ${t.id} - ${t.name} ใช่หรือไม่? (เครื่องที่มีกะหรือบิลแล้วลบไม่ได้ ให้ปิดใช้งานแทน)`,
      confirmText: 'ลบ',
    })
      .pipe(
        filter(Boolean),
        switchMap(() => this.store.remove(t.id)),
      )
      .subscribe({
        next: () => this.notify.success(`ลบเครื่อง ${t.id} แล้ว`),
        error: httpErrorShown,
      });
  }
}
