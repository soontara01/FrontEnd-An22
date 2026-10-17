import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import {
  Product,
  SerialNumber,
  TransferLineInput,
  TransferPayload,
  isService,
  transferError,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { TransfersStore } from '../../data/transfers.store';

/**
 * New transfer from the working branch (`/transfers/new`, E26): destination, SKUs with stock here
 * (quantity, or the serials to send), note. Checked by `transferError()` like the server.
 */
@Component({
  selector: 'app-transfer-form',
  imports: [MatCheckboxModule, RouterLink, PageHeader, LoadingSpinner, MATERIAL],
  templateUrl: './transfer-form.html',
  styleUrl: '../transfers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class TransferForm {
  protected readonly store = inject(TransfersStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);

  protected readonly here = computed(() => this.auth.currentBranch());
  /** Active branches other than this one */
  protected readonly destinations = computed(() =>
    this.store.branches().filter((b) => b.active && b.id !== this.here()?.id),
  );
  protected readonly productsRes = rxResource({ stream: () => this.store.products() });
  /** What can be sent from here: stocked, not a service */
  protected readonly available = computed(() =>
    (this.productsRes.hasValue() ? this.productsRes.value() : []).filter(
      (p) => !isService(p) && p.stock > 0,
    ),
  );

  protected readonly toBranchId = signal<number | null>(null);
  protected readonly note = signal('');
  protected readonly lines = signal<TransferLineInput[]>([]);
  /** In-stock serials of the serial SKUs on the transfer, by product */
  protected readonly serialsOf = signal<ReadonlyMap<number, SerialNumber[]>>(new Map());
  protected readonly saving = signal(false);

  private readonly payload = computed<TransferPayload>(() => ({
    toBranchId: this.toBranchId() ?? 0,
    lines: this.lines(),
    note: this.note().trim(),
  }));
  protected readonly problem = computed(() =>
    transferError(this.payload(), {
      fromBranchId: this.here()?.id ?? 0,
      branches: this.store.branches(),
      products: this.available(),
      serials: [...this.serialsOf().values()].flat(),
    }),
  );

  constructor() {
    this.store.loadBranches();
  }

  protected product(id: number): Product | undefined {
    return this.available().find((p) => p.id === id);
  }

  /** SKUs not on the transfer yet */
  protected readonly addable = computed(() =>
    this.available().filter((p) => !this.lines().some((l) => l.productId === p.id)),
  );

  protected add(productId: number): void {
    const p = this.product(productId);
    if (!p) return;
    this.lines.update((lines) => [
      ...lines,
      { productId, qty: p.serialControl ? 0 : 1, serials: [] },
    ]);
    if (p.serialControl && !this.serialsOf().has(productId)) {
      this.store.serials(productId).subscribe({
        next: (list) =>
          this.serialsOf.update((m) =>
            new Map(m).set(
              productId,
              list.filter((s) => s.status === 'in_stock'),
            ),
          ),
        // The line stays and the rule says no serial is chosen; the snackbar is already shown.
        error: () => undefined,
      });
    }
  }

  protected remove(productId: number): void {
    this.lines.update((lines) => lines.filter((l) => l.productId !== productId));
  }

  protected setQty(productId: number, value: string): void {
    const qty = Number(value);
    this.lines.update((lines) => lines.map((l) => (l.productId === productId ? { ...l, qty } : l)));
  }

  protected toggleSerial(productId: number, serial: string, on: boolean): void {
    this.lines.update((lines) =>
      lines.map((l) => {
        if (l.productId !== productId) return l;
        const serials = on ? [...l.serials, serial] : l.serials.filter((s) => s !== serial);
        return { ...l, serials, qty: serials.length };
      }),
    );
  }

  protected save(): void {
    if (this.problem() || this.saving()) return;
    this.saving.set(true);
    this.store.create(this.payload()).subscribe({
      next: (t) => {
        this.notify.success(`สร้างใบโอน ${t.transferNo} แล้ว — สินค้าออกจากสต็อกสาขานี้`);
        void this.router.navigate(['/transfers', t.id]);
      },
      error: () => this.saving.set(false),
    });
  }
}
