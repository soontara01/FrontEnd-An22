import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { Router, RouterLink } from '@angular/router';
import {
  BranchType,
  SUPPLIER_DEFAULTS,
  SupplierPayload,
  creditLabel,
  isValidThaiTaxId,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { SupplierStore } from '../../data/supplier.store';

const taxIdValidator: ValidatorFn = (control: AbstractControl<string>): ValidationErrors | null =>
  !control.value || isValidThaiTaxId(control.value) ? null : { taxId: true };

/** Create (`suppliers/new`) and edit (`suppliers/:id/edit`) a supplier. */
@Component({
  selector: 'app-supplier-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonToggleModule,
    LoadingSpinner,
    AutofocusDirective,
    MATERIAL,
  ],
  templateUrl: './supplier-form.html',
  styleUrl: './supplier-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SupplierForm implements OnInit {
  private readonly store = inject(SupplierStore);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);

  /** Bound from the `:id` route param. */
  readonly id = input<string>();
  protected readonly isEdit = computed(() => !!this.id());
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly productCount = signal(0);

  /** Common payment terms (days). */
  protected readonly creditPresets = [0, 7, 15, 30, 45, 60, 90];
  protected readonly credit = creditLabel;

  protected readonly form = inject(NonNullableFormBuilder).group({
    code: [
      '',
      [
        Validators.required,
        Validators.pattern(/^[A-Z0-9-]+$/),
        Validators.maxLength(20),
        this.uniqueCode(),
      ],
    ],
    name: ['', [Validators.required, Validators.maxLength(150)]],
    taxId: ['', [Validators.required, Validators.pattern(/^\d{13}$/), taxIdValidator]],
    branchType: ['head' as BranchType],
    branchNo: ['', Validators.pattern(/^\d{5}$/)],
    address: [''],
    contactName: [''],
    phone: [''],
    email: ['', Validators.email],
    creditDays: [30, [Validators.required, Validators.min(0), Validators.max(365)]],
    bankName: [''],
    bankAccountNo: [''],
    bankAccountName: [''],
    note: [''],
    active: [true],
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });
  protected readonly isBranch = computed(() => this.value().branchType === 'branch');

  ngOnInit(): void {
    this.store.load(); // for the duplicate-code check

    const id = Number(this.id());
    if (!id) return;
    this.loading.set(true);
    this.store.getById(id).subscribe({
      next: (supplier) => {
        this.form.patchValue(supplier);
        this.productCount.set(supplier.productCount);
        this.loading.set(false);
      },
      error: () => void this.router.navigate(['/master-data/suppliers']),
    });
  }

  protected toUpperCode(): void {
    const control = this.form.controls.code;
    const upper = control.value.toUpperCase();
    if (upper !== control.value) control.setValue(upper);
  }

  /** Keep only digits while typing a tax ID / branch number. */
  protected digitsOnly(controlName: 'taxId' | 'branchNo'): void {
    const control = this.form.controls[controlName];
    const digits = control.value.replace(/\D/g, '');
    if (digits !== control.value) control.setValue(digits);
  }

  protected save(): void {
    const raw = this.form.getRawValue();
    if (raw.branchType === 'branch' && !/^\d{5}$/.test(raw.branchNo)) {
      this.form.controls.branchNo.setErrors({ required: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const payload: SupplierPayload = {
      ...SUPPLIER_DEFAULTS,
      ...raw,
      name: raw.name.trim(),
      branchNo: raw.branchType === 'branch' ? raw.branchNo : '',
    };
    this.saving.set(true);
    const request$ = this.isEdit()
      ? this.store.update(Number(this.id()), payload)
      : this.store.create(payload);
    request$.subscribe({
      next: (s) => {
        this.notify.success(this.isEdit() ? `บันทึก ${s.name} แล้ว` : `เพิ่ม ${s.name} แล้ว`);
        void this.router.navigate(['/master-data/suppliers']);
      },
      error: () => this.saving.set(false),
    });
  }

  private uniqueCode(): ValidatorFn {
    return (control: AbstractControl<string>): ValidationErrors | null =>
      control.value && this.store.isDuplicateCode(control.value, Number(this.id()) || undefined)
        ? { duplicate: true }
        : null;
  }
}
