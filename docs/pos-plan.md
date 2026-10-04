# แผนหน้าจอขาย (POS)

สถานะ: ข้อตัดสินใจหัวข้อ 9 ยืนยันแล้ว (2026-10-04) · ขั้นที่ 1 เสร็จ (โมเดล + `priceCart()` + การชำระ + เทสต์)

อ้างอิงกติกาที่ตกลงไว้แล้วใน `CLAUDE.md`: Promotions (POS rules), Payment methods (POS rules),
Inventory costing (COGS ตอนขาย), Serial SKUs, Service SKUs, SKU retail fields (pack units / barcode).

## 1. ขอบเขต v1

ทำ:

- เมนูใหม่ **ขายหน้าร้าน** (`features/pos`, path `/pos`) — หน้าจอเดียวแบบเต็มจอสำหรับแคชเชียร์
- สแกนบาร์โค้ด (base + pack) / ค้นหาด้วยรหัส-ชื่อ → เพิ่มลงตะกร้า, แก้จำนวน, ลบบรรทัด
- SKU คุมซีเรียล: สแกน/เลือกซีเรียลที่ `in_stock` ทีละเครื่อง (1 บรรทัด = 1 ซีเรียล)
- คิดโปรโมชั่นอัตโนมัติ (ลดราคาสินค้า / ของแถม / ลดท้ายบิล) ตามกติกา priority + stackable
- ชำระเงินหลายช่องทางในบิลเดียว, เงินทอน (เฉพาะเงินสด), ปัดเศษเงินสด, เลขอ้างอิง, ผ่อนกี่เดือน
- บันทึกการขาย → ตัดสต็อก + stock movement + ซีเรียลเป็น `sold` + COGS ต่อบรรทัด (ฝั่ง server/mock)
- ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ 80 มม. (พิมพ์ผ่าน browser print)
- พักบิล (hold) ในเครื่อง (`StorageService`) และเรียกกลับมาได้
- เมนู **การขาย** (`features/sales`) เปลี่ยนเป็นประวัติบิลจริงจาก POS: รายละเอียดบิล, พิมพ์ซ้ำ, ยกเลิกบิล (void → คืนสต็อก)

ไม่ทำใน v1 (ต้องมีระบบอื่นก่อน): ขายเชื่อ / ลูกค้าสมาชิก / ใบกำกับภาษีเต็มรูป (ต้องมี customer master),
บัตรกำนัล, รับคืนสินค้าบางส่วน (return), เปิด-ปิดกะ / นับเงินลิ้นชัก, แก้ราคาหน้าร้าน, ส่วนลดมือ
(ยืนยันแล้วในหัวข้อ 9)

## 2. โครงสร้างไฟล์

```
core/models/sale.model.ts          Sale, SaleLine, SalePayment, SalePayload (ขยายจากของเดิม)
core/models/pos-pricing.model.ts   priceCart(), cartError() — ราคา/โปร/VAT/สต็อก (pure, ใช้ร่วม UI + mock)
core/models/pos-payment.model.ts   paymentSummary(), paymentError(), cashDueFor() — แบ่งจ่าย/ทอน/ปัดเศษ
core/models/*.spec.ts              เทสต์ของสองไฟล์ข้างบน (ส่วนที่สำคัญที่สุดของงานนี้)

features/pos/
  pos.routes.ts                    providers: [PosApi, PosStore]
  data/pos-api.service.ts          GET products/promotions/categories/payment-methods, serials, POST /sales
  data/pos.store.ts                ตะกร้า (signals), computed priceCart(), hold bills
  pages/pos-page/                  หน้าจอหลัก
  dialogs/serial-pick-dialog/      สแกน/เลือกซีเรียล
  dialogs/payment-dialog/          ชำระเงิน (ปุ่มตาม sortOrder)
  components/receipt/              ใบเสร็จ 80 มม. (ใช้ซ้ำในเมนูการขายไม่ได้ → ดูหัวข้อ 7)

features/sales/                    รายการบิล + /sales/:id รายละเอียด, พิมพ์ซ้ำ, void
```

