# API contract (SaaS ขั้น 1: 1 บริษัท 1 สาขา)

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

| header                          | ใส่โดย                                          | ความหมาย                                                                                                                                                                                                                                                                                                         |
| ------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Authorization: Bearer <token>` | `authInterceptor` ทุก request ที่ login แล้ว    | token จาก `POST /auth/login` — JWT claims หัวข้อ "Token" ด้านล่าง                                                                                                                                                                                                                                                |
| `X-Terminal-Id: <n>`            | `terminalInterceptor` เมื่อเครื่องนี้ถูกตั้งไว้ | เลขเครื่อง POS ของอุปกรณ์ (ไม่มี = ไม่ใช่เครื่อง POS) — กะ, เลขบิล, POS ID ต่อเครื่อง                                                                                                                                                                                                                            |
| `X-Branch-Id: <id>`             | `branchInterceptor` เมื่อเลือกสาขาแล้ว          | สาขาที่ทำงานอยู่ — server ตรวจว่าเป็นสาขาที่ใช้งานอยู่และผู้ใช้เข้าได้ ไม่ใช่ → **403** "ไม่มีสิทธิ์ทำงานในสาขานี้" (ยกเว้น `GET /me`); ไม่ส่ง → การอ่านใช้สาขาแรก; งานเขียนที่แตะสต็อก / ขาย → **400** "ไม่ได้เลือกสาขา กรุณาเลือกสาขาที่ทำงานก่อน" (E2 / E17, ขั้น 3 — รายการในหัวข้อ SKU / สต็อก); กะรอขั้น 4 |

### Token (JWT)

claims: `sub` (userId), `tenantId` (companyId), `role`, `branchIds` หรือ `allBranches: true` (server ควรอ่านสิทธิ์สาขาจาก DB ทุก request ก็ได้ เพื่อให้แก้สิทธิ์มีผลทันที) ·
**tenant มาจาก token เท่านั้น** ห้ามรับจาก URL / query / body · ทุก request ตรวจว่าบริษัทยังใช้งานอยู่และผู้ใช้ยัง active
(ไม่ผ่าน → 401) · mock ใช้ token ปลอม `mock-jwt-token.t<companyId>.u<userId>` (`mockToken()`)

### Error

ทุก error ตอบ `{ "message": "<ข้อความภาษาไทย>" }` — หน้าบ้าน (`errorInterceptor`) แสดง `message` เป็น snackbar ตรง ๆ
ข้อความให้ใช้ตามฟังก์ชันกฎ / mock (ผู้ใช้เห็นข้อความนี้)

| status | เมื่อไร                                                                                                                    |
| ------ | -------------------------------------------------------------------------------------------------------------------------- |
| 400    | ผิดกฎธุรกิจ / ข้อมูลไม่ถูกต้อง / login ผิดตอน `auth/verify` หรือผู้อนุมัติผิด                                              |
| 401    | token ไม่มี / ไม่รู้จัก / ผู้ใช้ถูกปิด — **ทุก endpoint ยกเว้น `POST /auth/login`, `POST /auth/verify`** → หน้าบ้าน logout |
| 403    | ไม่มีสิทธิ์ (หัวข้อ "สิทธิ์") — หน้าบ้านไม่ logout                                                                         |
| 404    | ไม่พบ record                                                                                                               |

`POST /auth/login` ผิด → 401 (หน้าบ้านยกเว้น path นี้ไม่ logout) · token ที่ไม่มี tenant (ก่อน SaaS) หรือบริษัทถูกระงับ → 401 · `POST /auth/verify` ผิด → **400 เสมอ** (ห้าม 401: จะ logout คนที่ยืนอยู่หน้าเครื่อง)

## สิทธิ์ (admin / user)

server เป็นผู้ตรวจ (`adminOnlyError()` ใน mock; ตารางเต็ม `docs/saas-plan.md` หัวข้อ 17) — non-admin ได้ **403**:

- ทุก `/users…`
- เขียน (ไม่ใช่ GET) ของ `/categories`, `/suppliers`, `/payment-methods` (รวม order), `/prices`, `/promotions`, `/pos-terminals`
- ตัดสต็อกออก: `PUT /products/:id/stock` ที่ `delta < 0`, `POST /products/:id/serials/remove`
- `POST /sales/:id/credit-notes`, `POST /sales/:id/tax-invoice/reissue`, `GET /tax-invoices`
- `PUT /settings/store`, `PUT /settings/company`, `PUT /settings/branch`, เขียน `/branches`, `PUT /settings/menu-access`, `POST /shifts/:id/approve`, `POST /shifts/:id/adjustments`
- กะ: non-admin เห็น / นับ / ปิดได้เฉพาะ **กะของตัวเอง** (`GET /shifts` และ `variance-report` กรองให้, กะคนอื่น → 403;
  `shifts/current`, `shifts/last-float` เปิด)
- void: non-admin ต้องส่ง `approval { username, password }` ของ admin (ไม่ส่ง → 403, ผิด / ไม่ใช่ admin → 400)

## Endpoints

### Auth / settings

| method + path                          | body → response                                                                                         | หมายเหตุ                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /auth/login`                     | `LoginRequest { companyCode, username, password }` → `LoginResponse { token, user, company, branches }` | D4; ผิดทุกกรณี (รหัสบริษัท / ชื่อ / รหัสผ่าน / ผู้ใช้ถูกปิด) → 401 ข้อความเดียว "รหัสบริษัท ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง" (E3); บริษัทถูกระงับ → 401 "บริษัทนี้ถูกระงับการใช้งาน…" เฉพาะเมื่อรหัสผ่านถูก; `companyCode` ไม่สนตัวพิมพ์; `branches` = สาขาที่ใช้งานอยู่ที่ผู้ใช้เข้าได้ (`canWorkIn()`: `allBranches` หรืออยู่ใน `branchIds`) |
| `GET /me`                              | → `MeResponse { user, company, branches }`                                                              | session ปัจจุบันตาม token (ไม่ออก token ใหม่) — หน้าบ้านเรียกทุกครั้งที่โหลดหน้า + หน้าเลือกสาขา; **ไม่ตรวจ `X-Branch-Id`** (สาขาที่เครื่องจำไว้อาจหมดสิทธิ์แล้ว)                                                                                                                                                                                |
| `POST /auth/verify`                    | `{ username, password }` → `{ user }`                                                                   | ตรวจรหัสของผู้ใช้**ในบริษัทของ token** โดยไม่สร้าง session (ปลดล็อก POS, ผู้อนุมัติ) — ผิด / ไม่มี token / ผู้ใช้ถูกปิด → 400 ข้อความเดียว                                                                                                                                                                                                       |
| `GET /settings/store`                  | `?branchId=` → `StoreInfo`                                                                              | ค่าประกอบ `storeInfoOf(companyInfo, สาขา)` — สาขาใน `X-Branch-Id` (ไม่ส่ง = สาขาแรก) หรือ `?branchId=` = สาขาของเอกสารที่พิมพ์ (E22: ใบเสร็จ / ใบกำกับ / ใบลดหนี้ / ใบเปลี่ยน / Z พิมพ์ข้อมูลผู้ขายของสาขาที่ออกเอกสาร ไม่ใช่สาขาที่เปิดดู; สาขาไม่มี → 404) — เอกสาร / POS อ่านอันนี้ (E11, คงไว้ช่วงเปลี่ยนผ่าน)                               |
| `PUT /settings/store`                  | `StoreInfo` → `StoreInfo`                                                                               | ช่วงเปลี่ยนผ่าน: admin บริษัท (403); `storeInfoError()`, `requireShiftChangeError()` → 400; เขียนลง company + สาขาปัจจุบัน (เลขสาขาไม่เปลี่ยน)                                                                                                                                                                                                   |
| `GET /settings/company`                | → `CompanyInfo`                                                                                         | ผู้ใช้ทุกคน                                                                                                                                                                                                                                                                                                                                      |
| `PUT /settings/company`                | `CompanyInfo` → `CompanyInfo`                                                                           | admin บริษัท (E6, อื่น → 403); `companyInfoError()`, `requireShiftChangeError()` (มีกะเปิดสาขาใด → ปิดระบบกะไม่ได้)                                                                                                                                                                                                                              |
| `GET /settings/branch`                 | → `Branch`                                                                                              | สาขาปัจจุบัน (`X-Branch-Id`)                                                                                                                                                                                                                                                                                                                     |
| `PUT /settings/branch`                 | `BranchDetails { name, address, phone, receiptFooter }` → `Branch`                                      | admin ที่เข้าสาขานั้นได้ (สาขาอื่น → 403 จาก `X-Branch-Id`); `branchDetailsError()`; code / เลขสาขา / สถานะแก้ที่ `/branches`                                                                                                                                                                                                                    |
| `GET /branches` · `GET /branches/:id`  | → `Branch[]` / `Branch`                                                                                 | ผู้ใช้ทุกคน (ทุกสาขาของบริษัท รวมที่ปิด)                                                                                                                                                                                                                                                                                                         |
| `POST /branches` · `PUT /branches/:id` | `BranchPayload` → `Branch`                                                                              | admin บริษัท (403); `branchError()` (code / เลขสาขาไม่ซ้ำ, ต้องเหลือสาขาที่ใช้งาน ≥ 1; มีกะเปิดที่เครื่องของสาขา → ปิดใช้งานไม่ได้); `id` ใน body ไม่สนใจ; **ไม่มี DELETE** — ปิดใช้งานแทน                                                                                                                                                       |
| `GET /settings/menu-access`            | → `MenuAccess { userMenus }`                                                                            | ผู้ใช้ทุกคน                                                                                                                                                                                                                                                                                                                                      |
| `PUT /settings/menu-access`            | `MenuAccess` → `MenuAccess`                                                                             | admin; `menuAccessError()`                                                                                                                                                                                                                                                                                                                       |

