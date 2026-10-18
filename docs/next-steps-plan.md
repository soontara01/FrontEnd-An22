# แผนงานถัดไปหลัง SaaS ขั้น 6 (เริ่ม 2026-10-18)

สถานะ: **กำลังทำ B** — A เสร็จ 2026-10-18 (PR #3 merge แล้ว); B ทำบน branch `feature/p5-hide-cost`: B1–B3 เสร็จ (E43–E46)
งานในไฟล์นี้: **A** ปิดงานค้างของขั้น 6 → **B** ซ่อนทุน / กำไรจาก role user (P5) → **C** ส่งต่อหลังบ้าน
แต่ละขั้นย่อย build + test + lint ผ่าน → prettier เฉพาะไฟล์ที่แก้ (อย่าให้โดน `docs/test-data`) → อัปเดต docs → commit

---

## A. ปิดงานค้างของขั้น 6 (เล็ก)

### A1. dev server + ข้อมูลทดสอบ — ✅ 2026-10-18 (restart `ng serve`, ลบ ACME, ปิดกะค้างทั้ง 2 กะ)

- dev server เดิมที่ `:4200` (รันตั้งแต่ 2026-10-15) **ไม่ rebuild chunk หน้า platform แล้ว** — ถามผู้ใช้ก่อน แล้วให้ผู้ใช้ restart `ng serve` เอง (เป็น process ของผู้ใช้)
- mock db บน `:4200` มีบริษัททดสอบ `ACME` (id 2) ค้างสถานะ "รอลบข้อมูล" — **ถามผู้ใช้ก่อนลบ**; วิธีลบ: คืน `an22.mock.platform` จาก localStorage key `backup-before-step6.9`
  (สำรองไว้ก่อนทดสอบ 6.9 — ทะเบียนมี DEMO อย่างเดียว) แล้วลบ key `an22.mock.db.2`; ข้อมูล DEMO (`an22.mock.db`) ไม่ต้องแตะ
- กะเปิดค้าง 2 กะ (admin เครื่อง 1, bnstaff เครื่อง 3) — ถามก่อนปิด

### A2. "เครื่องนี้" ผูกกับบริษัท (ข้อสังเกต ① จากการทดสอบ 6.9) — ✅ เสร็จ 2026-10-18 (E42)

- ปัญหา: `TerminalService` (`core/services/terminal.service.ts`) เก็บ `pos.terminal` ต่อเครื่อง — login อีกบริษัทบนเครื่องเดียวกันยังส่ง `X-Terminal-Id` ของบริษัทเดิม
  (POS ขึ้น "ไม่ได้ลงทะเบียน", audit แก้แล้วให้ไม่บันทึกเลขเครื่องที่ไม่ใช่ของบริษัท)
- ทำ: key `pos.terminal.<companyId>` แบบเดียวกับพักบิล (`pos.held.<companyId>.<branchId>` ใน `pos.store.ts`); ค่าเดิม `pos.terminal` ย้ายเข้าบริษัทแรกที่เปิดหลัง login (DEMO) ครั้งเดียว
- ระวัง bundle: `TerminalService` อยู่ใน initial bundle (ใช้ใน `terminalInterceptor`) — อ่าน company id จาก `AuthService` (inject) ห้าม import model / barrel
- spec: `terminal.service` + `terminal.interceptor.spec.ts`; docs: CLAUDE.md หัวข้อ POS terminals ("localStorage `pos.terminal`"), `docs/terminal-plan.md` (T2)

### A3. ทดสอบบนหน้าจอส่วนที่ยังมีแค่ spec — ✅ 2026-10-18

owner เปลี่ยนแพ็กเกจ (tab แพ็กเกจ) · โอนความเป็นเจ้าของ (รายการผู้ใช้ → ปุ่ม workspace_premium, ผู้รับต้องมีอีเมล → หน้า reload) ·
admin สาขา (สร้างผู้ใช้ admin สาขา BN) เห็น audit เฉพาะ BN · ชนเพดานผู้ใช้ / เครื่อง POS (เปลี่ยน DEMO เป็น Starter ชั่วคราว แล้วคืนเป็น Pro) ·
platform: ตั้งรหัส owner, ระงับ / เปิดกลับ (ต้องมีเหตุผล)
— บันทึกผลต่อท้ายความคืบหน้าขั้น 6 ใน `docs/saas-plan.md`; หมายเหตุ: เครื่องมือคลิกของเบราว์เซอร์ไม่ส่งคลิกบางปุ่ม ใช้ `javascript_tool` คลิก / กรอก (dispatch `input`) แทน; stub `window.print`

### A4. รวม branch — PR เข้า `main` (2026-10-18); หัวข้อ B ทำบน branch ใหม่

`feature/step5` มี commit ขั้น 5 + ขั้น 6 (6.1–6.9) — **ถามผู้ใช้** ว่าจะเปิด PR เข้า `main` หรือ merge เอง (อย่า push / merge เองโดยไม่ถาม)

---

## B. ซ่อนทุน / กำไรจาก role user (P5)

ที่มา: `docs/saas-plan.md` หัวข้อ 17 แถว 22 + ข้อตัดสินใจ P5 ("ไม่ซ่อนก่อน SaaS — ทำพร้อม role ใหม่: ตัด `cost` / `avgCost` / COGS ที่ server สำหรับ user")
และคำตอบตอนวางแผนขั้น 6 (2026-10-18): "เลื่อนเป็นงานแยกหลังขั้น 6"

### ต้องถามผู้ใช้ก่อนเริ่ม (อย่าเดา)

1. สิทธิ์ตายตัว (user ไม่เห็นทุนเลย) หรือ admin เปิด / ปิดได้ (เช่น ค่าตั้งใน `MenuAccess` / `CompanyInfo` "ผู้ใช้ทั่วไปเห็นทุน")
2. ทุนตอน**รับของ** (คนคุมคลังต้องกรอกทุนรับเข้า — P1 / แถว 12): user ยังกรอกทุนได้แต่ไม่เห็นทุนเฉลี่ย / มูลค่าคงคลัง หรือรับของแบบไม่ต้องกรอกทุน (ใช้ทุนมาตรฐาน / ทุนผู้จำหน่ายหลัก)
3. SKU form (user เพิ่ม / แก้ SKU ได้ — P1): ช่องทุนมาตรฐาน + ราคาซื้อผู้จำหน่ายซ่อน / อ่านอย่างเดียว / ยังแก้ได้
4. ราคาต่ำกว่าทุน: POS ส่วนลดพิเศษเตือน "ต่ำกว่าทุน" (`priceCart()` / discount dialog) — user ยังเห็นคำเตือนแบบไม่บอกตัวเลขหรือไม่
5. Excel export (SKU / คลัง / ใบรับ): ตัดคอลัมน์ทุนออกสำหรับ user หรือห้าม user export
6. ใบโอน: E31 พิมพ์ไม่มีทุนอยู่แล้ว, หน้าจอแสดงทุนเฉพาะ admin อยู่แล้ว — ยืนยันว่าไม่ต้องเปลี่ยน

### จุดที่เกี่ยว (สำรวจ 2026-10-18 — grep `avgCost|effectiveCost|costValue|marginPercent|grossProfit|cogs|ทุน|กำไร`)

- **server (mock)**: field ทุนใน response — `Product.cost` / `avgCost` / `suppliers[].cost`, `SerialNumber.cost`, `StockMovement` (unitCost / value / ยอดคงเหลือมูลค่า),
  `SaleLine` COGS, `BranchStockRow.avgCost` (**E14 ส่ง null ให้ non-admin แล้ว** — ใช้เป็นแบบ), `Transfer` / `TransferLine.unitCost`, credit note / exchange `costIn` / `costOut`
  → ทำ helper เดียวใน mock (เช่น `withoutCost(body)` ตาม role) แทนการแก้ทีละ handler; ค่าที่ซ่อน = `null` (ไม่ละ field, B24) แล้วหน้าจอต้องรับ `null`
- **หน้าจอ (40 ไฟล์)**: inventory (product-list, stock-card, branch-stock, receive-import, dialogs รับ / ตัด / serial, `inventory-excel.ts`, `receive-excel.ts`),
  sku (sku-form, sku-detail, `sku-excel.ts`), pricing (price-overview, sku-prices, price-form-dialog — margin), promotions (promotion-preview, promotion-form — margin / ทุนของแถม),
  sales (sale-list `summarizeSales()` กำไรขั้นต้น, sale-detail ทุน / กำไรต่อบรรทัด, void-dialog), transfers (transfer-form / detail), dashboard (ไม่มีตัวเลขทุน — E19)
  → ใช้ `AuthService` signal เดียว (เช่น `canSeeCost`) inline ใน AuthService (initial bundle) ห้าม import model
- **กฎคำนวณ**: ไม่เปลี่ยนสูตร (`priceCart()`, `movingAverage()`, `buildStockCard()`) — แค่ซ่อนผล → golden fixtures ไม่ควรเปลี่ยน; ถ้าเปลี่ยนต้อง `npm run fixtures` + case ใหม่
- **docs**: `docs/saas-plan.md` หัวข้อ 17 (แถว 22 / P5 → ทำแล้ว), CLAUDE.md Permissions ("cost / profit stay visible until SaaS"), `api-contract.md` หัวข้อสิทธิ์,
  `data-model.md` (ไม่เปลี่ยน), ข้อตัดสินใจใหม่ต่อจาก E41 ใน `docs/decisions.md`

### คำตอบ (2026-10-18)

1. admin เปิด / ปิดได้: `CompanyInfo.staffSeeCost` ค่าเริ่มต้น = ไม่เห็น · 2. รับของ: กรอกทุนได้ แต่ไม่มีค่าเริ่มต้นจากทุนที่ซ่อน และไม่เห็นทุนเฉลี่ย / มูลค่า ·
2. SKU form: ซ่อนช่องทุน + server คงค่าเดิม · 4. POS: ยังเตือนต่ำกว่าทุนแบบไม่บอกตัวเลข · 5. Excel: ตัดคอลัมน์ทุน · 6. ใบโอน: หน้าจอใช้สิทธิ์เดียวกัน + server ตัด `unitCost`
   — แผนละเอียด / ข้อตัดสินใจ E43–E46 ใน `docs/decisions.md`

### ขั้นย่อย

- **B1** ✅ 2026-10-18 กติกา + server (`cost-visibility.model.ts`, `hideCost()` ใน `tenantResponse()`, `withStoredCosts()`, `POST /sales/cost-check`, session `canSeeCost`, สวิตช์ในตั้งค่าบริษัท): helper ตัด field ทุนตาม role ใน mock, spec ว่า user ได้ `null` ทุก endpoint ที่มีทุน, admin ได้เหมือนเดิม
- **B2** ✅ 2026-10-18 หน้าจอคลัง + SKU + Excel (รายการคลัง, บัตรสต็อกเหลือแต่จำนวน, สต็อกทุกสาขา, ประวัติ Serial, แนะนำสั่งซื้อ, dialog รับ / serial ไม่มีทุนตั้งต้น, นำเข้าใบรับต้องกรอกทุน, export คลัง / SKU ไม่มีคอลัมน์ทุน, ฟอร์ม / หน้ารายละเอียด SKU; dialog ตัดสต็อกเป็นของ admin อยู่แล้ว)
- **B3** ✅ 2026-10-18 หน้าจอราคา / โปร (ทุน / margin / ต่ำกว่าทุนในตัวอย่างโปร) + การขาย (การ์ดกำไรขั้นต้น, ทุน / กำไรในหน้าบิล) + ใบโอน (`canSeeCost`) + POS ถาม `POST /sales/cost-check` (`PosStore.warnings`); dialog ราคาเป็นของ admin อยู่แล้ว —
- **B4** ทดสอบบนหน้าจอ (`somchai` เปิดเมนูคลัง / SKU ชั่วคราวผ่าน `/users/menu-access` แล้วคืนค่า) + docs

---

## C. ส่งต่อหลังบ้าน (repo อื่น)

ลำดับ **db → api → web** ตาม `docs/backend/README.md` — repo นี้เป็น spec (`api-contract.md`, `domain-rules.md`, `data-model.md`, `fixtures/`)

- **db**: schema PostgreSQL ทุกตารางมี `tenant_id` + RLS (D7), ตาราง platform ไม่อยู่ใต้ RLS: `companies` (+ แพ็กเกจ, ตารางเก็บเงิน, คำขอลบ), `billing_invoices`,
  `platform_admins`, `password_reset_tokens`; `audit_log` insert-only; seed ตรงกับ mock (DEMO, HQ + BN, `admin` / `admin`, `somchai` / `1234`)
- **api**: Spring Boot port กฎใน `domain-rules.md` ให้ผ่าน `fixtures/*.json`; platform ใช้ DB role แยก; export / ลบบริษัทเป็น job; จำกัด login ผิดต่อบัญชี / IP; ส่งอีเมลจริง (แทน outbox ของ mock)
- **web**: serve `dist/frontend-an22/browser` + proxy `/api` (`deploy/`)
- เปิด session ใน repo นั้นพร้อม `--add-dir ../FrontEnd-An22`; ถ้าหลังบ้านเจอ spec ไม่ชัด → แก้เอกสาร / mock ใน repo นี้ก่อน

## เลื่อนไว้ / รอคนอื่น (ไม่อยู่ในแผนนี้)

- รอนักบัญชี: หัวข้อภาษี (saas-plan หัวข้อ 5), ทุนโอน (หัวข้อ 11 ข้อ 2), ระยะเก็บเอกสารภาษีก่อนลบบริษัท (E39)
- ทำทีหลัง: subdomain (D4), payment gateway, import ข้อมูลบริษัทกลับ / export แบบ Excel, รายงานยื่นภาษีรวม (`vatFilingCombined`), รายงานภาษีซื้อ, จำกัดเมนูตามแพ็กเกจ

---

## ข้อความเริ่ม session ใหม่ (คัดลอกไปวาง)

```
ทำงานต่อตาม docs/next-steps-plan.md — ทำหัวข้อ A ก่อน แล้วต่อหัวข้อ B (P5 ซ่อนทุน / กำไรจาก role user)
ทำฝั่งหน้าบ้าน + mock ใน repo นี้ บน branch feature/step5 (หรือ branch ใหม่ถ้า A4 รวมแล้ว)

อ่านก่อนเริ่ม: CLAUDE.md (โดยเฉพาะ Permissions, Data flow, Gotchas เรื่อง initial bundle), docs/next-steps-plan.md,
docs/saas-plan.md หัวข้อ 9 (ขั้น 6 + ข้อสังเกต) และ 17 (ตารางสิทธิ์ / P5), docs/decisions.md, docs/backend/*.md

วิธีทำ:
- A1 / A4 / ปิดกะค้าง / ลบ ACME — ถามฉันก่อนทุกข้อ
- หัวข้อ B: เข้า plan mode ก่อน สำรวจจุดที่แสดงทุนตามรายการในแผน แล้วถามคำถาม 6 ข้อในแผน (อย่าเดา) ก่อนเสนอขั้นย่อย
- ระวัง initial bundle (budget 600 kB, ตอนนี้ ~546.6 kB): โค้ดที่โหลดตอนเริ่มห้าม import ค่าจาก barrel @core/models
- ทุกขั้นย่อย: build + test + lint ผ่าน, prettier เฉพาะไฟล์ที่แก้, อัปเดต docs/backend/*.md + CLAUDE.md + ความคืบหน้า + ข้อตัดสินใจใหม่ (ต่อจาก E41), commit
- จบแต่ละหัวข้อ: ทดสอบบนหน้าจอจริง (npm start, ไม่ล้าง mock db, stub window.print) — DEMO ยัง login ได้, console สะอาด
- ถาม / ตอบ / เขียนแผนเป็นภาษาไทย
```
