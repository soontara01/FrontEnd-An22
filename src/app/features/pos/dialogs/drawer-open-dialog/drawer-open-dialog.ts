import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { DRAWER_OPEN_REASONS, DrawerOpenPayload, drawerOpenError } from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';

/** Opening the drawer without a sale (S7): a reason is required; logged in the shift. */
@Component({
  selector: 'app-drawer-open-dialog',
  imports: [MatDialogModule, AutofocusDirective, MATERIAL],
  template: `
    <h2 mat-dialog-title>เปิดลิ้นชัก (ไม่มีการขาย)</h2>
    <mat-dialog-content>
      <p class="text-muted small">ทุกครั้งที่เปิดลิ้นชักโดยไม่มีบิลจะถูกบันทึกและแสดงในรายงานกะ</p>
      <div class="quick">
        @for (q of quickReasons; track q) {
          <button mat-stroked-button type="button" (click)="reason.set(q)">{{ q }}</button>
        }
      </div>
      <mat-form-field appearance="outline" class="w-full">
        <mat-label>เหตุผล (จำเป็น)</mat-label>
        <input
          matInput
          appAutofocus
          maxlength="200"
          [value]="reason()"
          (input)="reason.set($any($event.target).value)"
          (keydown.enter)="save()"
        />
      </mat-form-field>
      @if (problem(); as message) {
        <div class="problem">{{ message }}</div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button type="button" [disabled]="!!problem()" (click)="save()">
        <mat-icon>point_of_sale</mat-icon>
        เปิดลิ้นชัก
      </button>
    </mat-dialog-actions>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .quick {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .problem {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class DrawerOpenDialog {
  private readonly dialogRef =
    inject<MatDialogRef<DrawerOpenDialog, DrawerOpenPayload>>(MatDialogRef);

  protected readonly quickReasons = DRAWER_OPEN_REASONS;
  protected readonly reason = signal('');
  private readonly payload = computed<DrawerOpenPayload>(() => ({ reason: this.reason().trim() }));
  protected readonly problem = computed(() => drawerOpenError(this.payload()));

  protected save(): void {
    if (this.problem()) return;
    this.dialogRef.close(this.payload());
  }
}
