import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import {
  CASH_ROUNDING_LABEL,
  CashRounding,
  PAYMENT_FEE_MAX,
  PAYMENT_METHOD_DEFAULTS,
  PAYMENT_NAME_MAX,
  PAYMENT_TYPE_ICON,
  PAYMENT_TYPE_LABEL,
  PaymentMethod,
  PaymentMethodPayload,
  PaymentType,
  netReceived,
  paymentMethodError,
  roundCash,
  withPaymentTypeRules,
} from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { PaymentMethodStore } from '../../data/payment-method.store';

export interface PaymentMethodFormData {
  /** Method being edited (undefined = new) */
  method?: PaymentMethod;
}

/** Sample amounts for the live hints (fee / cash rounding). */
const SAMPLE_AMOUNT = 1000;
const SAMPLE_CASH = 1234.6;

/** '3, 6,10' → [3, 6, 10] (invalid parts become NaN so the shared rule reports them). */
const parseMonths = (text: string): number[] =>
  text
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);

/** Add / edit one payment method. Closes with the saved PaymentMethod. */
@Component({
  selector: 'app-payment-method-form-dialog',
  imports: [DecimalPipe, ReactiveFormsModule, MatDialogModule, AutofocusDirective, MATERIAL],
  templateUrl: './payment-method-form-dialog.html',
  styleUrl: './payment-method-form-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentMethodFormDialog {
  protected readonly data = inject<PaymentMethodFormData>(MAT_DIALOG_DATA);
  private readonly store = inject(PaymentMethodStore);
  private readonly dialogRef =
    inject<MatDialogRef<PaymentMethodFormDialog, PaymentMethod>>(MatDialogRef);

  protected readonly saving = signal(false);
  protected readonly types = Object.keys(PAYMENT_TYPE_LABEL) as PaymentType[];
  protected readonly typeLabel = PAYMENT_TYPE_LABEL;
  protected readonly typeIcon = PAYMENT_TYPE_ICON;
  protected readonly roundings = Object.keys(CASH_ROUNDING_LABEL) as CashRounding[];
  protected readonly roundingLabel = CASH_ROUNDING_LABEL;
  protected readonly nameMax = PAYMENT_NAME_MAX;
  protected readonly feeMax = PAYMENT_FEE_MAX;
  protected readonly sampleAmount = SAMPLE_AMOUNT;
  protected readonly sampleCash = SAMPLE_CASH;

  /** The only active cash method must stay an active cash method. */
  protected readonly lockedCash =
    !!this.data.method && this.store.isLastActiveCash(this.data.method.id);

  private readonly initial: PaymentMethod = {
    ...PAYMENT_METHOD_DEFAULTS,
    id: 0,
    code: '',
    name: '',
    type: 'card',
    ...this.data.method,
  };

  protected readonly form = inject(NonNullableFormBuilder).group({
    code: [
      this.initial.code,
      [Validators.required, Validators.pattern(/^[A-Z0-9-]+$/), Validators.maxLength(20)],
    ],
    name: [this.initial.name, [Validators.required, Validators.maxLength(PAYMENT_NAME_MAX)]],
    type: [{ value: this.initial.type, disabled: this.lockedCash }],
    active: [{ value: this.initial.active, disabled: this.lockedCash }],
    minAmount: [this.initial.minAmount, [Validators.required, Validators.min(0)]],
    maxAmount: [this.initial.maxAmount, Validators.min(0)],
    feePercent: [
      this.initial.feePercent,
      [Validators.required, Validators.min(0), Validators.max(PAYMENT_FEE_MAX)],
    ],
    requireReference: [this.initial.requireReference],
    referenceLabel: [this.initial.referenceLabel || 'เลขอ้างอิง'],
    cashRounding: [this.initial.cashRounding],
    promptPayId: [this.initial.promptPayId],
    bankAccount: [this.initial.bankAccount],
    installmentMonths: [this.initial.installmentMonths.join(', ')],
    note: [this.initial.note],
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  /** What would be saved right now (type-specific fields already cleared). */
  protected readonly payload = computed(() => {
    this.value();
    return this.toPayload();
  });
  protected readonly type = computed(() => this.payload().type);

  /** Shared rule (the server checks the same). */
  protected readonly problem = computed(() =>
    paymentMethodError(this.payload(), this.store.methods(), this.data.method?.id),
  );

  protected readonly sampleNet = computed(() => netReceived(SAMPLE_AMOUNT, this.payload()));
  protected readonly sampleRounded = computed(() =>
    roundCash(SAMPLE_CASH, this.payload().cashRounding),
  );

  protected toUpper(): void {
    const control = this.form.controls.code;
    const upper = control.value.toUpperCase();
    if (upper !== control.value) control.setValue(upper);
  }

  protected save(): void {
    if (this.form.invalid || this.problem()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const payload = this.payload();
    const request$ = this.data.method
      ? this.store.update(this.data.method.id, payload)
      : this.store.create(payload);
    request$.subscribe({
      next: (saved) => this.dialogRef.close(saved),
      error: () => this.saving.set(false),
    });
  }

  private toPayload(): PaymentMethodPayload {
    const raw = this.form.getRawValue();
    return withPaymentTypeRules({
      ...raw,
      code: raw.code.trim().toUpperCase(),
      name: raw.name.trim(),
      sortOrder: this.initial.sortOrder,
      minAmount: Number(raw.minAmount) || 0,
      maxAmount: raw.maxAmount ? Number(raw.maxAmount) : null,
      feePercent: Number(raw.feePercent) || 0,
      installmentMonths: parseMonths(raw.installmentMonths),
      note: raw.note.trim(),
    });
  }
}
