import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import {
  BRANCH_DEFAULTS,
  Branch,
  BranchPayload,
  HEAD_OFFICE_BRANCH_NO,
  branchError,
  normalizeBranch,
} from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { BranchStore } from '../../data/branch.store';

export interface BranchFormData {
  /** Branch being edited (undefined = new) */
  branch?: Branch;
}

/** Add / edit one branch (company admins). Closes with the saved branch. */
@Component({
  selector: 'app-branch-form-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, AutofocusDirective, MATERIAL],
  templateUrl: './branch-form-dialog.html',
  styleUrl: '../payment-method-form-dialog/payment-method-form-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BranchFormDialog {
  protected readonly data = inject<BranchFormData>(MAT_DIALOG_DATA);
  private readonly store = inject(BranchStore);
  private readonly dialogRef = inject<MatDialogRef<BranchFormDialog, Branch>>(MatDialogRef);

  protected readonly saving = signal(false);
  protected readonly editing = !!this.data.branch;
  protected readonly headOffice = HEAD_OFFICE_BRANCH_NO;

  protected readonly form = inject(NonNullableFormBuilder).group({
    code: this.data.branch?.code ?? '',
    name: this.data.branch?.name ?? '',
    branchNo: this.data.branch?.branchNo ?? '',
    address: this.data.branch?.address ?? '',
    phone: this.data.branch?.phone ?? '',
    receiptFooter: this.data.branch?.receiptFooter ?? BRANCH_DEFAULTS.receiptFooter,
    active: this.data.branch?.active ?? true,
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  protected readonly payload = computed<BranchPayload>(() => {
    this.value();
    return normalizeBranch(this.form.getRawValue());
  });

  /** Shared rule (the server checks the same). */
  protected readonly problem = computed(() =>
    branchError({ ...this.payload(), id: this.data.branch?.id }, this.store.branches()),
  );

  protected save(): void {
    if (this.problem()) return;
    this.saving.set(true);
    const request$ = this.data.branch
      ? this.store.update(this.data.branch.id, this.payload())
      : this.store.create(this.payload());
    request$.subscribe({
      next: (saved) => this.dialogRef.close(saved),
      error: () => this.saving.set(false),
    });
  }
}
