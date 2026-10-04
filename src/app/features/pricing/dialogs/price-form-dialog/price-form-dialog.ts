import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import {
  Product,
  SkuPrice,
  SkuPricePayload,
  addDaysIso,
  findOverlap,
  formatDateRange,
  effectiveCost,
  marginPercent,
  fromIsoDate,
  toIsoDate,
  todayIso,
  vatBreakdown,
} from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { PricingStore } from '../../data/pricing.store';

export interface PriceFormData {
  product: Product;
  /** Period being edited; undefined = new period */
  price?: SkuPrice;
  /** All periods of this SKU (for the overlap check) */
  others: SkuPrice[];
}

/** End date (when set) must not be before the start date. */
function endNotBeforeStart(group: AbstractControl): ValidationErrors | null {
  const { startDate, endDate } = group.value as { startDate: Date | null; endDate: Date | null };
  return startDate && endDate && endDate < startDate ? { endBeforeStart: true } : null;
}

/** Add / edit one price period. Closes with the saved SkuPrice. */
@Component({
  selector: 'app-price-form-dialog',
  imports: [
    CurrencyPipe,
    DecimalPipe,
    ReactiveFormsModule,
    MatDialogModule,
    MatDatepickerModule,
    AutofocusDirective,
    MATERIAL,
  ],
  templateUrl: './price-form-dialog.html',
  styleUrl: './price-form-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceFormDialog {
  protected readonly data = inject<PriceFormData>(MAT_DIALOG_DATA);
  private readonly store = inject(PricingStore);
  private readonly dialogRef = inject<MatDialogRef<PriceFormDialog, SkuPrice>>(MatDialogRef);

  protected readonly isEdit = !!this.data.price;
  protected readonly saving = signal(false);

  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group(
    {
      price: [this.data.price?.price ?? 0, [Validators.required, Validators.min(0)]],
      startDate: this.fb.control<Date | null>(
        fromIsoDate(this.data.price?.startDate ?? this.suggestedStart()),
        Validators.required,
      ),
      endDate: this.fb.control<Date | null>(
        this.data.price?.endDate ? fromIsoDate(this.data.price.endDate) : null,
      ),
      note: [this.data.price?.note ?? ''],
    },
    { validators: endNotBeforeStart },
  );

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  /** Actual cost (avg / serial) while in stock, else the standard cost. */
  protected readonly cost = effectiveCost(this.data.product);
  protected readonly isVat = this.data.product.vatType === 'vat7';

  /** Net-of-VAT split of the VAT-inclusive price being typed. */
  protected readonly breakdown = computed(() =>
    vatBreakdown(this.value().price ?? 0, this.data.product.vatType),
  );

  protected readonly margin = computed(() =>
    marginPercent(this.value().price, this.cost, this.data.product.vatType),
  );

  /** Live check against this SKU's other periods (the server checks again). */
  protected readonly overlap = computed(() => {
    const { startDate, endDate } = this.value();
    if (!startDate) return undefined;
    return findOverlap(
      this.data.others,
      {
        productId: this.data.product.id,
        startDate: toIsoDate(startDate),
        endDate: endDate ? toIsoDate(endDate) : null,
      },
      this.data.price?.id,
    );
  });

  protected readonly overlapText = computed(() => {
    const o = this.overlap();
    return o ? `฿${o.price.toLocaleString('en-US')} (${formatDateRange(o)})` : '';
  });

  protected save(): void {
    if (this.form.invalid || this.overlap()) {
      this.form.markAllAsTouched();
      return;
    }
    const { price, startDate, endDate, note } = this.form.getRawValue();
    const payload: SkuPricePayload = {
      productId: this.data.product.id,
      price,
      startDate: toIsoDate(startDate as Date),
      endDate: endDate ? toIsoDate(endDate) : null,
      note: note.trim(),
    };

    this.saving.set(true);
    const request$ = this.data.price
      ? this.store.update(this.data.price.id, payload)
      : this.store.create(payload);
    request$.subscribe({
      next: (saved) => this.dialogRef.close(saved),
      error: () => this.saving.set(false),
    });
  }

  /** New period: the day after the latest ended period, else today. */
  private suggestedStart(): string {
    const ends = this.data.others
      .map((p) => p.endDate)
      .filter((d): d is string => !!d)
      .sort();
    const latestEnd = ends.at(-1);
    const today = todayIso();
    return latestEnd && latestEnd >= today ? addDaysIso(latestEnd, 1) : today;
  }
}