`MENU` เพิ่มรายการ `{ label: 'ขายหน้าร้าน', icon: 'point_of_sale', path: 'pos' }` ไว้บนสุดถัดจากแดชบอร์ด
(เมนูการขายเปลี่ยน icon เป็น `receipt_long`)

## 3. โมเดลข้อมูล

```ts
// sale.model.ts — SaleStatus เดิม ('pending' | 'paid' | 'cancelled') คงไว้; บิลจาก POS เป็น 'paid',
// void → 'cancelled'. ข้อมูลเก่าเติมค่า default ตอนอ่าน (lines: [], payments: [] …)
interface SaleLine {
  productId: number;
  sku: string;
  name: string;
  shortName: string; // snapshot ตอนขาย
  unit: string;
  factor: number; // หน่วยที่ขาย (pack) — qty ฐาน = qty × factor
  qty: number; // ในหน่วยที่ขาย; serial = 1 เสมอ
  unitPrice: number; // ราคารวม VAT ต่อหน่วยที่ขาย (ก่อนลด)
  itemDiscount: number; // ส่วนลดโปรสินค้าทั้งบรรทัด
  billDiscount: number; // ส่วนลดท้ายบิลที่ปันส่วนมาบรรทัดนี้
  amount: number; // unitPrice × qty − itemDiscount − billDiscount
  vatType: VatType;
  vat: number; // VAT ของ amount (vatBreakdown)
  promotionIds: number[]; // โปรที่ใช้กับบรรทัดนี้
  freeOfPromotionId: number | null; // ≠ null = ของแถม (unitPrice 0)
  serial: string | null; // serial SKU
  warrantyMonths: number;
  cogs: number; // server กำหนด: ทุนซีเรียล / avgCost / cost (service)
}
interface SalePayment {
  methodId: number;
  name: string;
  type: PaymentType;
  amount: number; // ส่วนที่ชำระบิลจริง (ไม่รวมเงินทอน)
  tendered: number; // เงินที่รับมา (เงินสด ≥ amount; อื่น ๆ = amount)
  reference: string;
  installmentMonths: number | null;
}
interface Sale {
  id;
  orderNo; // เลขบิล เช่น 'POS-20261004-0001' (server ออก)
  date;
  cashier: string;
  customer: string; // '' = ลูกค้าทั่วไป
  lines: SaleLine[];
  payments: SalePayment[];
  subtotal;
  itemDiscount;
  billDiscount;
  total; // total = ยอดสุทธิรวม VAT
  vat;
  rounding;
  change; // rounding = ผลปัดเศษเงินสด (+/−)
  billPromotionIds: number[];
  itemCount;
  status;
  voidedAt: string | null;
  voidReason: string;
}
```

## 4. เครื่องคิดราคา `priceCart()` (pure function)

Input: บรรทัดในตะกร้า (productId, factor, qty, serial), products, promotions, categories, วันที่ขาย (`todayIso()`)
Output: บรรทัดที่คำนวณแล้ว (รวมบรรทัดของแถม), สรุปยอด, คำเตือน (เช่น ของแถมสต็อกไม่พอ)

ลำดับ (ตาม `CLAUDE.md` → Promotions / POS rules):

1. **ราคาตั้ง**: `currentPrice × factor` ต่อหน่วยที่ขาย; `currentPrice === null` → เพิ่มลงตะกร้าไม่ได้
2. **โปรลดราคาสินค้า** ต่อบรรทัด: ผู้สมัคร = `promotionsForProduct()` (เฉพาะ item_discount, active วันนี้,
   เรียง priority) → ไล่ตามลำดับ: ตัวแรกที่ผ่านเงื่อนไข (`minQty` นับเป็นหน่วยฐานของบรรทัด) ใช้เลย;
   ตัวถัดไปใช้ได้เฉพาะเมื่อ _ทุกตัวที่ใช้แล้วและตัวมันเอง_ เป็น stackable; หยุดเมื่อใช้ตัวที่ไม่ stackable.
   ส่วนลดคิดต่อหน่วยฐานบนราคาที่ลดแล้วของตัวก่อนหน้า (`discountAmount`) × จำนวนหน่วยฐาน
