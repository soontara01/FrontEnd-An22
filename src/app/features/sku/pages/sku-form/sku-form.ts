import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { Router, RouterLink } from '@angular/router';
import {
  ITEM_TYPE_HINT,
  ITEM_TYPE_LABEL,
  ItemType,
  PackUnit,
  SkuSupplier,
  ProductPayload,
  SHORT_NAME_MAX,
  SKU_STATUS_HINT,
  SKU_STATUS_LABEL,
  SkuStatus,
  VAT_TYPE_LABEL,
  VatType,
  withServiceRules,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { resizeImage } from '@shared/utils/image-resize';
import { SkuStore } from '../../data/sku.store';

const SKU_PATTERN = /^[A-Z0-9-]+$/;
const BARCODE_PATTERN = /^\d{0,14}$/;

type PackGroup = FormGroup<{
  unit: FormControl<string>;
  factor: FormControl<number>;
  barcode: FormControl<string>;
}>;

type SupplierGroup = FormGroup<{
  supplierId: FormControl<number | null>;
  supplierSku: FormControl<string>;
  cost: FormControl<number>;
  leadTimeDays: FormControl<number>;
  moq: FormControl<number>;
  isMain: FormControl<boolean>;
}>;

/** Create (`/sku/new`) and edit (`/sku/:id/edit`) form for the SKU master. */
@Component({
  selector: 'app-sku-form',
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    RouterLink,
    MatAutocompleteModule,
    PageHeader,
    LoadingSpinner,
    AutofocusDirective,
    MATERIAL,
  ],
  templateUrl: './sku-form.html',
  styleUrl: './sku-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SkuForm implements OnInit {
  protected readonly store = inject(SkuStore);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  /** Bound from the `:id` route param (withComponentInputBinding). */
  readonly id = input<string>();
  protected readonly isEdit = computed(() => !!this.id());

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly imageError = signal('');
  /** Current stock (read-only here; changed from the Inventory menu). */
  protected readonly currentStock = signal<number | null>(null);
  /** Today's sale price (read-only here; managed in the Pricing menu). */
  protected readonly currentPrice = signal<number | null>(null);
  /** Actual cost (moving average / serial costs), read-only here. */
  protected readonly avgCost = signal(0);

  protected readonly shortNameMax = SHORT_NAME_MAX;
  protected readonly statuses = Object.keys(SKU_STATUS_LABEL) as SkuStatus[];
  protected readonly statusLabel = SKU_STATUS_LABEL;
  protected readonly statusHint = SKU_STATUS_HINT;
  protected readonly vatTypes = Object.keys(VAT_TYPE_LABEL) as VatType[];
  protected readonly vatLabel = VAT_TYPE_LABEL;
  protected readonly itemTypes = Object.keys(ITEM_TYPE_LABEL) as ItemType[];
  protected readonly itemTypeLabel = ITEM_TYPE_LABEL;
  protected readonly itemTypeHint = ITEM_TYPE_HINT;

  protected readonly form = this.fb.group({
    sku: [
      '',
      [
        Validators.required,
        Validators.pattern(SKU_PATTERN),
        Validators.maxLength(30),
        this.uniqueSku(),
      ],
    ],
    name: ['', [Validators.required, Validators.maxLength(150)]],
    shortName: ['', [Validators.required, Validators.maxLength(SHORT_NAME_MAX)]],
    categoryId: this.fb.control<number | null>(null, [
      Validators.required,
      this.selectableCategory(),
    ]),
    brand: [''],
    model: [''],
    itemType: ['stock' as ItemType],
    saleStatus: ['active' as SkuStatus],
    vatType: ['vat7' as VatType],
    cost: [0, [Validators.required, Validators.min(0)]],
    minStock: [0, [Validators.required, Validators.min(0)]],
    maxStock: [0, [Validators.required, Validators.min(0)]],
    suppliers: this.fb.array<SupplierGroup>([]),
    unit: ['ชิ้น', Validators.required],
    barcode: ['', [Validators.pattern(BARCODE_PATTERN), this.uniqueBarcode()]],
    packUnits: this.fb.array<PackGroup>([]),
    imageUrl: [''],
    warrantyMonths: [0, [Validators.required, Validators.min(0), Validators.max(120)]],
    serialControl: [false],
    serialPrefix: ['', [Validators.pattern(/^[A-Z0-9-]*$/), Validators.maxLength(10)]],
    serialLength: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(50)]),
  });

  protected get supplierLinks() {
    return this.form.controls.suppliers;
  }

  protected get packs() {
    return this.form.controls.packUnits;
  }

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  protected readonly serialControl = computed(() => !!this.value().serialControl);
  protected readonly isService = computed(() => this.value().itemType === 'service');
  protected readonly baseUnit = computed(() => this.value().unit || 'หน่วย');
  protected readonly imageUrl = computed(() => this.value().imageUrl ?? '');
  protected readonly shortNameLength = computed(() => (this.value().shortName ?? '').length);
  protected readonly selectedStatusHint = computed(
    () => this.statusHint[this.value().saleStatus ?? 'active'],
  );

  /** e.g. prefix 'NB', length 10 → 'NB-XXXXXXXX' (length counts the whole serial). */
  protected readonly serialPreview = computed(() => {
    const { serialPrefix = '', serialLength } = this.value();
    const prefix = serialPrefix ? `${serialPrefix}-` : '';
    const rest = serialLength ? Math.max(serialLength - prefix.length, 1) : 8;
    return prefix + 'X'.repeat(rest) + (serialLength ? '' : '…');
  });

  /** Problems across the unit list (same unit twice, same barcode on two units). */
  /** Supplier-link problems + reorder levels (main supplier rule, duplicates, max ≥ reorder point). */
  protected readonly supplierProblems = computed(() => {
    const { suppliers = [], minStock = 0, maxStock = 0 } = this.value();
    const problems: string[] = [];
    const ids = suppliers.map((s) => s.supplierId).filter((id) => id != null);
    if (new Set(ids).size !== ids.length) problems.push('เลือกผู้จำหน่ายซ้ำกัน');
    if (suppliers.length && suppliers.filter((s) => s.isMain).length !== 1) {
      problems.push('ต้องเลือกผู้จำหน่ายหลัก 1 ราย');
    }
    if (maxStock > 0 && maxStock < minStock) problems.push('สต็อกสูงสุดต้องไม่น้อยกว่าจุดสั่งซื้อ');
    return problems;
  });

  protected readonly packProblems = computed(() => {
    const { unit = '', barcode = '', packUnits = [] } = this.value();
    const units = packUnits.map((p) => (p.unit ?? '').trim()).filter(Boolean);
    const codes = [barcode, ...packUnits.map((p) => p.barcode ?? '')].filter(Boolean);
    const problems: string[] = [];
    if (units.includes(unit.trim())) problems.push(`หน่วย "${unit}" ซ้ำกับหน่วยฐาน`);
    if (new Set(units).size !== units.length) problems.push('ชื่อหน่วยซ้ำกัน');
    if (new Set(codes).size !== codes.length) problems.push('บาร์โค้ดซ้ำกันภายใน SKU นี้');
    return problems;
  });

  protected readonly unitOptions = computed(() =>
    this.matching(this.store.units(), this.value().unit),
  );

  constructor() {
    // Serial SKUs have a single unit: switching serial control on drops pack units.
    this.form.controls.serialControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((on) => {
        if (on && this.packs.length) {
          this.packs.clear();
          this.notify.info('สินค้าคุม Serial มีหน่วยเดียว — ลบหน่วยแพ็ค/ลังออกแล้ว');
        }
      });
    // Service SKUs have no stock: clear serial control, packs and reorder levels.
    this.form.controls.itemType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => {
        if (type !== 'service') return;
        const dropped = this.packs.length > 0 || this.form.controls.serialControl.value;
        this.packs.clear();
        this.form.patchValue({ serialControl: false, minStock: 0, maxStock: 0 });
        if (!this.isEdit() && this.form.controls.unit.value === 'ชิ้น') {
          this.form.controls.unit.setValue('ครั้ง');
        }
        if (dropped)
          this.notify.info('สินค้าบริการไม่มีสต็อก — ยกเลิกการคุม Serial และหน่วยแพ็คแล้ว');
      });
  }

  ngOnInit(): void {
    // Needed for duplicate checks and the category list when this page is opened directly.
    this.store.load();

    const id = Number(this.id());
    if (!id) return;
    this.loading.set(true);
    this.store.getById(id).subscribe({
      next: (sku) => {
        this.form.patchValue(sku);
        sku.packUnits.forEach((p) => this.packs.push(this.packGroup(p)));
        sku.suppliers.forEach((l) => this.supplierLinks.push(this.supplierGroup(l)));
        this.currentStock.set(sku.stock);
        this.currentPrice.set(sku.currentPrice);
        this.avgCost.set(sku.avgCost);
        // Server rejects switching serial control while stock exists (getRawValue keeps the value).
        if (sku.stock > 0) {
          this.form.controls.serialControl.disable({ emitEvent: false });
          this.form.controls.itemType.disable({ emitEvent: false });
        }
        this.form.markAllAsTouched(); // surface issues on older data (e.g. no category yet)
        this.loading.set(false);
      },
      error: () => void this.router.navigate(['/sku']),
    });
  }

  protected toUpper(controlName: 'sku' | 'serialPrefix'): void {
    const control = this.form.controls[controlName];
    const upper = control.value.toUpperCase();
    if (upper !== control.value) control.setValue(upper);
  }

  /** Prefill the receipt name from the product name when it is still empty. */
  protected suggestShortName(): void {
    const short = this.form.controls.shortName;
    if (!short.value.trim())
      short.setValue(this.form.controls.name.value.trim().slice(0, SHORT_NAME_MAX));
  }

  protected addPack(): void {
    this.packs.push(this.packGroup({ unit: '', factor: 2, barcode: '' }));
  }

  protected removePack(index: number): void {
    this.packs.removeAt(index);
  }

  /** Active suppliers, plus the one already chosen on this row (even if since deactivated). */
  protected supplierOptions(row: SupplierGroup) {
    const current = row.controls.supplierId.value;
    return this.store.suppliers().filter((s) => s.active || s.id === current);
  }

  protected addSupplier(): void {
    this.supplierLinks.push(
      this.supplierGroup({
        supplierId: null as unknown as number,
        supplierSku: '',
        cost: this.form.controls.cost.value,
        leadTimeDays: 7,
        moq: 0,
        isMain: this.supplierLinks.length === 0,
      }),
    );
  }

  protected removeSupplier(index: number): void {
    const wasMain = this.supplierLinks.at(index).controls.isMain.value;
    this.supplierLinks.removeAt(index);
    if (wasMain && this.supplierLinks.length) this.setMainSupplier(0);
  }

  protected setMainSupplier(index: number): void {
    this.supplierLinks.controls.forEach((row, i) => row.controls.isMain.setValue(i === index));
  }

  protected async onImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow choosing the same file again
    if (!file) return;
    this.imageError.set('');
    try {
      this.form.controls.imageUrl.setValue(await resizeImage(file));
      this.form.markAsDirty();
    } catch (e) {
      this.imageError.set(e instanceof Error ? e.message : 'อัปโหลดรูปไม่สำเร็จ');
    }
  }

  protected removeImage(): void {
    this.form.controls.imageUrl.setValue('');
  }

  protected save(): void {
    if (this.form.invalid || this.packProblems().length || this.supplierProblems().length) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const payload: ProductPayload = withServiceRules({
      ...raw,
      sku: raw.sku.trim(),
      name: raw.name.trim(),
      shortName: raw.shortName.trim(),
      unit: raw.unit.trim(),
      packUnits: raw.serialControl
        ? []
        : raw.packUnits.map((p) => ({ unit: p.unit.trim(), factor: p.factor, barcode: p.barcode })),
      suppliers: raw.suppliers.map((l): SkuSupplier => ({
        ...l,
        supplierId: l.supplierId as number,
        supplierSku: l.supplierSku.trim(),
      })),
      // Serial format only matters when the SKU is serial-controlled.
      serialPrefix: raw.serialControl ? raw.serialPrefix : '',
      serialLength: raw.serialControl ? raw.serialLength : null,
    });

    this.saving.set(true);
    const request$ = this.isEdit()
      ? this.store.update(Number(this.id()), payload)
      : this.store.create(payload);

    request$.subscribe({
      next: (sku) => {
        this.notify.success(
          this.isEdit() ? `บันทึก ${sku.sku} เรียบร้อย` : `เพิ่ม ${sku.sku} เรียบร้อย`,
        );
        void this.router.navigate(['/sku', sku.id]);
      },
      error: () => this.saving.set(false),
    });
  }

  private packGroup(p: PackUnit): PackGroup {
    return this.fb.group({
      unit: [p.unit, Validators.required],
      factor: [p.factor, [Validators.required, Validators.min(2), Validators.pattern(/^\d+$/)]],
      barcode: [p.barcode, [Validators.pattern(BARCODE_PATTERN), this.uniqueBarcode()]],
    });
  }

  private supplierGroup(l: SkuSupplier): SupplierGroup {
    return this.fb.group({
      supplierId: this.fb.control<number | null>(l.supplierId, Validators.required),
      supplierSku: [l.supplierSku],
      cost: [l.cost, [Validators.required, Validators.min(0)]],
      leadTimeDays: [l.leadTimeDays, [Validators.required, Validators.min(0), Validators.max(365)]],
      moq: [l.moq, [Validators.required, Validators.min(0)]],
      isMain: [l.isMain],
    });
  }

  private editingId(): number | undefined {
    return Number(this.id()) || undefined;
  }

  private uniqueSku(): ValidatorFn {
    return (control: AbstractControl<string>): ValidationErrors | null =>
      control.value && this.store.isDuplicateCode(control.value, this.editingId())
        ? { duplicate: true }
        : null;
  }

  /** Barcode must not belong to another SKU (base or pack barcode). */
  private uniqueBarcode(): ValidatorFn {
    return (control: AbstractControl<string>): ValidationErrors | null => {
      const owner = this.store.barcodeOwner(control.value, this.editingId());
      return owner ? { barcodeTaken: owner } : null;
    };
  }

  private selectableCategory(): ValidatorFn {
    return (control: AbstractControl<number | null>): ValidationErrors | null =>
      control.value === null || !this.store.categories().length
        ? null
        : this.store.isSelectableCategory(control.value)
          ? null
          : { notSelectable: true };
  }

  private matching(options: string[], text: string | undefined): string[] {
    const t = (text ?? '').trim().toLowerCase();
    return t ? options.filter((o) => o.toLowerCase().includes(t)) : options;
  }
}
