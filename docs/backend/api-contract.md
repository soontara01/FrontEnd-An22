# API contract (ปัจจุบัน: ร้านเดียว)

แหล่งอ้างอิง: mock `src/app/core/interceptors/mock-backend.interceptor.ts` (+ spec) · รูปร่าง body = interface ใน
`src/app/core/models/*.model.ts` (ชื่อในวงเล็บ `Type` ด้านล่าง) · กฎตรวจ = ฟังก์ชันใน `domain-rules.md`

การเปลี่ยนแปลงตาม SaaS (`docs/saas-plan.md` หัวข้อ 2, 7) ระบุไว้ท้ายไฟล์ — ยังไม่ทำ

## ข้อตกลงทั่วไป

- base path `/api` (หน้าบ้าน `environment.apiUrl`; dev proxy `proxy.conf.json` → `http://localhost:8080`) — path ในไฟล์นี้ไม่รวม `/api`
- JSON ทั้งขาเข้าและขาออก, UTF-8, ชื่อ field camelCase ตรงกับ TypeScript
- **ห้ามละ field ที่เป็น `null`** — ส่ง `"x": null` เสมอ (B24: หน้าบ้านบางจุดเทียบ `=== null`; บรรทัดบิลที่ไม่มี
  `freeOfPromotionId` เคยถูกนับเป็นของแถม) — field ใหม่ที่ข้อมูลเก่าไม่มี หน้าบ้านเติม default ผ่าน `normalizeSale()` / `normalizeShift()` ฯลฯ
- เงิน: number บาท ทศนิยมไม่เกิน 2 ตำแหน่ง, ราคาขายรวม VAT, ต้นทุนไม่รวม VAT
- เวลา (`date`, `openedAt`, `at`, …): ISO-8601 พร้อม offset / `Z` · วันที่ธุรกิจ (`startDate`, `?from`, `?to`, `?month`):
  `YYYY-MM-DD` / `YYYY-MM` **ตามเวลาท้องถิ่น Asia/Bangkok** ทั้งสองปลายนับรวม — "วันขาย" ของบิล = วันท้องถิ่นของ `Sale.date`
- id เป็นตัวเลข (`number`) — เลขเครื่อง POS คือ id ของ `PosTerminal` (ผู้ใช้กำหนด ไม่ auto)
- DELETE สำเร็จ → `200` body `null` (หน้าบ้านไม่อ่าน body; `204` ก็ใช้ได้)

### Header ขาเข้า

| header                          | ใส่โดย                                          | ความหมาย                                                                              |
| ------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| `Authorization: Bearer <token>` | `authInterceptor` ทุก request ที่ login แล้ว    | token จาก `POST /auth/login`                                                          |
| `X-Terminal-Id: <n>`            | `terminalInterceptor` เมื่อเครื่องนี้ถูกตั้งไว้ | เลขเครื่อง POS ของอุปกรณ์ (ไม่มี = ไม่ใช่เครื่อง POS) — กะ, เลขบิล, POS ID ต่อเครื่อง |

### Error

ทุก error ตอบ `{ "message": "<ข้อความภาษาไทย>" }` — หน้าบ้าน (`errorInterceptor`) แสดง `message` เป็น snackbar ตรง ๆ
ข้อความให้ใช้ตามฟังก์ชันกฎ / mock (ผู้ใช้เห็นข้อความนี้)

| status | เมื่อไร                                                                                                                    |
| ------ | -------------------------------------------------------------------------------------------------------------------------- |
| 400    | ผิดกฎธุรกิจ / ข้อมูลไม่ถูกต้อง / login ผิดตอน `auth/verify` หรือผู้อนุมัติผิด                                              |
| 401    | token ไม่มี / ไม่รู้จัก / ผู้ใช้ถูกปิด — **ทุก endpoint ยกเว้น `POST /auth/login`, `POST /auth/verify`** → หน้าบ้าน logout |
| 403    | ไม่มีสิทธิ์ (หัวข้อ "สิทธิ์") — หน้าบ้านไม่ logout                                                                         |
| 404    | ไม่พบ record                                                                                                               |

