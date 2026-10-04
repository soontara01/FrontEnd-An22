import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CreditNote, StoreInfo, branchLabel } from '@core/models';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';

/** 80 mm credit note slip (ใบลดหนี้) referring to the original bill; same look as `Receipt`. */
@Component({
  selector: 'app-credit-note-receipt',
  imports: [DecimalPipe, ThaiDatePipe],
  templateUrl: './credit-note-receipt.html',
  styleUrl: './receipt.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditNoteReceipt {
  readonly note = input.required<CreditNote>();
  readonly store = input.required<StoreInfo>();

  protected readonly branch = computed(() => branchLabel(this.store()));
}
