import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Transfer } from '@core/models';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';

/**
 * A4 transfer slip (E31) the driver carries and the destination checks: number, from → to, lines
 * with serials and quantities, signatures. No costs. Printed with `printElement(el, 'A4')`.
 */
@Component({
  selector: 'app-transfer-document',
  imports: [ThaiDatePipe],
  template: `
    <div class="doc">
      <header>
        <div class="company">{{ company() }}</div>
        <div class="title">ใบโอนสินค้าระหว่างสาขา</div>
        <div class="no">เลขที่ {{ transfer().transferNo }}</div>
      </header>
      <div class="meta">
        <div><b>จากสาขา</b> {{ from() }}</div>
        <div><b>ถึงสาขา</b> {{ to() }}</div>
        <div><b>วันที่โอน</b> {{ transfer().createdAt | thaiDate: 'long' }}</div>
        <div><b>ผู้ทำรายการ</b> {{ transfer().createdBy }}</div>
        @if (transfer().note) {
          <div class="wide"><b>หมายเหตุ</b> {{ transfer().note }}</div>
        }
      </div>
      <table>
        <thead>
          <tr>
            <th>ลำดับ</th>
            <th>SKU</th>
            <th>รายการ</th>
            <th class="num">จำนวน</th>
            <th class="num">รับจริง</th>
          </tr>
        </thead>
        <tbody>
          @for (l of transfer().lines; track l.productId; let i = $index) {
            <tr>
              <td>{{ i + 1 }}</td>
              <td>{{ l.sku }}</td>
              <td>
                {{ l.name }}
                @if (l.serials.length) {
                  <div class="serials">S/N: {{ l.serials.join(', ') }}</div>
                }
              </td>
              <td class="num">{{ l.qty }} {{ l.unit }}</td>
              <td class="num">{{ l.receivedQty ?? '' }}</td>
            </tr>
          }
        </tbody>
      </table>
      <div class="signs">
        <div>ผู้ส่ง<br />........................................</div>
        <div>ผู้ขนส่ง<br />........................................</div>
        <div>ผู้รับ<br />........................................</div>
      </div>
    </div>
  `,
  styles: `
    .doc {
      box-sizing: border-box;
      width: 210mm;
      min-height: 140mm;
      padding: 12mm;
      font:
        12px/1.5 'Sarabun',
        system-ui,
        sans-serif;
      color: #000;
      background: #fff;
    }
    header {
      text-align: center;
      margin-bottom: 10px;
    }
    .company {
      font-weight: 700;
    }
    .title {
      font-size: 18px;
      font-weight: 700;
    }
    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px 24px;
      margin-bottom: 10px;
    }
    .wide {
      grid-column: 1 / -1;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      border: 1px solid #000;
      padding: 4px 6px;
      text-align: left;
      vertical-align: top;
    }
    .num {
      text-align: right;
      white-space: nowrap;
    }
    .serials {
      font-size: 11px;
    }
    .signs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-top: 40px;
      text-align: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransferDocument {
  readonly transfer = input.required<Transfer>();
  readonly from = input.required<string>();
  readonly to = input.required<string>();
  readonly company = input('');
}