`POST /auth/login` ผิด → 401 (หน้าบ้านยกเว้น path นี้ไม่ logout) · `POST /auth/verify` ผิด → **400 เสมอ** (ห้าม 401: จะ logout คนที่ยืนอยู่หน้าเครื่อง)

## สิทธิ์ (admin / user)

server เป็นผู้ตรวจ (`adminOnlyError()` ใน mock; ตารางเต็ม `docs/saas-plan.md` หัวข้อ 17) — non-admin ได้ **403**:

- ทุก `/users…`
- เขียน (ไม่ใช่ GET) ของ `/categories`, `/suppliers`, `/payment-methods` (รวม order), `/prices`, `/promotions`, `/pos-terminals`
- ตัดสต็อกออก: `PUT /products/:id/stock` ที่ `delta < 0`, `POST /products/:id/serials/remove`
- `POST /sales/:id/credit-notes`, `POST /sales/:id/tax-invoice/reissue`, `GET /tax-invoices`
- `PUT /settings/store`, `PUT /settings/menu-access`, `POST /shifts/:id/approve`, `POST /shifts/:id/adjustments`
- กะ: non-admin เห็น / นับ / ปิดได้เฉพาะ **กะของตัวเอง** (`GET /shifts` และ `variance-report` กรองให้, กะคนอื่น → 403;
  `shifts/current`, `shifts/last-float` เปิด)
- void: non-admin ต้องส่ง `approval { username, password }` ของ admin (ไม่ส่ง → 403, ผิด / ไม่ใช่ admin → 400)

## Endpoints

### Auth / settings

| method + path               | body → response                                           | หมายเหตุ                                                          |
| --------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| `POST /auth/login`          | `LoginRequest { username, password }` → `{ token, user }` | ผิด → 401; ผู้ใช้ถูกปิด → 401                                     |
| `POST /auth/verify`         | `{ username, password }` → `{ user }`                     | ตรวจรหัสโดยไม่สร้าง session (ปลดล็อก POS, ผู้อนุมัติ) — ผิด → 400 |
| `GET /settings/store`       | → `StoreInfo`                                             |                                                                   |
| `PUT /settings/store`       | `StoreInfo` → `StoreInfo`                                 | admin; `storeInfoError()`, `requireShiftChangeError()` → 400      |
| `GET /settings/menu-access` | → `MenuAccess { userMenus }`                              | ผู้ใช้ทุกคน                                                       |
| `PUT /settings/menu-access` | `MenuAccess` → `MenuAccess`                               | admin; `menuAccessError()`                                        |

### Users (admin เท่านั้น)

`GET /users` → `User[]` · `POST /users` (`UserPayload`) · `GET/PUT/DELETE /users/:id` — `userChangeError()`
(ลด / ปิด / ลบตัวเองไม่ได้, ต้องเหลือ admin ที่ใช้งาน ≥ 1) และ `userIdentityError()` → 400 (B5 ปิด 2026-10-16):
`username` บังคับ `a-z 0-9 . _ -` 3–30 ตัว เก็บตัวเล็ก ไม่ซ้ำในบริษัท (ไม่สนตัวพิมพ์); `email` ไม่บังคับ (`""` = ไม่มี) ถ้ามีต้องถูกรูปแบบและไม่ซ้ำ

### SKU / สต็อก