### Users (admin เท่านั้น)

`GET /users` → `User[]` · `POST /users` (`NewUserPayload` = `UserPayload` + `password`) · `GET/PUT/DELETE /users/:id` ·
`PUT /users/:id/password { password }` → `null` (admin ตั้งรหัสใหม่ให้, E10) — ไม่มี endpoint ไหนคืน `password`

- `userChangeError()` → 400 (ลด / ปิด / ลบตัวเองไม่ได้, ต้องเหลือ admin ที่ใช้งาน ≥ 1)
- `userIdentityError()` → 400 (B5): `username` บังคับ `a-z 0-9 . _ -` 3–30 ตัว เก็บตัวเล็ก ไม่ซ้ำในบริษัท (ไม่สนตัวพิมพ์);
  `email` ไม่บังคับ (`""` = ไม่มี) ถ้ามีต้องถูกรูปแบบและไม่ซ้ำ
- `userBranchError()` → 400: `allBranches` หรือ `branchIds` ≥ 1 สาขาที่ใช้งานอยู่ (เก็บ `branchIds: []` เมื่อ `allBranches`) · `passwordError()` → 400 (4–64 ตัว)
- `userScopeError()` → **403** (E6): admin ที่ไม่ใช่ `allBranches` จัดการได้เฉพาะผู้ใช้ที่อยู่ในสาขาของตัวเองทั้งหมด และให้สิทธิ์ได้แค่สาขาของตัวเอง

