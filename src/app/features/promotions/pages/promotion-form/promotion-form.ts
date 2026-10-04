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
  Validators,
} from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { Router, RouterLink } from '@angular/router';
import {
  DiscountKind,
  FreeItem,
  PROMOTION_STATUS_LABEL,
  PROMOTION_TYPE_ICON,
  PROMOTION_TYPE_LABEL,
  Product,
  Promotion,
  PromotionPayload,
  PromotionType,
  allBarcodes,
  fromIsoDate,
  hasStarted,
  promotionError,
  promotionStatus,
  toIsoDate,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { PromotionPreview } from '../../components/promotion-preview/promotion-preview';
import { PromotionsStore } from '../../data/promotions.store';

type FreeGroup = FormGroup<{
  productId: FormControl<number | null>;
  qty: FormControl<number>;
}>;

/** free_goods condition: pieces bought or baht spent on qualifying items. */
type FreeCondition = 'qty' | 'amount';

/** Controls that stay editable once a promotion has started (see `promotionError`). */
const EDITABLE_AFTER_START = ['enabled', 'endDate', 'note'];

const MAX_SCOPE_OPTIONS = 20;

/** End date (when set) must not be before the start date. */
function endNotBeforeStart(group: AbstractControl): ValidationErrors | null {
  const { startDate, endDate } = group.value as { startDate: Date | null; endDate: Date | null };
  return startDate && endDate && endDate < startDate ? { endBeforeStart: true } : null;
}

/** Create (`/promotions/new`) and edit (`/promotions/:id/edit`) form. */
@Component({
  selector: 'app-promotion-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatAutocompleteModule,
    MatChipsModule,
    MatDatepickerModule,
    PageHeader,
    LoadingSpinner,
    AutofocusDirective,
    PromotionPreview,
    MATERIAL,
  ],
  templateUrl: './promotion-form.html',
  styleUrl: './promotion-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PromotionForm implements OnInit {
  protected readonly store = inject(PromotionsStore);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  /** Bound from the `:id` route param (withComponentInputBinding). */
  readonly id = input<string>();
  protected readonly isEdit = computed(() => !!this.id());

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  /** Stored version being edited (undefined = new) */
  protected readonly existing = signal<Promotion | undefined>(undefined);
  /** Started promotions: only enabled / end date / note may change. */
  protected readonly locked = computed(() => {
    const p = this.existing();
    return !!p && hasStarted(p, this.store.today);
  });

  protected readonly types = Object.keys(PROMOTION_TYPE_LABEL) as PromotionType[];
  protected readonly typeLabel = PROMOTION_TYPE_LABEL;
  protected readonly typeIcon = PROMOTION_TYPE_ICON;

  protected readonly form = this.fb.group(
    {
      code: [
        '',
        [Validators.required, Validators.pattern(/^[A-Z0-9-]+$/), Validators.maxLength(30)],
      ],
      name: ['', [Validators.required, Validators.maxLength(100)]],
      note: [''],
      type: ['item_discount' as PromotionType],
      startDate: this.fb.control<Date | null>(fromIsoDate(this.store.today), Validators.required),
      endDate: this.fb.control<Date | null>(null),
      enabled: [true],
      priority: [0, [Validators.required, Validators.min(0), Validators.max(999)]],
      stackable: [false],
      scopeAll: [false],
      productIds: this.fb.control<number[]>([]),
      categoryIds: this.fb.control<number[]>([]),
      minQty: [1, [Validators.required, Validators.min(0)]],
      minAmount: [0, [Validators.required, Validators.min(0)]],
      freeCondition: ['qty' as FreeCondition],
      discountKind: ['percent' as DiscountKind],
      discountValue: [10, [Validators.required, Validators.min(0)]],
      maxDiscount: this.fb.control<number | null>(null, Validators.min(0)),
      freeItems: this.fb.array<FreeGroup>([]),
      repeat: [true],
      maxSets: this.fb.control<number | null>(null, Validators.min(1)),
    },
    { validators: endNotBeforeStart },
  );

  protected get freeItems() {
    return this.form.controls.freeItems;
  }

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });
  /** Raw value incl. disabled controls (a started promotion disables most of them). */
  protected readonly raw = computed(() => {
    this.value();
    return this.form.getRawValue();
  });

  protected readonly type = computed(() => this.raw().type);
  protected readonly discountKind = computed(() => this.raw().discountKind);

  /** What would be saved right now (also feeds the live preview). */
  protected readonly payload = computed(() => {
    this.raw();
    return this.toPayload();
  });

  /** Shared validation rule (the server checks the same); null until data is loaded. */
  protected readonly problem = computed(() => {
    if (!this.store.products().length) return null;
    return promotionError(
      this.payload(),
      {
        products: this.store.products(),
        categories: this.store.categories(),
        promotions: this.store.promotions(),
        today: this.store.today,
      },
      this.existing(),
    );
  });

  protected readonly statusText = computed(() => {
    const p = this.payload();
    return p.startDate ? PROMOTION_STATUS_LABEL[promotionStatus(p, this.store.today)] : '';
  });

  // Qualifying SKU picker (autocomplete + chips)
  protected readonly productSearch = signal('');
  protected readonly selectedProducts = computed(() =>
    this.raw().productIds.map(
      (id) => this.store.product(id) ?? ({ id, sku: `#${id}`, name: '' } as Product),
    ),
  );
  protected readonly productOptions = computed(() => {
    const text = this.productSearch().trim().toLowerCase();
    const chosen = new Set(this.raw().productIds);
    return this.store
      .scopeOptions()
      .filter((p) => !chosen.has(p.id))
      .filter(
        (p) =>
          !text ||
          [p.sku, p.name, p.shortName, ...allBarcodes(p)].some((f) =>
            f.toLowerCase().includes(text),
          ),
      )
      .slice(0, MAX_SCOPE_OPTIONS);
  });

  constructor() {
    // Each type needs a different set of fields; give the new type sensible defaults.
    this.form.controls.type.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => {
        if (this.locked()) return;
        if (type === 'free_goods' && !this.freeItems.length) this.addFreeItem();
        if (type === 'bill_discount') {
          this.form.patchValue({
            discountKind: 'amount',
            minAmount: this.form.value.minAmount || 1000,
          });
        }
        if (type === 'item_discount' && this.form.controls.minQty.value < 1) {
          this.form.controls.minQty.setValue(1);
        }
      });
    this.form.controls.discountKind.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((kind) => {
        if (kind === 'amount') this.form.controls.maxDiscount.setValue(null);
      });
  }

  ngOnInit(): void {
    this.store.load();
    const id = Number(this.id());
    if (!id) return;
    this.loading.set(true);
    this.store.getById(id).subscribe({
      next: (promo) => {
        this.existing.set(promo);
        this.patch(promo);
        if (hasStarted(promo, this.store.today)) {
          Object.entries(this.form.controls)
            .filter(([name]) => !EDITABLE_AFTER_START.includes(name))
            .forEach(([, control]) => control.disable({ emitEvent: false }));
        }
        this.loading.set(false);
      },
      error: () => void this.router.navigate(['/promotions']),
    });
  }

  protected toUpperCode(): void {
    const control = this.form.controls.code;
    const upper = control.value.toUpperCase();
    if (upper !== control.value) control.setValue(upper);
  }

  protected addProduct(id: number, input: HTMLInputElement): void {
    const ids = this.form.controls.productIds.value;
    if (!ids.includes(id)) this.form.controls.productIds.setValue([...ids, id]);
    input.value = '';
    this.productSearch.set('');
  }

  protected removeProduct(id: number): void {
    this.form.controls.productIds.setValue(
      this.form.controls.productIds.value.filter((x) => x !== id),
    );
  }

  protected addFreeItem(item: Partial<FreeItem> = {}): void {
    this.freeItems.push(
      this.fb.group({
        productId: this.fb.control<number | null>(item.productId ?? null, Validators.required),
        qty: [item.qty ?? 1, [Validators.required, Validators.min(1)]],
      }),
    );
  }

  protected removeFreeItem(index: number): void {
    this.freeItems.removeAt(index);
  }

  protected save(): void {
    if (this.form.invalid || this.problem()) {
      this.form.markAllAsTouched();
      return;
    }
    const payload = this.toPayload();
    this.saving.set(true);
    const request$ = this.isEdit()
      ? this.store.update(Number(this.id()), payload)
      : this.store.create(payload);
    request$.subscribe({
      next: (promo) => {
        this.notify.success(
          this.isEdit() ? `บันทึก ${promo.code} เรียบร้อย` : `เพิ่ม ${promo.code} เรียบร้อย`,
        );
        void this.router.navigate(['/promotions', promo.id]);
      },
      error: () => this.saving.set(false),
    });
  }

  private patch(p: Promotion): void {
    this.form.patchValue(
      {
        code: p.code,
        name: p.name,
        note: p.note,
        type: p.type,
        startDate: fromIsoDate(p.startDate),
        endDate: p.endDate ? fromIsoDate(p.endDate) : null,
        enabled: p.enabled,
        priority: p.priority,
        stackable: p.stackable,
        scopeAll: p.scope.all,
        productIds: [...p.scope.productIds],
        categoryIds: [...p.scope.categoryIds],
        minQty: p.minQty,
        minAmount: p.minAmount,
        freeCondition: p.type === 'free_goods' && p.minQty <= 0 ? 'amount' : 'qty',
        discountKind: p.discount?.kind ?? 'percent',
        discountValue: p.discount?.value ?? 0,
        maxDiscount: p.discount?.maxDiscount ?? null,
        repeat: p.freeGoods?.repeat ?? true,
        maxSets: p.freeGoods?.maxSets ?? null,
      },
      { emitEvent: false },
    );
    p.freeGoods?.items.forEach((item) => this.addFreeItem(item));
    this.form.updateValueAndValidity();
  }

  /** Form → API payload, keeping only the fields the chosen type uses. */
  private toPayload(): PromotionPayload {
    const raw = this.form.getRawValue();
    const existing = this.existing();
    if (existing && this.locked()) {
      // Started: everything but the editable fields comes from the stored version.
      const stored: Partial<Promotion> = { ...existing };
      delete stored.id;
      return {
        ...(stored as PromotionPayload),
        enabled: raw.enabled,
        endDate: raw.endDate ? toIsoDate(raw.endDate) : null,
        note: raw.note.trim(),
      };
    }
    const isFree = raw.type === 'free_goods';
    const byAmount = isFree && raw.freeCondition === 'amount';
    return {
      code: raw.code.trim().toUpperCase(),
      name: raw.name.trim(),
      note: raw.note.trim(),
      type: raw.type,
      startDate: raw.startDate ? toIsoDate(raw.startDate) : '',
      endDate: raw.endDate ? toIsoDate(raw.endDate) : null,
      enabled: raw.enabled,
      priority: Number(raw.priority),
      stackable: raw.stackable,
      scope:
        raw.type === 'bill_discount'
          ? { all: true, productIds: [], categoryIds: [] }
          : raw.scopeAll
            ? { all: true, productIds: [], categoryIds: [] }
            : { all: false, productIds: raw.productIds, categoryIds: raw.categoryIds },
      minQty: raw.type === 'bill_discount' || byAmount ? 0 : Number(raw.minQty),
      minAmount: raw.type === 'bill_discount' || byAmount ? Number(raw.minAmount) : 0,
      discount: isFree
        ? null
        : {
            kind: raw.discountKind,
            value: Number(raw.discountValue),
            maxDiscount:
              raw.discountKind === 'percent' && raw.maxDiscount ? Number(raw.maxDiscount) : null,
          },
      freeGoods: isFree
        ? {
            items: raw.freeItems
              .filter((i) => i.productId !== null)
              .map((i) => ({ productId: i.productId as number, qty: Number(i.qty) })),
            repeat: raw.repeat,
            maxSets: raw.maxSets ? Number(raw.maxSets) : null,
          }
        : null,
    };
  }
}
