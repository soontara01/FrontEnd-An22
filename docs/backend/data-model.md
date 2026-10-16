# Data model → PostgreSQL

**field ทุกตัว = interface ใน `src/app/core/models/<ไฟล์>.model.ts`** (ชื่อ camelCase ใน JSON, snake_case ในตาราง)
ไฟล์นี้บอกเฉพาะสิ่งที่ TypeScript ไม่ได้บอก: ตาราง, key, unique, ค่าที่ server คำนวณ, child table, ระดับบริษัท / สาขา (SaaS)

collection ของ mock (`MockDb` ใน `mock-backend.interceptor.ts`, เก็บใน localStorage `an22.mock.db`) ≈ ตาราง 1:1
seed ของ mock (`seedDb()`) ใช้เป็น seed ของ dev DB ได้

## ข้อตกลง

- ทุกตารางข้อมูลมี `tenant_id` (SaaS D7: ฐานเดียว + RLS) — เพิ่มตั้งแต่ migration แรก แม้ตอนนี้มีบริษัทเดียว
- คอลัมน์ "ระดับ" ด้านล่าง: **บริษัท** = `tenant_id` อย่างเดียว · **สาขา** = `tenant_id` + `branch_id` (`docs/saas-plan.md` หัวข้อ 3)
- ทุก unique key รวม `tenant_id` (รหัส SKU, บาร์โค้ด, รหัสผู้จำหน่าย, เลขเอกสาร, username)
- เงิน `numeric(14,2)`, ทุน / ทุนเฉลี่ย `numeric(14,4)` ถ้าต้องการ (หน้าบ้านปัด 2 ตำแหน่ง — ตกลงก่อนทำ, ดู `domain-rules.md` เรื่องการปัด)
- เวลา `timestamptz` · วันที่ธุรกิจ (`startDate`, `endDate`) `date` · enum เป็น `text` + `CHECK` (ค่าตาม type union ใน TS)
- **ห้ามลบเอกสาร** (บิล, ใบลดหนี้, ใบเปลี่ยน, ใบกำกับ, กะ, movement) — มีแต่เปลี่ยนสถานะ / เพิ่มรายการใหม่
- array ใน TS → child table เมื่อมีโครงสร้าง (`packUnits`, `suppliers`, `lines`, `payments`, `counts`); array ของ id / string เล็ก ๆ
  (`promotionIds`, `installmentMonths`, `serials` ของ movement, `creditNoteNos`) ใช้ `int[]` / `text[]` หรือ child table ก็ได้
  แต่ JSON ที่ตอบต้องเป็นรูปเดิม
- snapshot ในเอกสาร (ชื่อสินค้า, ราคา, ชื่อช่องทางชำระ, `posId`, ชื่อผู้ขาย) **เก็บค่าตอนนั้น** ไม่ join master ตอนอ่าน

## ข้อมูลหลัก