### ตัวกรองสาขาของรายการ (SaaS ขั้น 4, E23)

`GET /sales`, `/credit-notes`, `/tax-invoices`, `/shifts`, `/shifts/variance-report` รับ `?branchId=<id>|all`: ไม่ส่ง = สาขาใน `X-Branch-Id`; รายการของกะเดียว (`shiftId=`) ใช้สาขาของกะ;
`branchScopeError()` (`user.model.ts`) — admin บริษัทได้ทุกสาขาของบริษัทและ `all`, คนอื่นเฉพาะสาขาที่ `canWorkIn()` → **403** ("ไม่มีสิทธิ์ดูข้อมูลของสาขานี้" / "ดูทุกสาขาได้เฉพาะผู้ดูแลระบบระดับบริษัท"); ค่าที่อ่านไม่ได้ → 400

### SKU / สต็อก

| method + path                       | body → response                                                  | หมายเหตุ                                                                                                                                                                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /products`                     | → `Product[]`                                                    | `currentPrice`, `avgCost`, `categoryPath`, `stock` เป็นค่าที่ server คำนวณ; `stock` / `avgCost` / `minStock` / `maxStock` = ของสาขาใน `X-Branch-Id` (`branch_stock`, D1)                                                                                          |
| `POST /products`                    | `ProductPayload` → `Product`                                     | ไม่รับ `stock` / `avgCost` / `currentPrice` / `categoryPath` (ทิ้ง); `minStock` / `maxStock` ลงสาขาใน header (E13); กฎ SKU ใน `domain-rules.md`                                                                                                                   |
| `GET/PUT/DELETE /products/:id`      |                                                                  | PUT แก้ `minStock` / `maxStock` ของสาขาใน header เท่านั้น (E13); PUT ห้ามเปลี่ยน `serialControl` / `itemType` เมื่อสาขาใดยังมีของ; DELETE: สาขาใดยังมีของ / มีการขาย / อยู่ในโปรที่ยังไม่หมดอายุ → 400 — ข้อความบอกสาขา "ยังมีสต็อกคงเหลือ (สาขา HQ, BN) …" (E18) |
| `PUT /products/:id/stock`           | `{ delta, unitCost?, note? }` → `Product`                        | non-serial, non-service; `delta` จำนวนเต็ม ≠ 0 (หน่วยฐาน); รับเข้าต้องมี `unitCost` → ทุนเฉลี่ยใหม่; ติดลบไม่ได้; `delta<0` admin                                                                                                                                 |
| `GET /products/:id/movements`       | `?from=&to=&branchId=` → `StockCardResult`                       | `buildStockCard()` บน movement ของสาขาเดียว (D1, ไม่มี "ทุกสาขา" — E15): `branchId` ไม่ส่ง = สาขาใน header, สาขาอื่นได้ถ้าผู้ใช้เข้าสาขานั้นได้ (`canWorkIn()`) ไม่ได้ → 403; from > to → 400                                                                     |
| `GET /products/:id/branch-stock`    | → `BranchStockRow[] { branchId, stock, avgCost }`                | ทุกสาขาที่ใช้งาน (ไม่มีแถว = 0); ทุกคนเห็นจำนวน, `avgCost` เฉพาะ admin (คนอื่น `null`) — E14                                                                                                                                                                      |
| `GET /products/:id/serials`         | → `SerialNumber[]`                                               | serial ของสาขาใน header (in_stock + ที่ตัดออกที่สาขานี้, E16)                                                                                                                                                                                                     |
| `POST /products/:id/serials`        | `{ serials: string[], unitCost, note? }` → `SerialReceiveResult` | `serialFormatError()`, ซ้ำ / อยู่ในคลังแล้ว → 400; อยู่ในคลังสาขาอื่น → 400 "อยู่ในคลังสาขา HQ"; serial ที่เคยตัดออก (สาขาใดก็ได้) = ใช้ record เดิม ย้าย `branchId` มาสาขานี้ (B18, E16)                                                                         |
| `POST /products/:id/serials/remove` | `{ ids, status, note }` → `Product`                              | admin; `status` = sold / damaged / other; ไม่ลบ record; เฉพาะ serial ที่อยู่สาขานี้ (E16)                                                                                                                                                                         |

รับเข้าไม่ได้เมื่อ `canPurchase()` เป็นเท็จ (`no_sale` ขายไม่ได้, `no_purchase` / `discontinued` รับไม่ได้)

ต้องมี `X-Branch-Id` (ไม่มี → 400, E17 / E24): `POST /products`, `PUT /products/:id`, `PUT /products/:id/stock`, `POST /products/:id/serials(/remove)`, `POST /sales`, `POST /sales/:id/void | credit-notes | exchanges | tax-invoice | tax-invoice/reissue`, ทุก `POST/PUT /shifts/…` — ทุกการเดินสต็อก / เอกสาร / กะเกิดที่สาขานั้น (กะได้ `branchId` ของเครื่อง, ใบกำกับได้ `branchId` ของบิล)

### ข้อมูลหลัก

| resource        | endpoints                                                                                            | หมายเหตุ                                                                                                                                                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Category`      | `GET/POST /categories`, `PUT/DELETE /categories/:id`                                                 | 3 ระดับ; ลบได้เมื่อไม่มีลูก / SKU / โปรอ้าง; หมวดที่มี SKU แตกหมวดย่อยไม่ได้; `productCount` server คำนวณ                                                                                                                                                                                                     |
| `Supplier`      | `GET/POST /suppliers`, `GET/PUT/DELETE /suppliers/:id`                                               | `isValidThaiTaxId()`; ไม่ซ้ำ code และ taxId+สาขา; ลบไม่ได้เมื่อผูก SKU                                                                                                                                                                                                                                        |
| `SkuPrice`      | `GET /prices[?productId=]`, `POST /prices`, `PUT/DELETE /prices/:id`                                 | ช่วงของ SKU เดียวกันห้ามทับ (`findOverlap()`) → 400                                                                                                                                                                                                                                                           |
| `Promotion`     | `GET/POST /promotions`, `GET/PUT/DELETE /promotions/:id`                                             | `promotionError()`; เริ่มแล้วแก้ได้บางช่อง, ลบไม่ได้; `branchIds` ([] = ทุกสาขา, ต้องเป็นสาขาที่ใช้งาน); จำกัดสาขา / แก้ / ลบโปรที่จำกัดสาขา ได้เฉพาะ admin บริษัท → 403 (`promotionBranchScopeError()`, D2 / E6)                                                                                             |
| `PaymentMethod` | `GET/POST /payment-methods`, `PUT/DELETE /payment-methods/:id`, `PUT /payment-methods/order { ids }` | GET เรียงตาม `sortOrder`; `paymentMethodError()`; เงินสดที่ใช้งานต้องเหลือ ≥ 1; มีการขายอ้าง → ลบไม่ได้; order ต้องส่ง id ครบ                                                                                                                                                                                 |
| `PosTerminal`   | `GET/POST /pos-terminals`, `PUT/DELETE /pos-terminals/:id`                                           | `posTerminalError()` (ต้องมี `branchId` ของสาขา, เครื่องที่ใช้งานต้องอยู่สาขาที่ใช้งาน); id เปลี่ยนไม่ได้ และ**ไม่ซ้ำทั้งบริษัท** (E8); GET ทุกเครื่องของบริษัท; เขียน: admin บริษัท หรือ admin ของสาขานั้น (ย้ายสาขาต้องมีสิทธิ์ทั้งสองสาขา) → 403; มีกะเปิด → ปิดใช้งานไม่ได้; มีกะ / เอกสารอ้าง → ลบไม่ได้ |

