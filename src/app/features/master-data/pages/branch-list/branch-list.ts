import { ChangeDetectionStrategy, Component, Injector, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { AuthService } from '@core/auth/auth.service';
import { Branch, isHeadOffice } from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { AdminOnlyNote } from '@shared/components/admin-only-note/admin-only-note';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { StatCard } from '@shared/components/stat-card/stat-card';
import { MATERIAL } from '@shared/material';
import { BranchStore } from '../../data/branch.store';
import {
  BranchFormData,
  BranchFormDialog,
} from '../../dialogs/branch-form-dialog/branch-form-dialog';

/**
 * Branches of the company (master-data tab, SaaS step 2): code, Revenue Dept branch number and the
 * details printed on its documents. Company admins edit (E6); a branch is deactivated, never deleted.
 */
@Component({
  selector: 'app-branch-list',
  imports: [MatTableModule, StatCard, EmptyState, LoadingSpinner, AdminOnlyNote, MATERIAL],
  templateUrl: './branch-list.html',
  styleUrl: '../payment-method-list/payment-method-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class BranchList {
  protected readonly store = inject(BranchStore);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);
  private readonly notify = inject(NotificationService);
  protected readonly auth = inject(AuthService);

  protected readonly columns = ['code', 'branchNo', 'name', 'address', 'status', 'actions'];

  constructor() {
    this.store.load();
  }

  protected branchNoText(b: Branch): string {
    return isHeadOffice(b) ? `${b.branchNo} (สำนักงานใหญ่)` : b.branchNo;
  }

  protected openForm(branch?: Branch): void {
    this.dialog
      .open<BranchFormDialog, BranchFormData, Branch>(BranchFormDialog, {
        data: { branch },
        width: '560px',
        maxWidth: '95vw',
        // Route-scoped BranchStore lives in this injector.
        injector: this.injector,
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) this.notify.success(`บันทึกสาขา ${saved.code} แล้ว`);
      });
  }
}