| ตาราง (TS type)                     | ระดับ (SaaS)   | key / unique                                                                                                        | หมายเหตุ                                                                                                                                    |
| ----------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `users` (`User`)                    | บริษัท         | email (B5 ยังไม่บังคับใน mock); SaaS: `username` unique ในบริษัท                                                    | SaaS เพิ่ม `username`, `branch_ids` / `all_branches`, role `owner`; รหัสผ่านเก็บ hash (mock ใช้ `1234`)                                     |
| `products` (`Product`)              | บริษัท         | `sku` (ไม่สนตัวพิมพ์), `barcode`                                                                                    | **ไม่เก็บ** `currentPrice`, `categoryPath` (derived); `stock` / `avgCost` / `minStock` / `maxStock` ย้ายไป `branch_stock` เมื่อ SaaS ขั้น 3 |
| `product_pack_units` (`PackUnit`)   | บริษัท         | (product, unit); `barcode` unique **รวมกับ** `products.barcode`                                                     | serial SKU ไม่มีแถว                                                                                                                         |
| `product_suppliers` (`SkuSupplier`) | บริษัท         | (product, supplier); `is_main` = 1 แถวต่อ product (partial unique)                                                  |                                                                                                                                             |
| `categories` (`Category`)           | บริษัท         | `code`                                                                                                              | `parent_id` self-FK, `level` 1–3; `productCount` derived                                                                                    |
| `suppliers` (`Supplier`)            | บริษัท         | `code`; (`tax_id`, `branch_type`, `branch_no`)                                                                      | `productCount` derived                                                                                                                      |
| `sku_prices` (`SkuPrice`)           | บริษัท (D2)    | ห้ามช่วงทับกันต่อ product — `EXCLUDE USING gist (product_id WITH =, daterange(start_date, end_date, '[]') WITH &&)` | `end_date` null = ไม่สิ้นสุด                                                                                                                |
| `promotions` (`Promotion`)          | บริษัท         | `code`                                                                                                              | `scope`, `discount`, `freeGoods` → คอลัมน์ / child table หรือ `jsonb`; SaaS เพิ่ม `branch_ids` (D2)                                         |
| `payment_methods` (`PaymentMethod`) | บริษัท         | `code`                                                                                                              | `sortOrder`; `closeCheck` null = ค่าตามประเภท                                                                                               |
| `pos_terminals` (`PosTerminal`)     | สาขา (T5)      | `id` = เลขเครื่อง (ผู้ใช้กำหนด, ไม่ใช่ serial) ; `pos_id` unique เมื่อไม่ว่าง                                       | SaaS: unique (tenant, branch, id)                                                                                                           |
| `store_info` (`StoreInfo`)          | 1 แถว / บริษัท | —                                                                                                                   | SaaS แยกเป็น `company_info` + `branch_info` (saas-plan หัวข้อ 3)                                                                            |
| `menu_access` (`MenuAccess`)        | 1 แถว / บริษัท | —                                                                                                                   |                                                                                                                                             |

## สต็อก

| ตาราง (TS type)                     | ระดับ | key / unique                                                                                      | หมายเหตุ                                                                                                                                                                 |
| ----------------------------------- | ----- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `serial_numbers` (`SerialNumber`)   | สาขา  | `serial` unique (ในบริษัท) — 1 serial = 1 แถว, รับคืนใช้แถวเดิม (mock ตั้ง `product_id` ใหม่ด้วย) | ไม่ลบ — `status` in_stock / sold / damaged / other (+ `in_transit` เมื่อมีใบโอน); รับคืน = ใช้แถวเดิม                                                                    |
| `stock_movements` (`StockMovement`) | สาขา  | `id`                                                                                              | append-only; `type` opening / receive / issue (+ `transfer_out` / `transfer_in` SaaS ขั้น 5); เก็บยอดคงเหลือ `balance_qty` / `balance_avg_cost` / `balance_value` ต่อแถว |
| `branch_stock` (SaaS ขั้น 3)        | สาขา  | (tenant, branch, product)                                                                         | `stock`, `avg_cost`, `min_stock`, `max_stock` — API ยังตอบ `Product` หน้าตาเดิม (D1)                                                                                     |

## เอกสารขาย

