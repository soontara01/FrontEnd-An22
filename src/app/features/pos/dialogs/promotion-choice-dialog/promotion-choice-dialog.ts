import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MATERIAL } from '@shared/material';
import { PromotionChoiceOption } from '../../data/pos.store';

export interface PromotionChoiceDialogData {
  /** The line(s) or 'ท้ายบิล' this choice covers */
  title: string;
  options: PromotionChoiceOption[];
}

/** Picks one of the promotions that exclude each other; closes with the option's index. */
@Component({
  selector: 'app-promotion-choice-dialog',
  imports: [DecimalPipe, MatDialogModule, MATERIAL],
  templateUrl: './promotion-choice-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .option {
      display: flex;
      width: 100%;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 8px;
      padding: 12px 16px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      background: transparent;
      color: var(--mat-sys-on-surface);
      font: var(--mat-sys-body-medium);
      text-align: left;
      cursor: pointer;
    }
    .option:hover {
      background: var(--mat-sys-surface-container-high);
    }
    .option.selected {
      border-color: var(--mat-sys-primary);
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }
    .total {
      white-space: nowrap;
      text-align: right;
    }
  `,
})
export class PromotionChoiceDialog {
  protected readonly data = inject<PromotionChoiceDialogData>(MAT_DIALOG_DATA);
}