### การขาย

| method + path                         | body → response                              | หมายเหตุ                                                                                                                                                                                                                                                                                                            |
| ------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /sales`                          | `?from=&to=&shiftId=` → `Sale[]`             | ตามวันขาย, ใหม่ก่อน; `shiftId` = ขายหรือ void ในกะนั้น; `returnStatus` / `creditedTotal` / `creditNoteNos` / `exchangeNos` คำนวณทุกครั้งที่อ่าน                                                                                                                                                                     |
| `GET /sales/:id`                      | → `Sale`                                     |                                                                                                                                                                                                                                                                                                                     |
| `POST /sales`                         | `SalePayload` → `Sale`                       | ลำดับตรวจด้านล่าง                                                                                                                                                                                                                                                                                                   |
| `POST /sales/:id/void`                | `VoidPayload { reason, approval? }` → `Sale` | `voidError(…, สาขาใน header)` (วันเดียวกับวันขาย + สาขาที่ขายเท่านั้น — D3 / E12 "บิลนี้ขายที่สาขา … — ยกเลิกได้ที่สาขานั้น"), `shiftBlocker('void')`; คืนเข้าสต็อกสาขาที่ขาย; คืนสต็อกที่ COGS ของบรรทัด, serial กลับเข้าคลัง (`currentSerial()`); ยกเลิกใบกำกับเต็มรูป; `voidedBy` / `voidApprovedBy` server ตั้ง |
| `PUT /sales/:id/status`               | `{ status }` → `Sale`                        | เฉพาะออร์เดอร์ก่อน POS (ไม่มี lines); บิล POS → 400                                                                                                                                                                                                                                                                 |
| `GET/POST /sales/:id/credit-notes`    | `CreditNotePayload` → `CreditNote`           | admin; `creditNoteError()` (ctx `here` = สาขาใน header ต้องเป็นสาขาที่ขาย, D3) / `draftCreditNote()`, `shiftBlocker('refund')`; snapshot `branchId`; เลข `CN-YYYYMMDD-NNNN`                                                                                                                                         |
| `GET /credit-notes`                   | `?from=&to=&shiftId=` → `CreditNote[]`       |                                                                                                                                                                                                                                                                                                                     |
| `GET/POST /sales/:id/exchanges`       | `ExchangePayload` → `Exchange`               | `exchangeError()` (ctx `here`, D3); serial ใหม่ต้องอยู่ในคลังของสาขานี้ (E16); snapshot `branchId`; ไม่ต้องมีกะ; เลข `EX-YYYYMMDD-NNNN`                                                                                                                                                                             |
| `GET /sales/:id/tax-invoice`          | → `TaxInvoice \| null`                       | ใบที่ยังใช้ได้ (`currentInvoice()`)                                                                                                                                                                                                                                                                                 |
| `POST /sales/:id/tax-invoice`         | `{ buyer }` → `TaxInvoice`                   | `taxInvoiceError()`; ลงวันที่ / เลขตาม **วันขาย** `INV-<วันขาย>-NNNN`                                                                                                                                                                                                                                               |
| `GET /sales/:id/tax-invoices`         | → `TaxInvoice[]`                             | ทุกใบ เก่าก่อน                                                                                                                                                                                                                                                                                                      |
| `POST /sales/:id/tax-invoice/reissue` | `{ buyer, reason }` → `TaxInvoice`           | admin; `reissueError()`; ใบเก่าได้ `cancelledAt` / `replacedByNo`                                                                                                                                                                                                                                                   |
| `GET /tax-invoices`                   | `?from=&to=` → `TaxInvoice[]`                | admin; ตามวันที่ใบกำกับ เก่าก่อน (รายงานภาษีขาย)                                                                                                                                                                                                                                                                    |
| `GET /tax-invoices/buyer`             | `?taxId=` → `TaxInvoiceBuyer \| null`        | ผู้ซื้อล่าสุดที่ใช้เลขนี้                                                                                                                                                                                                                                                                                           |

**`POST /sales` ตรวจตามลำดับ (ไม่เปลี่ยนอะไรจนกว่าผ่านหมด):**

1. `terminalError(X-Terminal-Id, terminals, X-Branch-Id)` — ต้องเป็นเครื่องที่ลงทะเบียน ใช้งานอยู่ และอยู่ในสาขาของ `X-Branch-Id` (E8)
2. `shiftBlocker('sell')` — ต้องมีกะเปิดของเครื่องนี้และผู้ขายเป็นเจ้าของกะ (เมื่อ `requireShift`)
3. `priceCart(items, { products, promotions, categories, date: วันนี้, vatRegistered, branchId: X-Branch-Id }, freeSerials, billManualDiscount)` แล้ว `cartError()` — โปรที่จำกัดสาขาอื่นไม่คิด (`inBranch()`, D2)
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

## ที่จะเปลี่ยนตาม SaaS (ขั้นถัดไป — `docs/saas-plan.md`)

ทำแล้วในขั้น 1: login แบบรหัสบริษัท, token มี tenant, `GET /me`, header `X-Branch-Id` + 403 · ขั้น 2: สิทธิ์สาขาของผู้ใช้, รหัสผ่าน, `/settings/company`, `/settings/branch`, `/branches` (หัวข้อด้านบน)

- รายงานรับ `?branchId=<id>|all`; endpoint ใหม่ `/branches`, `/settings/company`, `/settings/branch`, `/products/:id/branch-stock` (ทำแล้ว ขั้น 3), `/transfers`
- role ใหม่ `owner`, `platform_admin`; เลขเอกสารมีรหัสสาขา (หัวข้อ 3 ของ saas-plan)