| method + path                       | body → response                                                  | หมายเหตุ                                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `GET /products`                     | → `Product[]`                                                    | `currentPrice`, `avgCost`, `categoryPath`, `stock` เป็นค่าที่ server คำนวณ                                                        |
| `POST /products`                    | `ProductPayload` → `Product`                                     | ไม่รับ `stock` / `avgCost` / `currentPrice` / `categoryPath` (ทิ้ง); กฎ SKU ใน `domain-rules.md`                                  |
| `GET/PUT/DELETE /products/:id`      |                                                                  | PUT ห้ามเปลี่ยน `serialControl` / `itemType` เมื่อ stock > 0; DELETE: stock > 0 / มีการขาย / อยู่ในโปรที่ยังไม่หมดอายุ → 400      |
| `PUT /products/:id/stock`           | `{ delta, unitCost?, note? }` → `Product`                        | non-serial, non-service; `delta` จำนวนเต็ม ≠ 0 (หน่วยฐาน); รับเข้าต้องมี `unitCost` → ทุนเฉลี่ยใหม่; ติดลบไม่ได้; `delta<0` admin |
| `GET /products/:id/movements`       | `?from=&to=` → `StockCardResult`                                 | `buildStockCard()`; from > to → 400                                                                                               |
| `GET /products/:id/serials`         | → `SerialNumber[]`                                               |                                                                                                                                   |
| `POST /products/:id/serials`        | `{ serials: string[], unitCost, note? }` → `SerialReceiveResult` | `serialFormatError()`, ซ้ำ / อยู่ในคลังแล้ว → 400; serial ที่เคยตัดออก = ใช้ record เดิม (B18)                                    |
| `POST /products/:id/serials/remove` | `{ ids, status, note }` → `Product`                              | admin; `status` = sold / damaged / other; ไม่ลบ record                                                                            |

รับเข้าไม่ได้เมื่อ `canPurchase()` เป็นเท็จ (`no_sale` ขายไม่ได้, `no_purchase` / `discontinued` รับไม่ได้)

### ข้อมูลหลัก

| resource        | endpoints                                                                                            | หมายเหตุ                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Category`      | `GET/POST /categories`, `PUT/DELETE /categories/:id`                                                 | 3 ระดับ; ลบได้เมื่อไม่มีลูก / SKU / โปรอ้าง; หมวดที่มี SKU แตกหมวดย่อยไม่ได้; `productCount` server คำนวณ                     |
| `Supplier`      | `GET/POST /suppliers`, `GET/PUT/DELETE /suppliers/:id`                                               | `isValidThaiTaxId()`; ไม่ซ้ำ code และ taxId+สาขา; ลบไม่ได้เมื่อผูก SKU                                                        |
| `SkuPrice`      | `GET /prices[?productId=]`, `POST /prices`, `PUT/DELETE /prices/:id`                                 | ช่วงของ SKU เดียวกันห้ามทับ (`findOverlap()`) → 400                                                                           |
| `Promotion`     | `GET/POST /promotions`, `GET/PUT/DELETE /promotions/:id`                                             | `promotionError()`; เริ่มแล้วแก้ได้บางช่อง, ลบไม่ได้                                                                          |
| `PaymentMethod` | `GET/POST /payment-methods`, `PUT/DELETE /payment-methods/:id`, `PUT /payment-methods/order { ids }` | GET เรียงตาม `sortOrder`; `paymentMethodError()`; เงินสดที่ใช้งานต้องเหลือ ≥ 1; มีการขายอ้าง → ลบไม่ได้; order ต้องส่ง id ครบ |
| `PosTerminal`   | `GET/POST /pos-terminals`, `PUT/DELETE /pos-terminals/:id`                                           | `posTerminalError()`; id เปลี่ยนไม่ได้; มีกะเปิด → ปิดใช้งานไม่ได้; มีกะ / เอกสารอ้าง → ลบไม่ได้                              |

### การขาย

| method + path                         | body → response                              | หมายเหตุ                                                                                                                                                                                                |
| ------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /sales`                          | `?from=&to=&shiftId=` → `Sale[]`             | ตามวันขาย, ใหม่ก่อน; `shiftId` = ขายหรือ void ในกะนั้น; `returnStatus` / `creditedTotal` / `creditNoteNos` / `exchangeNos` คำนวณทุกครั้งที่อ่าน                                                         |
| `GET /sales/:id`                      | → `Sale`                                     |                                                                                                                                                                                                         |
| `POST /sales`                         | `SalePayload` → `Sale`                       | ลำดับตรวจด้านล่าง                                                                                                                                                                                       |
| `POST /sales/:id/void`                | `VoidPayload { reason, approval? }` → `Sale` | `voidError()` (วันเดียวกับวันขายเท่านั้น), `shiftBlocker('void')`; คืนสต็อกที่ COGS ของบรรทัด, serial กลับเข้าคลัง (`currentSerial()`); ยกเลิกใบกำกับเต็มรูป; `voidedBy` / `voidApprovedBy` server ตั้ง |
| `PUT /sales/:id/status`               | `{ status }` → `Sale`                        | เฉพาะออร์เดอร์ก่อน POS (ไม่มี lines); บิล POS → 400                                                                                                                                                     |
| `GET/POST /sales/:id/credit-notes`    | `CreditNotePayload` → `CreditNote`           | admin; `creditNoteError()` / `draftCreditNote()`, `shiftBlocker('refund')`; เลข `CN-YYYYMMDD-NNNN`                                                                                                      |
| `GET /credit-notes`                   | `?from=&to=&shiftId=` → `CreditNote[]`       |                                                                                                                                                                                                         |
| `GET/POST /sales/:id/exchanges`       | `ExchangePayload` → `Exchange`               | `exchangeError()`; serial ใหม่ต้องอยู่ในคลัง; ไม่ต้องมีกะ; เลข `EX-YYYYMMDD-NNNN`                                                                                                                       |
| `GET /sales/:id/tax-invoice`          | → `TaxInvoice \| null`                       | ใบที่ยังใช้ได้ (`currentInvoice()`)                                                                                                                                                                     |
| `POST /sales/:id/tax-invoice`         | `{ buyer }` → `TaxInvoice`                   | `taxInvoiceError()`; ลงวันที่ / เลขตาม **วันขาย** `INV-<วันขาย>-NNNN`                                                                                                                                   |
| `GET /sales/:id/tax-invoices`         | → `TaxInvoice[]`                             | ทุกใบ เก่าก่อน                                                                                                                                                                                          |
| `POST /sales/:id/tax-invoice/reissue` | `{ buyer, reason }` → `TaxInvoice`           | admin; `reissueError()`; ใบเก่าได้ `cancelledAt` / `replacedByNo`                                                                                                                                       |
| `GET /tax-invoices`                   | `?from=&to=` → `TaxInvoice[]`                | admin; ตามวันที่ใบกำกับ เก่าก่อน (รายงานภาษีขาย)                                                                                                                                                        |
| `GET /tax-invoices/buyer`             | `?taxId=` → `TaxInvoiceBuyer \| null`        | ผู้ซื้อล่าสุดที่ใช้เลขนี้                                                                                                                                                                               |