3. **ของแถม** (free_goods) ระดับบิล ต่อโปร: รวมบรรทัดที่อยู่ใน scope (ไม่รวมบรรทัดของแถม) →
   จำนวนชุด = `floor(qty / minQty)` หรือ `floor(ยอดหลังลดสินค้า / minAmount)`; `repeat: false` → สูงสุด 1,
   `maxSets` จำกัด → สร้างบรรทัดของแถม (ราคา 0, ต้อง `canSell`, ยังตัดสต็อก/คิด COGS; serial ต้องสแกนซีเรียล).
   ใช้กติกา priority/stackable เดียวกันกับข้อ 2 ร่วมกันต่อสินค้า (บรรทัดที่ได้โปรลดราคาแบบ non-stackable
   แล้วไม่นับเข้าโปรของแถม และกลับกัน)
4. **ลดท้ายบิล**: ยอดหลังข้อ 2 ≥ `minAmount` → ไล่ตาม priority ด้วยกติกา stackable เดียวกัน, ตัวถัดไปคิดบนยอดที่ลดแล้ว
5. **ปันส่วนส่วนลดท้ายบิล** ลงแต่ละบรรทัดตามสัดส่วนยอด (เศษสตางค์ไปบรรทัดยอดสูงสุด) — จำเป็นเพราะบิลอาจมีทั้ง
   `vat7` และ `exempt` และเพื่อให้ margin ต่อบรรทัดถูก
6. **VAT** ต่อบรรทัด = `vatBreakdown(amount, vatType).vat`; VAT บิล = ผลรวม
7. ทุกยอดปัด 2 ตำแหน่ง (`round2`) ทีละขั้น — UI กับ mock ใช้ฟังก์ชันเดียวกันจึงได้ตัวเลขตรงกัน

รายละเอียดที่ลงตัวตอนเขียนโค้ด (ขั้นที่ 1):

- โปรที่ priority เท่ากันเรียงตาม id (ผลลัพธ์คงที่)
- ของแถมเป็น "ผู้สมัคร" ของบรรทัดได้เมื่อบรรทัดใน scope ทั้งบิล (ราคาตั้ง) ถึงอย่างน้อย 1 ชุด; จำนวนชุดจริงคิดจาก
  บรรทัดที่เลือกโปรนั้นหลังหักส่วนลดสินค้า จึงอาจเหลือ 0 ชุดได้ (เช่น ลดแล้วยอดไม่ถึง `minAmount`)
- ของแถมสต็อกไม่พอ → แถมเท่าที่เหลือ + คำเตือน (ไม่บล็อก); สินค้าที่ขายเองสต็อกไม่พอ → บล็อก
- ปัญหาที่บล็อกการปิดบิลอยู่ใน `issues` (`cartError()` คืนข้อความแรก): ไม่พบสินค้า, ห้ามขาย, ไม่มีราคา,
  หน่วยขายไม่ถูก, จำนวนไม่ถูก, ซีเรียลไม่ระบุ/ซ้ำ, สต็อกไม่พอ, ซีเรียลของแถมยังไม่สแกน
- ซีเรียลของแถมส่งมาเป็น `freeSerials: { promotionId, productId, serial }[]`

## 5. การชำระเงิน `paymentSummary()` / `paymentError()`

