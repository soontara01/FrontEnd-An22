import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { PosTerminal, Shift, terminalError, terminalLabel } from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { TerminalService } from '@core/services/terminal.service';
import { MATERIAL } from '@shared/material';
import { httpErrorShown } from '@core/http/http-error-shown';
import { SettingsApi } from '../../data/settings-api.service';

/**
 * "เครื่องนี้": which registered POS terminal (cash drawer) this device is (docs/terminal-plan.md,
 * T2). Set once by an admin; kept in this browser's localStorage, so every device is set on its
 * own. Locked while the terminal has an open shift.
 */
@Component({
  selector: 'app-this-terminal',
  imports: [MATERIAL],
  template: `
    <p class="current">
      <mat-icon inline>point_of_sale</mat-icon>
      @if (terminalId(); as id) {
        เครื่องนี้คือ <strong>{{ label(id) }}</strong>
      } @else {
        เครื่องนี้ยังไม่ได้ตั้งเลขเครื่อง — ขายและเปิดกะไม่ได้
      }
    </p>
    @if (loaded() && problem(); as message) {
      <p class="problem">{{ message }}</p>
    }

    @if (editable()) {
      @if (openShift(); as shift) {
        <p class="text-muted small">
          เครื่องนี้มีกะ {{ shift.shiftNo }} ที่เปิดอยู่ — ปิดกะก่อนจึงจะเปลี่ยนเครื่องได้
        </p>
      } @else {
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>ตั้งเป็นเครื่อง</mat-label>
            <mat-select [value]="picked()" (selectionChange)="picked.set($event.value)">
              @for (t of activeTerminals(); track t.id) {
                <mat-option [value]="t.id">{{ label(t.id) }}</mat-option>
              }
            </mat-select>
            <mat-hint>เพิ่ม / แก้เครื่องได้ที่ ข้อมูลหลัก → เครื่อง POS</mat-hint>
          </mat-form-field>
          <button
            mat-flat-button
            type="button"
            [disabled]="!picked() || picked() === terminalId()"
            (click)="save()"
          >
            <mat-icon>save</mat-icon>
            บันทึก
          </button>
          @if (terminalId()) {
            <button mat-button type="button" (click)="clear()">ล้างการตั้งค่า</button>
          }
        </div>
      }
    } @else {
      <p class="text-muted small">ผู้ดูแลระบบเป็นผู้ตั้งเลขเครื่อง</p>
    }
  `,
  styles: `
    .current {
      font: var(--mat-sys-title-small);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 12px;
    }
    .problem {
      color: var(--mat-sys-error);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThisTerminal {
  /** Only admins set the device's terminal */
  readonly editable = input(false);

  private readonly api = inject(SettingsApi);
  private readonly terminal = inject(TerminalService);
  private readonly notify = inject(NotificationService);

  protected readonly terminalId = this.terminal.terminalId;
  private readonly terminals = signal<PosTerminal[]>([]);
  protected readonly openShift = signal<Shift | null>(null);
  protected readonly loaded = signal(false);
  protected readonly picked = signal<number | null>(this.terminalId());

  protected readonly activeTerminals = computed(() => this.terminals().filter((t) => t.active));
  /** Same rule as the POS / server: a set terminal must be an active registered one. */
  protected readonly problem = computed(() =>
    this.terminalId() === null ? null : terminalError(this.terminalId(), this.terminals()),
  );

  constructor() {
    this.reload();
  }

  protected label(id: number): string {
    return terminalLabel(id, this.terminals());
  }

  protected save(): void {
    const id = this.picked();
    if (id === null) return;
    this.terminal.set(id);
    this.notify.success(`ตั้งเครื่องนี้เป็น ${this.label(id)} แล้ว`);
    this.reload();
  }

  protected clear(): void {
    this.terminal.clear();
    this.picked.set(null);
    this.openShift.set(null);
  }

  /** The open shift depends on the terminal header, so it is fetched again after a change. */
  private reload(): void {
    forkJoin([this.api.posTerminals(), this.api.currentShift()]).subscribe({
      next: ([terminals, shift]) => {
        this.terminals.set(terminals);
        this.openShift.set(shift);
        this.loaded.set(true);
      },
      error: httpErrorShown,
    });
  }
}
