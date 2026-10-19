# แผนงานถัดไปหลัง SaaS ขั้น 6 (เริ่ม 2026-10-18)

สถานะ: **A + B เสร็จ** 2026-10-18 (PR #3, #4, fix #5 merge แล้ว) — ต่อไป C: web → api (E47, หลังบ้านเหลือ 2 repo)
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
- **B4** ✅ 2026-10-18 ทดสอบบนหน้าจอ (ไม่ล้าง mock db; เปิดเมนูคลัง / โอน / SKU / ราคา / โปรให้ user ชั่วคราวแล้วคืนเป็น 4 เมนูเดิม): `somchai` (ค่าตั้งปิด) — รายการคลังไม่มีการ์ดมูลค่าทุน / คอลัมน์ทุน, บัตรสต็อกเหลือแต่จำนวน, รับเข้า MS-010 ช่องทุนว่าง + "กรุณากรอกต้นทุน" ไม่เห็นทุนเฉลี่ย → กรอก 280 รับได้ (snackbar ไม่มีทุน), ฟอร์ม / หน้ารายละเอียด SKU ไม่มีทุน / กำไร / ราคาซื้อ → แก้ยี่ห้อแล้ว db ยังเก็บทุน 350 / ราคาซื้อ 330 (admin เห็นค่าเดิม), หน้าราคา / ราคาตาม SKU / ตัวอย่างโปร 1 และ 3 / รายการบิล / หน้าบิล / ใบโอนไม่มีทุน กำไร; POS: NB-001 + ส่วนลดท้ายบิล 20% (ยกเพดานพนักงานเป็น 30% ชั่วคราวแล้วคืน 5%) → "NB-001 ขายต่ำกว่าทุนหลังส่วนลดพิเศษ" มาจาก `POST /sales/cost-check` ไม่มีตัวเลข; admin เปิดค่าตั้ง → somchai login ใหม่เห็นการ์ดมูลค่าทุน + คอลัมน์ทุนเฉลี่ย (280) แล้วปิดค่าตั้งคืน; console สะอาด (มีแค่ View Transition ถูกยกเลิกเพราะขนาดหน้าต่างเปลี่ยนตอนใช้เครื่องมือเบราว์เซอร์ — ไม่ใช่โค้ดแอป) · ข้อมูลที่เหลือจากการทดสอบ: MS-010 ที่ HQ +1 ชิ้นทุน 280

---

## หลัง B — bug ใน mock (2026-10-18)

- **สต็อกสาขาถูกล้างเมื่อ platform เขียนข้อมูลบริษัท**: `withTenantDb()` (ตั้งรหัส owner, ระงับ / เปิดกลับ, เปลี่ยนแพ็กเกจ, รับชำระ …) และลิงก์ตั้งรหัสผ่านบันทึก db ที่ไม่ได้ project สต็อก
  แล้ว `storeBranchStock()` เขียนค่า 0 ทับ `branchStock` ของสาขาที่ request ก่อนหน้าทำงาน (ตัวแปร `stockBranch` ค้าง) → SKU ไม่คุม serial ของสาขานั้นเหลือ 0 ทั้งสต็อก ทุนเฉลี่ย จุดสั่งซื้อ (serial ไม่โดน — นับจาก serial)
  — เจอจากบัตรสต็อก MS-010 ที่ HQ ไม่ตรงกับรายการคลัง (B4); แก้: `saveTenantDb(…, branch)` รับสาขาที่ project จริง, `null` = ไม่แตะ `branchStock`; spec ใน platform admin; เป็นเรื่องของ mock เท่านั้น (api จริงไม่มีการ project)

## หลังทดสอบรอบสุดท้าย (2026-10-18 / 19)

- ทดสอบทุกหน้าจอบนข้อมูล seed สะอาด: `docs/test-final.md` — ✅ 95 / ❌ 0 / ⚠️ 9 / ⏭️ 2
- แก้ข้อสังเกต F-B1, F-B2, F-B4–F-B9 แล้ว 2026-10-19 (branch `fix/final-test-notes`); F-B10 ไม่ต้องแก้ (log ของ Angular โหมด dev);
  **F-B3** (ใบลดหนี้คืนเงินสดไม่ปัดตาม `cashRounding` → ยอดเงินสดในกะนับด้วยเหรียญจริงไม่ได้) เข้ารายการรอนักบัญชีด้านล่าง

## C. ส่งต่อหลังบ้าน (repo อื่น — E47)

**2 repo, ลำดับ web → api** (`docs/backend/README.md`) — repo นี้เป็น spec (`api-contract.md`, `domain-rules.md`, `data-model.md`, `fixtures/`);
เปิด session ใน repo นั้นพร้อม `--add-dir ../FrontEnd-An22`; ถ้าหลังบ้านเจอ spec ไม่ชัด → แก้เอกสาร / mock ใน repo นี้ก่อน (บอกผู้ใช้ก่อน)

- **C1 web** (`~/vscode/an22-web`): Node.js serve `dist/frontend-an22/browser` + SPA fallback + cache header + proxy `/api` (ตัวอย่าง `deploy/`);
  ทดสอบได้ทันทีด้วย build ปัจจุบัน (`useMock: true` — mock ในเบราว์เซอร์)
- **C2 api** (`~/vscode/an22-api`): Spring Boot + PostgreSQL, **schema เป็น Flyway migration ใน repo นี้** (แทน repo db เดิม):
  ทุกตารางมี `tenant_id` + RLS (D7), ตาราง platform ไม่อยู่ใต้ RLS (`companies` + แพ็กเกจ / ตารางเก็บเงิน / คำขอลบ, `billing_invoices`, `platform_admins`, `password_reset_tokens`) และใช้ DB role แยก,
  `audit_log` insert-only, seed ตรงกับ mock (DEMO, HQ + BN, `admin` / `admin`, `somchai` / `1234`);
  port กฎใน `domain-rules.md` ให้ผ่าน `fixtures/*.json`; export / ลบบริษัทเป็น job; จำกัด login ผิดต่อบัญชี / IP; ส่งอีเมลจริง (แทน outbox ของ mock)
- **C3** สลับหน้าบ้านไป api จริง (`useMock: false`) เมื่อ api ตอบครบ — ทดสอบตาม `docs/test-plan.md` / ผลทดสอบของแต่ละขั้นใน `saas-plan.md`

## เลื่อนไว้ / รอคนอื่น (ไม่อยู่ในแผนนี้)

- รอนักบัญชี: หัวข้อภาษี (saas-plan หัวข้อ 5), ทุนโอน (หัวข้อ 11 ข้อ 2), ระยะเก็บเอกสารภาษีก่อนลบบริษัท (E39), การปัดเศษเงินสดตอนคืนเงิน / ยกเลิกบิล (F-B3, `test-final.md`)
- ทำทีหลัง: subdomain (D4), payment gateway, import ข้อมูลบริษัทกลับ / export แบบ Excel, รายงานยื่นภาษีรวม (`vatFilingCombined`), รายงานภาษีซื้อ, จำกัดเมนูตามแพ็กเกจ

---

## ข้อความเริ่ม session ใหม่ (คัดลอกไปวาง)

**C1 web** — สร้าง repo ก่อน: `mkdir ~/vscode/an22-web && cd ~/vscode/an22-web && git init && claude --add-dir ../FrontEnd-An22`

```
เริ่มหัวข้อ C1 ของ ../FrontEnd-An22/docs/next-steps-plan.md — ทำ repo web (Node.js) ใน repo นี้ (ยังว่าง)
repo FrontEnd-An22 เป็น spec ของหลังบ้าน (มี 2 repo: web แล้ว api — E47)

อ่านก่อนเริ่ม: ../FrontEnd-An22/docs/backend/README.md (หัวข้อ web), ../FrontEnd-An22/deploy/nginx.conf และ web.config (ตัวอย่าง),
../FrontEnd-An22/CLAUDE.md หัวข้อ "SPA per menu" และ "Switching to a real backend"

วิธีทำ:
- เข้า plan mode ก่อน: เสนอเวอร์ชัน Node / framework (เช่น Node 24 + Express หรือ Fastify หรือไม่ใช้ framework), โครงไฟล์, วิธีรับไฟล์ build ของหน้าบ้าน,
  config (port, ที่อยู่ api, path ของ dist) และวิธี deploy — ถามฉันก่อนเลือก (อย่าเดา)
- ต้องมี: serve dist/frontend-an22/browser, SPA fallback → index.html, index.html no-cache / ไฟล์ที่มี hash cache ยาว immutable, proxy /api → api,
  ไม่ส่งต่อ path แปลก ๆ ออกนอก dist, log + health check
- สร้าง CLAUDE.md ของ repo นี้ + test อัตโนมัติ (fallback, cache header, proxy ด้วย api ปลอม)
- ทดสอบกับ build จริง: cd ../FrontEnd-An22 && npm run build (ตอนนี้ใช้ mock ในเบราว์เซอร์ จึงใช้งานได้ครบโดยไม่มี api) — เปิดในเบราว์เซอร์ login DEMO ได้, เปลี่ยนเมนู (full reload) ได้, console สะอาด
- ถ้า spec ต้องแก้ ให้บอกฉันก่อน แล้วค่อยแก้ใน ../FrontEnd-An22; commit ทุกขั้นย่อย, ห้าม push โดยไม่ถาม
- ถาม / ตอบ / เขียนแผนเป็นภาษาไทย
```

**C2 api** — หลัง C1: `mkdir ~/vscode/an22-api && cd ~/vscode/an22-api && git init && claude --add-dir ../FrontEnd-An22`

```
เริ่มหัวข้อ C2 ของ ../FrontEnd-An22/docs/next-steps-plan.md — ทำ repo api (Java Spring Boot + PostgreSQL) ใน repo นี้ (ยังว่าง)
repo นี้เป็นเจ้าของ schema ด้วย (Flyway migration — E47); repo FrontEnd-An22 เป็น spec: mock คือ reference implementation

อ่านก่อนเริ่ม: ../FrontEnd-An22/docs/backend/README.md (หัวข้อ api), api-contract.md, domain-rules.md, data-model.md, fixtures/README.md,
../FrontEnd-An22/docs/saas-plan.md หัวข้อ 2, 3, 16 (D7) และ 17 (สิทธิ์), ../FrontEnd-An22/docs/decisions.md, ../FrontEnd-An22/CLAUDE.md

วิธีทำ:
- เข้า plan mode ก่อน: สำรวจ data-model.md / api-contract.md ทั้งหมด แล้วเสนอเวอร์ชัน Java / Spring Boot, build tool, โครง package,
  วิธีรัน PostgreSQL local (docker compose / Testcontainers), auth (JWT) และลำดับขั้นย่อย (แนะนำ: schema + RLS + seed → auth / tenant / branch → SKU / สต็อก → POS / กฎคำนวณผ่าน fixtures → ...)
  — ถามฉันก่อนเลือกเครื่องมือ / เวอร์ชัน (อย่าเดา)
- สร้าง CLAUDE.md ของ repo นี้ตาม "สิ่งที่ CLAUDE.md ของแต่ละ repo ควรมี" ใน README
- schema: ทุกตารางข้อมูลมี tenant_id + RLS (D7), ตาราง platform ไม่อยู่ใต้ RLS + DB role แยก, audit_log insert-only, unique key รวม tenant_id,
  เงิน numeric(14,2), เวลา timestamptz; seed ตรงกับ mock (DEMO, HQ + BN, admin / admin, somchai / 1234, platform / platform); ห้าม ddl-auto
- กฎใน domain-rules.md port เป็น class แยก ทดสอบด้วย fixtures/*.json ให้ผลตรงทุกตัวเลข; ข้อความ error ภาษาไทยตาม mock
- spec ไม่ชัด → ถือพฤติกรรม mock (และ mock-backend.interceptor.spec.ts) เป็นคำตอบ; ถ้า spec ต้องแก้ ให้บอกฉันก่อน แล้วแก้ใน ../FrontEnd-An22 (docs + mock ใน commit เดียวกัน)
- ทุกขั้นย่อย: migrate บน DB ว่างผ่าน, test ผ่าน (รวม RLS: tenant หนึ่งมองไม่เห็นอีก tenant), commit; ห้าม push โดยไม่ถาม
- ถาม / ตอบ / เขียนแผนเป็นภาษาไทย
```