- รายการจ่ายหลายบรรทัด, ปุ่มตาม `sortOrder` ของช่องทางที่ active
- ช่องทางที่ไม่ใช่เงินสด: `amount` ≤ ยอดคงเหลือ (เกินไม่ได้), ต้องอยู่ใน `minAmount`/`maxAmount`,
  `requireReference` → ต้องกรอก `referenceLabel`, ผ่อน → เลือกเดือนจาก `installmentMonths`
- เงินสด: ยอดที่ต้องจ่ายส่วนเงินสด = `roundCash(คงเหลือ, cashRounding)` → ผลต่างเป็น `rounding`;
  รับเกินได้ → `change`; เงินสดได้บรรทัดเดียว (ลำดับบรรทัดไม่มีผล)
- ตรวจ min/max ของเงินสดกับยอดที่ชำระจริงหลังปัดเศษ ไม่ใช่เงินที่รับมา; มีเงินสดทั้งที่ไม่มียอดเหลือ → error
- ปิดบิลได้เมื่อยอดชำระ (หลังปัดเศษ) = total; ลิ้นชักเปิดเมื่อมีเงินสด (`opensDrawer`) — v1 แค่แสดงข้อความ
- บิลยอด 0 (ของแถมล้วน/ลด 100%) ปิดได้โดยไม่มีรายการจ่าย

## 6. API (mock ใน `mock-backend.interceptor.ts`)