| ตาราง (TS type)                                        | ระดับ | key / unique                                                                  | หมายเหตุ                                                                                                                                                                                                                   |
| ------------------------------------------------------ | ----- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sales` (`Sale`)                                       | สาขา  | `order_no`                                                                    | **ไม่เก็บ** `returnStatus`, `creditedTotal`, `creditNoteNos`, `exchangeNos` (derived จากใบลดหนี้ / ใบเปลี่ยน); `taxInvoiceNo` server ตั้ง; snapshot `terminal_id`, `pos_id`, `vat_registered`, `shift_id`, `void_shift_id` |
| `sale_lines` (`SaleLine`)                              | สาขา  | (sale, line_index)                                                            | อ้างด้วย index (`saleLineIndex` ในใบลดหนี้ / ใบเปลี่ยน) — ลำดับต้องคงที่; `free_of_promotion_id` null = ไม่ใช่ของแถม; `cogs`                                                                                               |
| `sale_payments` (`SalePayment`)                        | สาขา  | (sale, index)                                                                 | snapshot `name`, `type`                                                                                                                                                                                                    |
| `credit_notes` (+ `_lines`, `_deductions`, `_refunds`) | สาขา  | `cn_no`                                                                       | `buyer` snapshot, `tax_invoice_no` ตอนออก (ไม่เปลี่ยน), `shift_id`, `terminal_id`, `pos_id`, `vat_registered`                                                                                                              |
| `exchanges` (+ `_lines`)                               | สาขา  | `ex_no`                                                                       | `cost_in` / `cost_out` ต่อบรรทัด                                                                                                                                                                                           |
| `tax_invoices` (`TaxInvoice`)                          | สาขา  | `invoice_no`; ใช้ได้ 1 ใบต่อบิล (partial unique `WHERE cancelled_at IS NULL`) | `buyer` snapshot, `at_sale`, `replaces_invoice_no` / `replaced_by_no`                                                                                                                                                      |

## กะ

| ตาราง (TS type)                         | ระดับ | key / unique                                                                  | หมายเหตุ                                                                                     |
| --------------------------------------- | ----- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `shifts` (`Shift`)                      | สาขา  | `shift_no`; กะเปิดได้ 1 กะต่อเครื่อง (partial unique `WHERE status = 'open'`) | `adjustmentTotal` derived; `openingDenominations` / `cashDenominations` → child หรือ `jsonb` |
| `shift_counts` (`ShiftCount`)           | สาขา  | (shift, method)                                                               | `counted` null = ยังไม่นับ / ไม่ต้องนับ; `first_count` เก็บยอดนับครั้งแรก                    |
| `cash_movements` (`CashMovement`)       | สาขา  | `id`                                                                          | เงินเข้า / ออกลิ้นชัก                                                                        |
| `drawer_opens` (`DrawerOpen`)           | สาขา  | `id`                                                                          | ไม่มีเงิน (S7)                                                                               |
| `shift_adjustments` (`ShiftAdjustment`) | สาขา  | `id`                                                                          | append-only (S8)                                                                             |

## เลขรันเอกสาร

| เอกสาร         | รูปแบบปัจจุบัน               | รันต่อ                      | SaaS (saas-plan หัวข้อ 3)            |
| -------------- | ---------------------------- | --------------------------- | ------------------------------------ |
| บิล POS        | `POS<เครื่อง>-YYYYMMDD-NNNN` | เครื่อง + วัน (T4)          | `POS-<สาขา>-<เครื่อง>-YYYYMMDD-NNNN` |
| บิลเก่า        | `POS-YYYYMMDD-NNNN`          | (ข้อมูลก่อน T4 = เครื่อง 1) | —                                    |
| ใบกำกับเต็มรูป | `INV-<วันขาย>-NNNN`          | ร้าน + วันขาย               | `INV-<สาขา>-…`                       |
| ใบลดหนี้       | `CN-YYYYMMDD-NNNN`           | ร้าน + วัน                  | `CN-<สาขา>-…`                        |
| ใบเปลี่ยน      | `EX-YYYYMMDD-NNNN`           | ร้าน + วัน                  | `EX-<สาขา>-…`                        |
| กะ             | `SH-YYYYMMDD-NNNN`           | ร้าน + วันเปิดกะ            | ต่อสาขา                              |
| ใบโอน          | —                            | —                           | `TR-<สาขา>-YYYYMMDD-NNNN` (ขั้น 5)   |

วันในเลข = วันท้องถิ่น (Asia/Bangkok); เลขต้องต่อเนื่องและไม่ซ้ำเมื่อขายพร้อมกัน (ตารางตัวนับ + `SELECT … FOR UPDATE` หรือ sequence ต่อ prefix)

## ข้อมูลเก่าที่ mock ย้ายให้ตอนอ่าน

`migrateLegacyPrices`, `migrateLegacySkuFields`, `migrateCosting` (สร้างบรรทัด `opening`), `syncSerials` (สร้าง serial ตัวอย่าง),
`enableShifts`, `migrateTerminals` (`legacyPosId`) — เป็นของ mock / localStorage เท่านั้น DB จริงเริ่มใหม่ไม่ต้องทำ
ยกเว้นจะย้ายข้อมูลจริงจาก mock มาเข้า DB