**`POST /sales` ตรวจตามลำดับ (ไม่เปลี่ยนอะไรจนกว่าผ่านหมด):**

1. `terminalError(X-Terminal-Id)` — ต้องเป็นเครื่องที่ลงทะเบียนและใช้งานอยู่
2. `shiftBlocker('sell')` — ต้องมีกะเปิดของเครื่องนี้และผู้ขายเป็นเจ้าของกะ (เมื่อ `requireShift`)
3. `priceCart(items, { products, promotions, categories, date: วันนี้, vatRegistered }, freeSerials, billManualDiscount)` แล้ว `cartError()`
4. `manualDiscountError()` (เหตุผล, เพดาน % ของ staff)
5. serial ทุกบรรทัดต้อง `in_stock` และเป็นของ SKU นั้น
6. `expectedTotal` ≠ `cart.total` → 400 "ราคาหรือโปรโมชั่นมีการเปลี่ยนแปลง…"
7. `paymentError(total, payments, methods)` แล้ว `paymentSummary()` (เงินทอน, ปัดเศษ)
8. `buyer` (ถ้ามี) → `checkoutBuyerError()` แล้วออกใบกำกับเต็มรูปพร้อมบิล (`atSale: true`)

จากนั้น: เลข `POS<เครื่อง>-YYYYMMDD-NNNN`, ตัดสต็อกทีละบรรทัดพร้อม COGS (serial = ทุนของเครื่องนั้น, อื่น = `avgCost` ขณะนั้น,
บริการ = `cost`), snapshot `terminalId` / `posId` / `vatRegistered` / `shiftId` / `cashier`