| Endpoint                                                                                     | หมายเหตุ                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /products`, `/promotions`, `/categories`, `/payment-methods`                            | โหลดครั้งเดียวตอนเปิดหน้า (มีอยู่แล้ว)                                                                                                                                                                                                                    |
| `GET /products/:id/serials`                                                                  | มีอยู่แล้ว — เช็กซีเรียลที่สแกนว่า `in_stock`                                                                                                                                                                                                             |
| `POST /sales` `{ lines:[{productId,factor,qty,serial}], payments, customer, expectedTotal }` | ใหม่ — server คิด `priceCart()` ซ้ำเอง; total ≠ expectedTotal → 400 "ราคา/โปรเปลี่ยน กรุณาตรวจตะกร้าใหม่"; ตรวจ `canSell`, ราคา, สต็อก, ซีเรียล, `paymentError()`; ตัดสต็อก (movement `issue`, note = เลขบิล), ซีเรียล → `sold`, กำหนด `cogs`; คืน `Sale` |
| `GET /sales/:id`                                                                             | ใหม่ — รายละเอียดบิล                                                                                                                                                                                                                                      |
| `POST /sales/:id/void { reason }`                                                            | ใหม่ — แทนการเปลี่ยน status เป็น cancelled ตรง ๆ; คืนสต็อก (movement `receive` ที่ทุนเดิมของบรรทัด), ซีเรียล → `in_stock`                                                                                                                                 |

หลังมีบิลจริง: ลบ payment method / promotion / SKU ที่บิลอ้างถึงไม่ได้ (mock มี TODO รอไว้แล้ว)

ต้องเพิ่ม movement type หรือไม่: ใช้ `issue` / `receive` เดิม + note อ้างเลขบิล (ไม่ต้องแก้ stock card)

## 7. หน้าจอ `/pos`

```
┌───────────────────────────────────────────┬──────────────────────────┐
│ [🔍 สแกนบาร์โค้ด / ค้นหา (F2)          ]   │  ยอดรวม        12,990    │
│ ───────────────────────────────────────── │  ส่วนลดสินค้า      −500  │
│ # สินค้า            จำนวน  ราคา   รวม  ✕  │  ส่วนลดท้ายบิล     −300  │
│ 1 Notebook X  SN:… [1]   15,990 15,490   │  VAT 7%            797   │
│   🏷 ลด 500 (PROMO-A)                      │ ─────────────────────── │
│ 2 เมาส์ 🎁 ของแถม   [1]       0      0    │  ยอดสุทธิ   ฿12,190      │
│ ...                                        │                          │
│                                            │ [พักบิล] [เรียกบิล] [ล้าง] │
│                                            │ [   ชำระเงิน (F12)    ]  │
└───────────────────────────────────────────┴──────────────────────────┘
```

- ช่องสแกนโฟกัสตลอด (keyboard wedge จบด้วย Enter); ตรงบาร์โค้ดเดียว → เพิ่มทันที, ไม่ตรง → autocomplete
- สแกนซ้ำ SKU เดิม (ไม่ใช่ serial) → +1 บรรทัดเดิม; serial SKU → เปิด dialog ซีเรียล (หรือสแกนซีเรียลตรงๆ ก็เจอ)
- คีย์ลัด: F2 ค้นหา, F12 ชำระเงิน, F8 พักบิล, Esc ปิด dialog, +/− จำนวนบรรทัดที่เลือก
- สต็อกไม่พอ → บล็อก (ของแถม → เตือน), แสดง badge โปรต่อบรรทัด
- จอแคบ (< 960px): สรุปยอดย้ายลงล่างเป็นแถบติดล่าง
- ใบเสร็จ: component ใน `features/pos` และสำเนาใน `features/sales` ไม่ได้ (ห้าม import ข้าม feature) →
  ย้าย `Receipt` ไป `shared/components/receipt` (stateless, รับ `Sale` + ข้อมูลร้าน) ใช้ทั้งสองเมนู;
  ข้อมูลร้าน (ชื่อ, เลขผู้เสียภาษี, สาขา, ที่อยู่) ต้องมีที่เก็บ → เมนูตั้งค่า (หัวข้อ 9)

## 8. ลำดับงาน (แต่ละขั้น build + test + lint ผ่าน แล้ว commit)

1. ✅ **โมเดล + เครื่องคิดราคา + การชำระ** — `sale.model.ts`, `pos-pricing.model.ts`, `pos-payment.model.ts` + spec
2. **Mock** — `POST /sales`, `GET /sales/:id`, `POST /sales/:id/void`, migrate seed sales, ล็อกการลบ master ที่ถูกอ้าง
3. **หน้าจอ POS** — store, สแกน/ค้นหา, ตะกร้า, ซีเรียล dialog, payment dialog, hold bills
4. **ใบเสร็จ + ข้อมูลร้าน** — `shared/components/receipt`, print CSS 80 มม., ฟอร์มข้อมูลร้านในเมนูตั้งค่า
5. **เมนูการขาย** — รายการบิลจริง, หน้า `/sales/:id`, พิมพ์ซ้ำ, void, ตัวกรองวันที่
6. อัปเดต `CLAUDE.md` (POS rules ที่ทำแล้ว, endpoint ใหม่)

## 9. ข้อตัดสินใจ (ยืนยัน 2026-10-04: ตามค่าแนะนำทั้งหมด)

1. **สต็อกไม่พอ** ขายได้ไหม — (บล็อก; serial บล็อกอยู่แล้วโดยธรรมชาติ, service ไม่เช็ก)
2. **ส่วนลดมือ / แก้ราคาหน้าร้าน** — (ไม่มีใน v1; ถ้าต้องมี ให้เฉพาะ role admin และบันทึกเหตุผล)
3. **โปร non-stackable ระดับสินค้า vs ลดท้ายบิล** ขัดกันไหม — (แยกระดับกัน, ลดท้ายบิลคิดเสมอบนยอดหลังลดสินค้า)
4. **minAmount ของแถม** คิดจากยอดก่อนหรือหลังลดราคาสินค้า — (หลังลด = เงินที่ลูกค้าจ่ายจริง)
5. **ข้อมูลร้านบนใบเสร็จ** เก็บที่ไหน — (เมนูตั้งค่า, endpoint `GET/PUT /settings/store`)
6. **เลขบิล** รูปแบบ — (`POS-YYYYMMDD-NNNN` รันใหม่ทุกวัน, server ออก)
7. **เปิด/ปิดกะ + นับเงินลิ้นชัก** — (รอบถัดไป)
