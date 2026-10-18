import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AuthService } from '@core/auth/auth.service';
import { PosTerminal, normalizePosTerminal, posTerminalError } from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { PosTerminalStore } from '../../data/pos-terminal.store';

export interface PosTerminalFormData {
  /** Terminal being edited (undefined = new) */
  terminal?: PosTerminal;
}

/** Add / edit one POS terminal. The number is fixed once created. Closes with the saved terminal. */
@Component({
  selector: 'app-pos-terminal-form-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, AutofocusDirective, MATERIAL],
  templateUrl: './pos-terminal-form-dialog.html',
  styleUrl: '../payment-method-form-dialog/payment-method-form-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PosTerminalFormDialog {
  protected readonly data = inject<PosTerminalFormData>(MAT_DIALOG_DATA);
  protected readonly store = inject(PosTerminalStore);
  private readonly dialogRef =
    inject<MatDialogRef<PosTerminalFormDialog, PosTerminal>>(MatDialogRef);

  private readonly auth = inject(AuthService);
  /** Branches this admin may put a terminal in (a company admin: every active branch, E6). */
  protected readonly branches = this.auth.branches;
  protected readonly saving = signal(false);
  protected readonly editing = !!this.data.terminal;

  protected readonly form = inject(NonNullableFormBuilder).group({
    id: [{ value: this.data.terminal?.id ?? this.store.nextId(), disabled: this.editing }],
    name: [this.data.terminal?.name ?? ''],
    posId: [this.data.terminal?.posId ?? ''],
    branchId: [this.data.terminal?.branchId ?? this.auth.currentBranch()?.id ?? 0],
    active: [this.data.terminal?.active ?? true],
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  protected readonly terminal = computed<PosTerminal>(() => {
    this.value();
    const raw = this.form.getRawValue();
    return normalizePosTerminal({ ...raw, id: Number(raw.id) });
  });

  /** Shared rule (the server checks the same). */
  protected readonly problem = computed(() =>
    posTerminalError(
      this.terminal(),
      this.store.terminals().filter((t) => t.id !== this.data.terminal?.id),
      this.store.branches(),
    ),
  );
  protected readonly posIdMissing = computed(
    () => this.store.vatRegistered() && this.terminal().active && !this.terminal().posId,
  );

  protected save(): void {
    if (this.problem()) return;
    this.saving.set(true);
    const request$ = this.editing
      ? this.store.update(this.terminal())
      : this.store.create(this.terminal());
    request$.subscribe({
      next: (saved) => this.dialogRef.close(saved),
      error: () => this.saving.set(false),
    });
  }
}