### กะ (เครื่อง = `X-Terminal-Id`)

| method + path                       | body → response                              | หมายเหตุ                                                                                                           |
| ----------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET /shifts/current`               | → `Shift \| null`                            | กะเปิดของเครื่องนี้                                                                                                |
| `POST /shifts/open`                 | `ShiftOpenPayload` → `Shift`                 | `terminalError()`, `openShiftError()`; body `terminalId` ต่างจาก header → 400; เลข `SH-YYYYMMDD-NNNN`              |
| `GET /shifts`                       | `?from=&to=&openOnly=1` → `Shift[]`          | ตามวันเปิดกะ; non-admin เฉพาะของตัวเอง; มี `adjustmentTotal`                                                       |
| `GET /shifts/last-float`            | → `{ floatLeft }`                            | กะปิดล่าสุดของเครื่องนี้                                                                                           |
| `GET /shifts/variance-report`       | `?from=&to=` → `VarianceReportRow[]`         | `varianceReport()`                                                                                                 |
| `GET /shifts/:id`                   | → `Shift`                                    |                                                                                                                    |
| `GET /shifts/:id/summary`           | → `ShiftSummary`                             | `shiftSummary()`; `lines` (ยอด) เฉพาะ admin หรือกะที่ปิดแล้ว — **blind count**                                     |
| `GET /shifts/:id/movements`         | → `CashMovement[]`                           |                                                                                                                    |
| `POST /shifts/:id/cash-movements`   | `CashMovementPayload` → `CashMovement`       | กะเปิดที่เครื่องนี้; `shiftBlocker('cash_movement')`, `cashMovementError()` (บอกยอดคาดเฉพาะ admin)                 |
| `GET/POST /shifts/:id/drawer-opens` | `{ reason }` → `DrawerOpen`                  | `shiftBlocker('drawer_open')`, `drawerOpenError()`                                                                 |
| `POST /shifts/:id/count-check`      | `{ counts }` → `CountCheckResult`            | `countInputsError()`, `countCheck()`; mock ไม่บันทึกอะไร — api จริงควร log การนับครั้งแรก; ไม่ตรวจ `X-Terminal-Id` |
| `POST /shifts/:id/close`            | `ShiftClosePayload` → `Shift`                | `closeShiftError()`; `approval` ผิด / ไม่ใช่ admin → 400; ไม่ตรวจ `X-Terminal-Id` (admin ปิดแทนได้)                |
| `POST /shifts/:id/approve`          | → `Shift`                                    | admin; เฉพาะ `pending`                                                                                             |
| `GET/POST /shifts/:id/adjustments`  | `ShiftAdjustmentPayload` → `ShiftAdjustment` | admin; `shiftAdjustmentError()`; กะปิดแล้วเท่านั้น, ไม่แก้ยอดนับเดิม                                               |

`POST /sales`, void, ใบลดหนี้ → 400 ตาม `shiftBlocker()` เมื่อ `StoreInfo.requireShift` เปิด

## ที่จะเปลี่ยนตาม SaaS (ยังไม่ทำ — `docs/saas-plan.md`)

- JWT claims: `sub` (userId), `tenantId`, `role`, `branchIds` หรือ `allBranches: true` — **tenant มาจาก token เท่านั้น** ห้ามรับจาก URL / query / body
- header ใหม่ `X-Branch-Id` ทุก request; server ตรวจสิทธิ์สาขา (ไม่อยู่ในสิทธิ์ → 403)
- `POST /auth/login { companyCode, username, password }` → `{ token, user, company, branches }`; `GET /me`
- รายงานรับ `?branchId=<id>|all`; endpoint ใหม่ `/branches`, `/settings/company`, `/settings/branch`, `/products/:id/branch-stock`, `/transfers`
- role ใหม่ `owner`, `platform_admin`; เลขเอกสารมีรหัสสาขา (หัวข้อ 3 ของ saas-plan)
