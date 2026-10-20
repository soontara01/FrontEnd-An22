# API contract (SaaS ขั้น 1–6: หลายบริษัท หลายสาขา)

แหล่งอ้างอิง: mock `src/app/core/interceptors/mock-backend.interceptor.ts` (+ spec) · รูปร่าง body = interface ใน
`src/app/core/models/*.model.ts` (ชื่อในวงเล็บ `Type` ด้านล่าง) · กฎตรวจ = ฟังก์ชันใน `domain-rules.md`

สิ่งที่ SaaS ยังไม่ทำ (เลื่อนออกไป) อยู่ท้ายไฟล์

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
| `Authorization: Bearer <token>` | **web (an22-web)** จาก session ของ cookie (E48) | token ที่ api ออกตอน login — JWT claims หัวข้อ "Token" ด้านล่าง; browser ไม่เคยเห็น / ส่ง token เอง (หัวข้อ "Session")                                                                                                                                                                                           |
| `X-Terminal-Id: <n>`            | `terminalInterceptor` เมื่อเครื่องนี้ถูกตั้งไว้ | เลขเครื่อง POS ของอุปกรณ์ (ไม่มี = ไม่ใช่เครื่อง POS) — กะ, เลขบิล, POS ID ต่อเครื่อง; อุปกรณ์จำแยกต่อบริษัท (E42) แต่ server ยังต้องตรวจว่าเป็นเครื่องของ tenant                                                                                                                                                |
| `X-Branch-Id: <id>`             | `branchInterceptor` เมื่อเลือกสาขาแล้ว          | สาขาที่ทำงานอยู่ — server ตรวจว่าเป็นสาขาที่ใช้งานอยู่และผู้ใช้เข้าได้ ไม่ใช่ → **403** "ไม่มีสิทธิ์ทำงานในสาขานี้" (ยกเว้น `GET /me`); ไม่ส่ง → การอ่านใช้สาขาแรก; งานเขียนที่แตะสต็อก / ขาย → **400** "ไม่ได้เลือกสาขา กรุณาเลือกสาขาที่ทำงานก่อน" (E2 / E17, ขั้น 3 — รายการในหัวข้อ SKU / สต็อก); กะรอขั้น 4 |

### Token (JWT)

claims: `sub` (userId), `tenantId` (companyId), `role`, `branchIds` หรือ `allBranches: true` (server ควรอ่านสิทธิ์สาขาจาก DB ทุก request ก็ได้ เพื่อให้แก้สิทธิ์มีผลทันที) ·
**tenant มาจาก token เท่านั้น** ห้ามรับจาก URL / query / body · ทุก request ตรวจว่าบริษัทยังใช้งานอยู่และผู้ใช้ยัง active
(ไม่ผ่าน → 401) · mock ใช้ token ปลอม `mock-jwt-token.t<companyId>.u<userId>` (`mockToken()`)

อายุ JWT ≥ 7 วัน (เพดาน session ของ web — E48); web คุมอายุ session เอง (ไม่ใช้งาน 12 ชม. / สูงสุด 7 วัน)

### Session (E48 — cookie httpOnly ผ่าน web)

browser ถือแค่ cookie `an22.sid` (httpOnly, SameSite=Lax, Secure บน https) — **token อยู่ใน session ฝั่ง web** (store memory / MongoDB) ไม่อยู่ใน localStorage

- `POST /auth/login`, `POST /auth/signup`, `POST /platform/auth/login`: api ตอบ `{ token, ... }` ตามเดิม → web เก็บ `token` ใน session (ร้าน / platform แยกช่อง), เปลี่ยน session id
  แล้วตอบ browser **โดยไม่มี field `token`** (`LoginResponse` / `PlatformLoginResponse` ของหน้าบ้านไม่มี `token`)
- request อื่น: web ทิ้ง `Authorization` / `Cookie` ที่ browser ส่งมา แล้วใส่ `Authorization: Bearer` จาก session — `/platform/…` ใช้ token ของ platform, ที่เหลือใช้ของร้าน
- api ตอบ 401 → web ลบ token ช่องนั้นออกจาก session แล้วส่ง 401 ต่อ
- `POST /auth/logout`, `POST /platform/auth/logout` → `null`: **web ตอบเอง** (ลบช่องนั้น; ไม่เหลือทั้งสองช่อง = ทำลาย session) — api ไม่ต้องมี
- CSRF: web ตั้ง cookie `XSRF-TOKEN` (อ่านได้) — POST / PUT / PATCH / DELETE ต้องมี header `X-XSRF-TOKEN` ตรงกัน (Angular `HttpClient` ส่งให้เอง) ไม่งั้น **403** "คำขอไม่ถูกต้อง กรุณาโหลดหน้าใหม่"
- หน้าบ้านรู้ว่า login อยู่จาก `GET /me` ตอนเปิดทุกหน้า (401 = ยังไม่ login, ไม่ขึ้นข้อความ); platform ใช้ `GET /platform/me`
- mock จำลองทั้ง web + api: token อยู่ใน `an22.mock.session` / `an22.mock.platformSession` (localStorage — เฉพาะ mock)

### Error

ทุก error ตอบ `{ "message": "<ข้อความภาษาไทย>" }` — หน้าบ้าน (`errorInterceptor`) แสดง `message` เป็น snackbar ตรง ๆ
ข้อความให้ใช้ตามฟังก์ชันกฎ / mock (ผู้ใช้เห็นข้อความนี้)

| status    | เมื่อไร                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------------------- |
| 400       | ผิดกฎธุรกิจ / ข้อมูลไม่ถูกต้อง / login ผิดตอน `auth/verify` หรือผู้อนุมัติผิด                                              |
| 401       | token ไม่มี / ไม่รู้จัก / ผู้ใช้ถูกปิด — **ทุก endpoint ยกเว้น `POST /auth/login`, `POST /auth/verify`** → หน้าบ้าน logout |
| 403 (web) | CSRF ไม่ผ่าน (หัวข้อ "Session") — ข้อความ "คำขอไม่ถูกต้อง กรุณาโหลดหน้าใหม่"                                               |
| 403       | ไม่มีสิทธิ์ (หัวข้อ "สิทธิ์") — หน้าบ้านไม่ logout                                                                         |
| 404       | ไม่พบ record                                                                                                               |

`POST /auth/login` ผิด → 401 (หน้าบ้านยกเว้น path นี้ไม่ logout) · token ที่ไม่มี tenant (ก่อน SaaS) หรือบริษัทถูกระงับ → 401 · `POST /auth/verify` ผิด → **400 เสมอ** (ห้าม 401: จะ logout คนที่ยืนอยู่หน้าเครื่อง)

## สิทธิ์ (owner / admin / user)

role `owner` (E33, 1 คนต่อบริษัท) ได้ทุกอย่างที่ admin ได้ (`hasAdminRights()`) และนับเป็น admin บริษัท (`isCompanyAdmin()`) — "non-admin" ข้างล่าง = role `user`

server เป็นผู้ตรวจ (`adminOnlyError()` ใน mock; ตารางเต็ม `docs/saas-plan.md` หัวข้อ 17) — non-admin ได้ **403**:

- ทุก `/users…`
- เขียน (ไม่ใช่ GET) ของ `/categories`, `/suppliers`, `/payment-methods` (รวม order), `/prices`, `/promotions`, `/pos-terminals`
- ตัดสต็อกออก: `PUT /products/:id/stock` ที่ `delta < 0`, `POST /products/:id/serials/remove`
- `POST /sales/:id/credit-notes`, `POST /sales/:id/tax-invoice/reissue`, `GET /tax-invoices`
- `PUT /settings/store`, `PUT /settings/company`, `PUT /settings/branch`, เขียน `/branches`, `PUT /settings/menu-access`, `POST /shifts/:id/approve`, `POST /shifts/:id/adjustments`
- กะ: non-admin เห็น / นับ / ปิดได้เฉพาะ **กะของตัวเอง** (`GET /shifts` และ `variance-report` กรองให้, กะคนอื่น → 403;
  `shifts/current`, `shifts/last-float` เปิด)
- void: non-admin ต้องส่ง `approval { username, password }` ของ admin (ไม่ส่ง → 403, ผิด / ไม่ใช่ admin → 400)

### ทุน / กำไร (P5, E43–E45)

- ใครเห็นทุน = `canSeeCost(user, companyInfo)` (`cost-visibility.model.ts`): owner / admin เสมอ, role `user` เฉพาะเมื่อ `CompanyInfo.staffSeeCost` = true (ค่าเริ่มต้น false)
  — ส่งให้หน้าบ้านใน `LoginResponse` / `MeResponse.canSeeCost`
- คนที่เห็นไม่ได้: **ทุก response** ที่มี key ใน `COST_FIELDS` (`cost`, `avgCost`, `cogs`, `unitCost`, `totalCost`, `balanceAvgCost`, `balanceValue`, `costIn`, `costOut`, `inCost`, `outCost`)
  ได้ค่า **`null`** ทุกระดับความลึก (ไม่ละ field — B24) และ object ยอดคงเหลือ `{ qty, avgCost, value }` ได้ `value: null` ด้วย — mock ทำจุดเดียวด้วย `hideCost()` หลัง handler
  (api จริง: ทำที่ชั้น serialize / DTO จุดเดียว ไม่ใช่ทีละ endpoint); ครอบ `Product` + `suppliers[]`, `SerialNumber`, บัตรสต็อก, `SaleLine`, ใบลดหนี้, ใบเปลี่ยน, `TransferLine`, `BranchStockRow` (แทน E14)
- ขาเข้า (E44): `POST` / `PUT /products…` จากคนที่เห็นทุนไม่ได้ — **ไม่ใช้** `cost` / `suppliers[].cost` ใน body: PUT คงค่าที่เก็บไว้ (ผู้จำหน่ายที่เพิ่มใหม่ = 0), POST = 0;
  การรับของ (`unitCost` / `cost` ของ serial) ยังรับค่าที่กรอก
- POS (E45): `POST /sales/cost-check` บอกคำเตือน "ขายต่ำกว่าทุนหลังส่วนลดพิเศษ" โดยไม่ส่งตัวเลข

## Endpoints

### Auth / settings

| method + path                          | body → response                                                                                                                                   | หมายเหตุ                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /auth/login`                     | `LoginRequest { companyCode, username, password }` → `LoginResponse { user, company, branches }` (api ส่ง `token` ด้วย — web เก็บแล้วตัดออก, E48) | D4; ผิดทุกกรณี (รหัสบริษัท / ชื่อ / รหัสผ่าน / ผู้ใช้ถูกปิด) → 401 ข้อความเดียว "รหัสบริษัท ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง" (E3); บริษัทถูกระงับ → 401 "บริษัทนี้ถูกระงับการใช้งาน…" เฉพาะเมื่อรหัสผ่านถูก; `companyCode` ไม่สนตัวพิมพ์; `branches` = สาขาที่ใช้งานอยู่ที่ผู้ใช้เข้าได้ (`canWorkIn()`: `allBranches` หรืออยู่ใน `branchIds`) |
| `GET /me`                              | → `MeResponse { user, company, branches, billing, canSeeCost }`                                                                                   | `canSeeCost` = `canSeeCost(user, companyInfo)` (E43); session ปัจจุบันตาม token (ไม่ออก token ใหม่) — หน้าบ้านเรียกทุกครั้งที่โหลดหน้า + หน้าเลือกสาขา; **ไม่ตรวจ `X-Branch-Id`** (สาขาที่เครื่องจำไว้อาจหมดสิทธิ์แล้ว)                                                                                                                          |
| `POST /auth/verify`                    | `{ username, password }` → `{ user }`                                                                                                             | ตรวจรหัสของผู้ใช้**ในบริษัทของ token** โดยไม่สร้าง session (ปลดล็อก POS, ผู้อนุมัติ) — ผิด / ไม่มี token / ผู้ใช้ถูกปิด → 400 ข้อความเดียว                                                                                                                                                                                                       |
| `GET /settings/store`                  | `?branchId=` → `StoreInfo`                                                                                                                        | ค่าประกอบ `storeInfoOf(companyInfo, สาขา)` — สาขาใน `X-Branch-Id` (ไม่ส่ง = สาขาแรก) หรือ `?branchId=` = สาขาของเอกสารที่พิมพ์ (E22: ใบเสร็จ / ใบกำกับ / ใบลดหนี้ / ใบเปลี่ยน / Z พิมพ์ข้อมูลผู้ขายของสาขาที่ออกเอกสาร ไม่ใช่สาขาที่เปิดดู; สาขาไม่มี → 404) — เอกสาร / POS อ่านอันนี้ (E11, คงไว้ช่วงเปลี่ยนผ่าน)                               |
| `PUT /settings/store`                  | `StoreInfo` → `StoreInfo`                                                                                                                         | ช่วงเปลี่ยนผ่าน: admin บริษัท (403); `storeInfoError()`, `requireShiftChangeError()` → 400; เขียนลง company + สาขาปัจจุบัน (เลขสาขาไม่เปลี่ยน)                                                                                                                                                                                                   |
| `GET /settings/company`                | → `CompanyInfo`                                                                                                                                   | ผู้ใช้ทุกคน                                                                                                                                                                                                                                                                                                                                      |
| `PUT /settings/company`                | `CompanyInfo` → `CompanyInfo`                                                                                                                     | admin บริษัท (E6, อื่น → 403); `companyInfoError()`, `requireShiftChangeError()` (มีกะเปิดสาขาใด → ปิดระบบกะไม่ได้); `staffSeeCost` (E43) มีผลกับ `user` ตั้งแต่ request ถัดไป                                                                                                                                                                   |
| `GET /settings/branch`                 | → `Branch`                                                                                                                                        | สาขาปัจจุบัน (`X-Branch-Id`)                                                                                                                                                                                                                                                                                                                     |
| `PUT /settings/branch`                 | `BranchDetails { name, address, phone, receiptFooter }` → `Branch`                                                                                | admin ที่เข้าสาขานั้นได้ (สาขาอื่น → 403 จาก `X-Branch-Id`); `branchDetailsError()`; code / เลขสาขา / สถานะแก้ที่ `/branches`                                                                                                                                                                                                                    |
| `GET /branches` · `GET /branches/:id`  | → `Branch[]` / `Branch`                                                                                                                           | ผู้ใช้ทุกคน (ทุกสาขาของบริษัท รวมที่ปิด)                                                                                                                                                                                                                                                                                                         |
| `POST /branches` · `PUT /branches/:id` | `BranchPayload` → `Branch`                                                                                                                        | admin บริษัท (403); `branchError()` (code / เลขสาขาไม่ซ้ำ, ต้องเหลือสาขาที่ใช้งาน ≥ 1; มีกะเปิดที่เครื่องของสาขา → ปิดใช้งานไม่ได้); `id` ใน body ไม่สนใจ; **ไม่มี DELETE** — ปิดใช้งานแทน                                                                                                                                                       |
| `GET /settings/menu-access`            | → `MenuAccess { userMenus }`                                                                                                                      | ผู้ใช้ทุกคน                                                                                                                                                                                                                                                                                                                                      |
| `PUT /settings/menu-access`            | `MenuAccess` → `MenuAccess`                                                                                                                       | admin; `menuAccessError()`                                                                                                                                                                                                                                                                                                                       |

### Users (admin เท่านั้น)

`GET /users` → `User[]` · `POST /users` (`NewUserPayload` = `UserPayload` + `password`) · `GET/PUT/DELETE /users/:id` ·
`PUT /users/:id/password { password }` → `null` (admin ตั้งรหัสใหม่ให้, E10) — ไม่มี endpoint ไหนคืน `password`

- `userChangeError()` → 400 (ลด / ปิด / ลบตัวเองไม่ได้, ต้องเหลือ admin ที่ใช้งาน ≥ 1 — owner นับเป็น admin; owner ลบ / ปิดใช้งาน / เปลี่ยน role ไม่ได้, E33)
- `ownerRoleError()` → 400: `POST` / `PUT /users` ตั้ง role `owner` ไม่ได้ และ owner เปลี่ยน role ไม่ได้ — เปลี่ยนเจ้าของด้วย `POST /company/owner` เท่านั้น; owner ต้องมีอีเมล (`userIdentityError()`) และได้ `allBranches: true` เสมอ (server บังคับ)
- `userIdentityError()` → 400 (B5): `username` บังคับ `a-z 0-9 . _ -` 3–30 ตัว เก็บตัวเล็ก ไม่ซ้ำในบริษัท (ไม่สนตัวพิมพ์);
  `email` ไม่บังคับ (`""` = ไม่มี) ถ้ามีต้องถูกรูปแบบและไม่ซ้ำ
- `userBranchError()` → 400: `allBranches` หรือ `branchIds` ≥ 1 สาขาที่ใช้งานอยู่ (เก็บ `branchIds: []` เมื่อ `allBranches`) · `passwordError()` → 400 (4–64 ตัว)
- `userScopeError()` → **403** (E6): admin ที่ไม่ใช่ `allBranches` จัดการได้เฉพาะผู้ใช้ที่อยู่ในสาขาของตัวเองทั้งหมด และให้สิทธิ์ได้แค่สาขาของตัวเอง

### บัญชีบริษัท (SaaS ขั้น 6, owner เท่านั้น — E33)

`POST /company/owner { userId, password }` → `User[]` (ผู้ใช้ทั้งบริษัทหลังโอน) — owner โอนความเป็นเจ้าของ ยืนยันด้วยรหัสผ่านของตัวเอง:
ไม่ใช่ owner → **403** "โอนความเป็นเจ้าของได้เฉพาะเจ้าของบริษัท"; `ownerTransferError()` อื่น → 400; รหัสผ่านผิด → 400 "รหัสผ่านไม่ถูกต้อง" (ห้าม 401);
ผู้รับ → `owner` + `allBranches`, owner เดิม → `admin` + `allBranches` (หน้าบ้าน reload เพราะสิทธิ์ตัวเองเปลี่ยน)

### แพ็กเกจ (SaaS ขั้น 6.4, E34)

- `GET /company/subscription` → `SubscriptionInfo { planId, usage }` — admin (user → 403 "ดูแพ็กเกจได้เฉพาะผู้ดูแลระบบ"); `usage` = จำนวน**ที่ใช้งานอยู่** (`planUsage()`)
- `PUT /company/plan { planId }` → `SubscriptionInfo` — owner เท่านั้น (อื่น → 403 "เปลี่ยนแพ็กเกจได้เฉพาะเจ้าของบริษัท"), ไม่มีแพ็กเกจนี้ → 400; ลดแพ็กเกจได้แม้ใช้เกิน (ของเดิมใช้ต่อ เพิ่มไม่ได้)
- จำกัดจำนวน: `POST /branches`, `POST /users`, `POST /pos-terminals` ที่ `active: true` และ `PUT` ที่เปลี่ยน `active` false → true เกินแพ็กเกจ → **403** `planLimitError()`
  (ตรวจหลังกฎอื่นของ endpoint นั้นผ่านแล้ว); แก้ record ที่ active อยู่แล้วไม่นับเป็นการเพิ่ม

### การเก็บเงิน (SaaS ขั้น 6.5, E35 — ยังไม่มี payment gateway)

- `GET /company/subscription` (ขั้น 6.4) ตอบเพิ่ม `status` (`subscriptionStatus()`), `subscription { trialEndsOn, nextInvoiceOn }`, `invoices: BillingInvoice[]` (ของบริษัทนี้ ใหม่สุดก่อน)
- server ออกใบแจ้งหนี้เมื่อถึง `nextInvoiceOn` (รอบละ 1 เดือน, ราคาแพ็กเกจ ณ วันออก รวม VAT, ครบกำหนด +7 วัน, เลข `SUB-YYYYMM-NNNN` ทั้งแพลตฟอร์ม) — ทำเป็น job รายวันได้ (mock ทำตอนรับ request)
- ใบที่ค้างเกินครบกำหนด + 7 วัน → `Company.active = false`, `suspendedReason = 'overdue'`: token เดิม → 401, login ถูก → 401 "บริษัทนี้ถูกระงับการใช้งานเพราะค้างชำระค่าบริการ — เจ้าของบริษัทติดต่อผู้ให้บริการเพื่อชำระเงิน"
  (ระงับโดย platform → "บริษัทนี้ถูกผู้ให้บริการระงับการใช้งาน — เจ้าของบริษัทติดต่อผู้ให้บริการ")
- `LoginResponse` / `MeResponse` มี `billing: BillingNotice | null` (`billingNotice()`) — ส่งเฉพาะ owner / admin, คนอื่น `null`; หน้าบ้านแสดงเป็นแถบบนทุกหน้า
- เปลี่ยนแพ็กเกจกลางรอบ: ไม่คิดส่วนต่าง (ใบถัดไปใช้ราคาใหม่) — ชำระ / ยกเลิกใบแจ้งหนี้ทำที่ platform (ขั้น 6.7)

### สมัครใช้งาน / ลืมรหัสผ่าน owner (SaaS ขั้น 6.6, E37 / E41 — ไม่ต้องมี token)

| endpoint                     | body → ตอบ                               | หมายเหตุ                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /auth/signup`          | `SignupPayload` → `LoginResponse`        | `signupError()` → 400; รหัสบริษัทซ้ำกับบริษัทใดก็ได้ (รวมที่ลบแล้ว E39) → 400 "รหัสบริษัทนี้ถูกใช้แล้ว" (ควรจำกัดจำนวนครั้งต่อ IP); สร้างบริษัท (`trial_ends_on` = วันนี้ + `TRIAL_DAYS`, ใบแรกออกวันถัดไป), สาขาแรก (`receiptFooter` "ขอบคุณที่ใช้บริการ"), owner (`allBranches`), ช่องทางเงินสด 1 รายการ — ไม่มีข้อมูลตัวอย่าง; audit `signup` |
| `POST /auth/forgot-password` | `{ companyCode, email }` → `{ message }` | ตอบ `FORGOT_PASSWORD_ANSWER` **เสมอ** (ไม่บอกว่ามีบริษัท / อีเมลนี้); เมื่อตรงกับ owner ที่ใช้งานอยู่ → ส่งอีเมลลิงก์ `/auth/reset-password?token=` ใช้ครั้งเดียว อายุ `RESET_LINK_MINUTES` (mock: เก็บใน outbox ของ platform)                                                                                                                   |
| `POST /auth/reset-password`  | `{ token, password }` → `null`           | token ผิด / หมดอายุ / ใช้แล้ว → 400 "ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง หมดอายุ หรือใช้ไปแล้ว — ขอลิงก์ใหม่"; `passwordError()` → 400; audit `password_reset`                                                                                                                                                                                           |
| `GET /company/onboarding`    | → `OnboardingCounts`                     | admin; จำนวนเครื่อง POS / หมวด / SKU / ช่วงราคา / ผู้ใช้ — หน้าบ้านทำ checklist ด้วย `onboardingSteps()`                                                                                                                                                                                                                                         |

### ข้อมูลบริษัท: export / ลบ (SaaS ขั้น 6.8, E38 / E39, owner เท่านั้น — อื่น → 403)

| endpoint                             | body → ตอบ                                                              | หมายเหตุ                                                                                                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /company/export`                | → `CompanyExport`                                                       | JSON ทุก collection ของบริษัทตามที่เก็บ (`schemaVersion: 1`), **ไม่มีรหัสผ่าน / token**; audit `company_export` — บริษัทใหญ่ควรทำเป็น job + ลิงก์ดาวน์โหลด (หลังบ้านเลือก)                              |
| `GET /company/deletion`              | → `CompanyDeletion \| null`                                             | คำขอที่ค้างอยู่                                                                                                                                                                                         |
| `POST /company/deletion`             | `DeletionRequest { companyCode, password, reason }` → `CompanyDeletion` | `deletionRequestError()` → 400, รหัสผ่านผิด → 400 "รหัสผ่านไม่ถูกต้อง", มีคำขออยู่แล้ว → 400; บริษัทถูกระงับทันที (`suspendedReason: 'deletion'`), `purgeAfter` = วันนี้ + 30; audit `deletion_request` |
| `DELETE /company/deletion`           | → `null`                                                                | ยกเลิก: เปิดใช้งานกลับ (ถ้าค้างชำระเกินผ่อนผันจะถูกระงับอีกตามกฎ billing); audit `deletion_cancel`                                                                                                      |
| `POST /platform/companies/:id/purge` | → `PlatformCompanyDetail`                                               | platform: `purgeError()` (ต้องมีคำขอและถึง `purgeAfter`); ลบข้อมูลทุกตารางของ tenant ถาวร, ทะเบียนบริษัทคง `deleted_at` + ชื่อ, รหัสบริษัทห้ามสมัครซ้ำ, login / token เดิม → เหมือนไม่มีบริษัท          |

ระหว่างรอลบ: login ได้เฉพาะ owner (คนอื่น → 401 "บริษัทนี้อยู่ระหว่างรอลบข้อมูล — ติดต่อเจ้าของบริษัท"), `Company.deletionPurgeAfter` ใน login / `me`;
ทุก endpoint นอก `me`, `company/*`, `audit-log` → 403 — หน้าบ้านพา owner ไป `/account/data` (`menuGuard`). **ระยะเก็บเอกสารภาษีก่อนลบ (5 ปี?) รอนักบัญชียืนยัน**

### Platform admin (SaaS ขั้น 6.7, E36 — ผู้ให้บริการ SaaS)

token แยก (mock `mock-platform-token.p<id>`; อยู่ใน session ของ web ช่อง platform — E48): token ของ platform ใช้กับ endpoint ของบริษัทไม่ได้ และกลับกัน (→ 401); หน้าบ้านส่ง token นี้เฉพาะ `/platform/…` และไม่ส่ง `X-Branch-Id` / `X-Terminal-Id`;
401 ของ `/platform/…` → หน้าบ้านจบเฉพาะ session platform (`/platform/login`). ฝั่ง api ใช้ DB role แยกที่ข้าม RLS ได้ (saas-plan หัวข้อ 16) — ทุกการกระทำบันทึกใน audit log ของบริษัทนั้น `actorKind: 'platform'`

| endpoint                                     | body → ตอบ                                         | หมายเหตุ                                                                                                                  |
| -------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `POST /platform/auth/login`                  | `{ username, password }` → `PlatformLoginResponse` | ผิด → 401 "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" (ไม่ใช่ผู้ใช้ของบริษัทใด, mock: `platform` / `platform`)                     |
| `GET /platform/me`                           | → `PlatformAdmin`                                  | admin ของ session — หน้าบ้านเรียกตอนเปิดหน้า platform (401 = ยังไม่ login)                                                |
| `GET /platform/companies`                    | → `PlatformCompanyRow[]`                           | ทุกบริษัท (รวมที่ลบแล้ว): แพ็กเกจ, สถานะ, การใช้งาน, ยอดค้าง                                                              |
| `GET /platform/companies/:id`                | → `PlatformCompanyDetail`                          | + ใบแจ้งหนี้, owner, เหตุผลที่ระงับ                                                                                       |
| `PUT /platform/companies/:id/plan`           | `{ planId }` → detail                              | audit `plan_change`                                                                                                       |
| `POST /platform/companies/:id/suspend`       | `{ note }` → detail                                | `suspendCompanyError()`; `suspendedReason: 'platform'`; audit `company_suspend`                                           |
| `POST /platform/companies/:id/reactivate`    | → detail                                           | `reactivateCompanyError()`: เฉพาะที่ platform ระงับ (ค้างชำระ → รับชำระ, รอลบ → owner ยกเลิก); audit `company_reactivate` |
| `PUT /platform/companies/:id/owner-password` | `{ password }` → `null`                            | `passwordError()`; audit `user_password`                                                                                  |
| `POST /platform/invoices/:id/pay`            | → detail                                           | `payInvoiceError()`; ถ้าระงับเพราะค้างและไม่เหลือใบเกินผ่อนผัน → เปิดใช้งานเอง; audit `invoice_paid`                      |
| `GET /platform/outbox`                       | → `PlatformEmail[]`                                | **mock เท่านั้น** (อีเมลที่ระบบจะส่ง — ลิงก์ตั้งรหัสผ่าน E41); api จริงส่งอีเมลแทน                                        |

### Audit log (SaaS ขั้น 6.3, E40)

`GET /audit-log?from=&to=&action=&userId=&branchId=` → `AuditEvent[]` ใหม่สุดก่อน — admin เท่านั้น (user → **403** "ดูประวัติการใช้งานได้เฉพาะผู้ดูแลระบบ");
`filterAuditEvents()`: owner / admin บริษัทเห็นทุกเหตุการณ์, admin สาขาเห็นเฉพาะเหตุการณ์ของสาขาที่ `canWorkIn()` (ไม่เห็นระดับบริษัท `branchId: null`); วันที่ = วันท้องถิ่นของ `at`; ค่าที่อ่านไม่ได้ = ไม่กรอง (`parseAuditQuery()`) ·
ไม่มี endpoint เขียน — server บันทึกเอง (รายการเหตุการณ์ใน `domain-rules.md`)

### ตัวกรองสาขาของรายการ (SaaS ขั้น 4, E23)

`GET /sales`, `/credit-notes`, `/tax-invoices`, `/shifts`, `/shifts/variance-report` รับ `?branchId=<id>|all`: ไม่ส่ง = สาขาใน `X-Branch-Id`; รายการของกะเดียว (`shiftId=`) ใช้สาขาของกะ;
`branchScopeError()` (`user.model.ts`) — admin บริษัทได้ทุกสาขาของบริษัทและ `all`, คนอื่นเฉพาะสาขาที่ `canWorkIn()` → **403** ("ไม่มีสิทธิ์ดูข้อมูลของสาขานี้" / "ดูทุกสาขาได้เฉพาะผู้ดูแลระบบระดับบริษัท"); ค่าที่อ่านไม่ได้ → 400

### SKU / สต็อก

| method + path                       | body → response                                                  | หมายเหตุ                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /products`                     | → `Product[]`                                                    | `currentPrice`, `avgCost`, `categoryPath`, `stock` เป็นค่าที่ server คำนวณ; `stock` / `avgCost` / `minStock` / `maxStock` = ของสาขาใน `X-Branch-Id` (`branch_stock`, D1)                                                                                                                                    |
| `POST /products`                    | `ProductPayload` → `Product`                                     | ไม่รับ `stock` / `avgCost` / `currentPrice` / `categoryPath` (ทิ้ง); คนที่เห็นทุนไม่ได้: `cost` / `suppliers[].cost` = 0 (E44); `minStock` / `maxStock` ลงสาขาใน header (E13); กฎ SKU ใน `domain-rules.md`                                                                                                  |
| `GET/PUT/DELETE /products/:id`      |                                                                  | PUT ของคนที่เห็นทุนไม่ได้คงทุนเดิม (E44); PUT แก้ `minStock` / `maxStock` ของสาขาใน header เท่านั้น (E13); PUT ห้ามเปลี่ยน `serialControl` / `itemType` เมื่อสาขาใดยังมีของ; DELETE: สาขาใดยังมีของ / มีการขาย / อยู่ในโปรที่ยังไม่หมดอายุ → 400 — ข้อความบอกสาขา "ยังมีสต็อกคงเหลือ (สาขา HQ, BN) …" (E18) |
| `PUT /products/:id/stock`           | `{ delta, unitCost?, note? }` → `Product`                        | non-serial, non-service; `delta` จำนวนเต็ม ≠ 0 (หน่วยฐาน); รับเข้าต้องมี `unitCost` → ทุนเฉลี่ยใหม่; ติดลบไม่ได้; `delta<0` admin                                                                                                                                                                           |
| `GET /products/:id/movements`       | `?from=&to=&branchId=` → `StockCardResult`                       | `buildStockCard()` บน movement ของสาขาเดียว (D1, ไม่มี "ทุกสาขา" — E15): `branchId` ไม่ส่ง = สาขาใน header, สาขาอื่นได้ถ้าผู้ใช้เข้าสาขานั้นได้ (`canWorkIn()`) ไม่ได้ → 403; from > to → 400                                                                                                               |
| `GET /products/:id/branch-stock`    | → `BranchStockRow[] { branchId, stock, avgCost }`                | ทุกสาขาที่ใช้งาน (ไม่มีแถว = 0); ทุกคนเห็นจำนวน, `avgCost` เฉพาะคนที่เห็นทุน (คนอื่น `null`) — E14 → E43                                                                                                                                                                                                    |
| `GET /products/:id/serials`         | → `SerialNumber[]`                                               | serial ของสาขาใน header (in_stock + ที่ตัดออกที่สาขานี้, E16)                                                                                                                                                                                                                                               |
| `POST /products/:id/serials`        | `{ serials: string[], unitCost, note? }` → `SerialReceiveResult` | `serialFormatError()`, ซ้ำ / อยู่ในคลังแล้ว → 400; อยู่ในคลังสาขาอื่น → 400 "อยู่ในคลังสาขา HQ"; serial ที่เคยตัดออก (สาขาใดก็ได้) = ใช้ record เดิม ย้าย `branchId` มาสาขานี้ (B18, E16); ตอบ `fromOtherBranch: { serial, branchCode }[]` = serial ที่อยู่สาขาอื่นล่าสุด (หน้าจอแนะนำให้ใช้ใบโอน, E32)     |
| `POST /products/:id/serials/remove` | `{ ids, status, note }` → `Product`                              | admin; `status` = sold / damaged / other; ไม่ลบ record; เฉพาะ serial ที่อยู่สาขานี้ (E16)                                                                                                                                                                                                                   |

รับเข้าไม่ได้เมื่อ `canPurchase()` เป็นเท็จ (`no_sale` ขายไม่ได้, `no_purchase` / `discontinued` รับไม่ได้)

ต้องมี `X-Branch-Id` (ไม่มี → 400, E17 / E24): `POST /products`, `PUT /products/:id`, `PUT /products/:id/stock`, `POST /products/:id/serials(/remove)`, `POST /sales`, `POST /sales/:id/void | credit-notes | exchanges | tax-invoice | tax-invoice/reissue`, ทุก `POST/PUT /shifts/…` — ทุกการเดินสต็อก / เอกสาร / กะเกิดที่สาขานั้น (กะได้ `branchId` ของเครื่อง, ใบกำกับได้ `branchId` ของบิล)

### ใบโอนสินค้า (SaaS ขั้น 5, E26–E29)

| method + path                 | body → response                                        | หมายเหตุ                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /transfers`              | `?branchId=<id>\|all&direction=out\|in` → `Transfer[]` | ใบที่ต้นทาง (`out`) / ปลายทาง (`in`) / อย่างใดอย่างหนึ่ง อยู่ในขอบเขต `branchScopeError()` (E23); ใหม่สุดก่อน                                                                             |
| `GET /transfers/:id`          | → `Transfer`                                           | ผู้ใช้ต้องเข้าสาขาต้นทางหรือปลายทางได้ → else 403                                                                                                                                         |
| `POST /transfers`             | `TransferPayload` → `Transfer`                         | ที่สาขาต้นทาง (`X-Branch-Id`); `transferError()`; non-serial ตัดที่ `avgCost` ต้นทาง (`transfer_out`, avg ไม่เปลี่ยน), serial → `in_transit` ทุนของเครื่อง; เลข `TR-<สาขา>-YYYYMMDD-NNNN` |
| `POST /transfers/:id/receive` | `TransferReceivePayload` → `Transfer`                  | ที่สาขาปลายทาง; `receiveTransferError()`; `transfer_in` เต็มจำนวนที่ `unitCost` (`movingAverage()`; serial `in_stock` ที่ปลายทาง) แล้ว `issue` ส่วนที่ขาด (serial → `damaged`) — E28      |
| `POST /transfers/:id/cancel`  | `{ reason }` → `Transfer`                              | admin (else 403) ที่สาขาต้นทาง; `cancelTransferError()`; `transfer_in` คืนต้นทางที่ทุนโอน                                                                                                 |

ลบ SKU / เปลี่ยนการคุม Serial / ประเภท: ใบโอนที่ยังไม่รับนับเป็นสต็อก → 400 "(ระหว่างโอน TR-…)" (E18)

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

| method + path                         | body → response                                                | หมายเหตุ                                                                                                                                                                                                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /sales`                          | `?from=&to=&shiftId=` → `Sale[]`                               | ตามวันขาย, ใหม่ก่อน; `shiftId` = ขายหรือ void ในกะนั้น; `returnStatus` / `creditedTotal` / `creditNoteNos` / `exchangeNos` คำนวณทุกครั้งที่อ่าน                                                                                                                                                                     |
| `GET /sales/:id`                      | → `Sale`                                                       |                                                                                                                                                                                                                                                                                                                     |
| `POST /sales`                         | `SalePayload` → `Sale`                                         | ลำดับตรวจด้านล่าง                                                                                                                                                                                                                                                                                                   |
| `POST /sales/cost-check`              | `SalePayload` (ไม่ต้องมี payments) → `{ issues: CartIssue[] }` | E45: `priceCart()` กับทุนจริงของสาขาใน header วันนี้ แล้วคืนเฉพาะ `belowCostIssues()` (คำเตือน "<SKU> ขายต่ำกว่าทุนหลังส่วนลดพิเศษ", ไม่มีตัวเลข); ไม่บันทึกอะไร ไม่ต้องมีกะ / เครื่อง; POS ของคนที่เห็นทุนไม่ได้เรียกเมื่อมีส่วนลดพิเศษ                                                                            |
| `POST /sales/:id/void`                | `VoidPayload { reason, approval? }` → `Sale`                   | `voidError(…, สาขาใน header)` (วันเดียวกับวันขาย + สาขาที่ขายเท่านั้น — D3 / E12 "บิลนี้ขายที่สาขา … — ยกเลิกได้ที่สาขานั้น"), `shiftBlocker('void')`; คืนเข้าสต็อกสาขาที่ขาย; คืนสต็อกที่ COGS ของบรรทัด, serial กลับเข้าคลัง (`currentSerial()`); ยกเลิกใบกำกับเต็มรูป; `voidedBy` / `voidApprovedBy` server ตั้ง |
| `PUT /sales/:id/status`               | `{ status }` → `Sale`                                          | เฉพาะออร์เดอร์ก่อน POS (ไม่มี lines); บิล POS → 400                                                                                                                                                                                                                                                                 |
| `GET/POST /sales/:id/credit-notes`    | `CreditNotePayload` → `CreditNote`                             | admin; `creditNoteError()` (ctx `here` = สาขาใน header ต้องเป็นสาขาที่ขาย, D3) / `draftCreditNote()`, `shiftBlocker('refund')`; snapshot `branchId`; เลข `CN-YYYYMMDD-NNNN`                                                                                                                                         |
| `GET /credit-notes`                   | `?from=&to=&shiftId=` → `CreditNote[]`                         |                                                                                                                                                                                                                                                                                                                     |
| `GET/POST /sales/:id/exchanges`       | `ExchangePayload` → `Exchange`                                 | `exchangeError()` (ctx `here`, D3); serial ใหม่ต้องอยู่ในคลังของสาขานี้ (E16); snapshot `branchId`; ไม่ต้องมีกะ; เลข `EX-YYYYMMDD-NNNN`                                                                                                                                                                             |
| `GET /sales/:id/tax-invoice`          | → `TaxInvoice \| null`                                         | ใบที่ยังใช้ได้ (`currentInvoice()`)                                                                                                                                                                                                                                                                                 |
| `POST /sales/:id/tax-invoice`         | `{ buyer }` → `TaxInvoice`                                     | `taxInvoiceError()`; ลงวันที่ / เลขตาม **วันขาย** `INV-<วันขาย>-NNNN`                                                                                                                                                                                                                                               |
| `GET /sales/:id/tax-invoices`         | → `TaxInvoice[]`                                               | ทุกใบ เก่าก่อน                                                                                                                                                                                                                                                                                                      |
| `POST /sales/:id/tax-invoice/reissue` | `{ buyer, reason }` → `TaxInvoice`                             | admin; `reissueError()`; ใบเก่าได้ `cancelledAt` / `replacedByNo`                                                                                                                                                                                                                                                   |
| `GET /tax-invoices`                   | `?from=&to=` → `TaxInvoice[]`                                  | admin; ตามวันที่ใบกำกับ เก่าก่อน (รายงานภาษีขาย)                                                                                                                                                                                                                                                                    |
| `GET /tax-invoices/buyer`             | `?taxId=` → `TaxInvoiceBuyer \| null`                          | ผู้ซื้อล่าสุดที่ใช้เลขนี้                                                                                                                                                                                                                                                                                           |

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

| method + path                       | body → response                              | หมายเหตุ                                                                                                                                               |
| ----------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /shifts/current`               | → `Shift \| null`                            | กะเปิดของเครื่องนี้                                                                                                                                    |
| `POST /shifts/open`                 | `ShiftOpenPayload` → `Shift`                 | `terminalError()`, `openShiftError()`; body `terminalId` ต่างจาก header → 400; เลข `SH-YYYYMMDD-NNNN`                                                  |
| `GET /shifts`                       | `?from=&to=&openOnly=1` → `Shift[]`          | ตามวันเปิดกะ; non-admin เฉพาะของตัวเอง; มี `adjustmentTotal`                                                                                           |
| `GET /shifts/last-float`            | → `{ floatLeft }`                            | กะปิดล่าสุดของเครื่องนี้                                                                                                                               |
| `GET /shifts/variance-report`       | `?from=&to=` → `VarianceReportRow[]`         | `varianceReport()`                                                                                                                                     |
| `GET /shifts/:id`                   | → `Shift`                                    |                                                                                                                                                        |
| `POST /shifts/:id/lock`             | → `Shift`                                    | E48: ล็อกหน้าจอ POS — `lockedAt` = ตอนนี้; กะเปิดของเครื่องนี้ (`X-Terminal-Id`)                                                                       |
| `POST /shifts/:id/unlock`           | `{ username, password }` → `Shift`           | E48: รหัสผิด → 400 (ข้อความเดียวกับ `auth/verify`); ไม่ใช่คนเปิดกะและไม่ใช่ admin → 400 "ปลดล็อกได้เฉพาะ <cashier> หรือผู้ดูแลระบบ"; `lockedAt` = null |     |
| `GET /shifts/:id/summary`           | → `ShiftSummary`                             | `shiftSummary()`; `lines` (ยอด) เฉพาะ admin หรือกะที่ปิดแล้ว — **blind count**                                                                         |
| `GET /shifts/:id/movements`         | → `CashMovement[]`                           |                                                                                                                                                        |
| `POST /shifts/:id/cash-movements`   | `CashMovementPayload` → `CashMovement`       | กะเปิดที่เครื่องนี้; `shiftBlocker('cash_movement')`, `cashMovementError()` (บอกยอดคาดเฉพาะ admin)                                                     |
| `GET/POST /shifts/:id/drawer-opens` | `{ reason }` → `DrawerOpen`                  | `shiftBlocker('drawer_open')`, `drawerOpenError()`                                                                                                     |
| `POST /shifts/:id/count-check`      | `{ counts }` → `CountCheckResult`            | `countInputsError()`, `countCheck()`; mock ไม่บันทึกอะไร — api จริงควร log การนับครั้งแรก; ไม่ตรวจ `X-Terminal-Id`                                     |
| `POST /shifts/:id/close`            | `ShiftClosePayload` → `Shift`                | `closeShiftError()`; `approval` ผิด / ไม่ใช่ admin → 400; ไม่ตรวจ `X-Terminal-Id` (admin ปิดแทนได้)                                                    |
| `POST /shifts/:id/approve`          | → `Shift`                                    | admin; เฉพาะ `pending`                                                                                                                                 |
| `GET/POST /shifts/:id/adjustments`  | `ShiftAdjustmentPayload` → `ShiftAdjustment` | admin; `shiftAdjustmentError()`; กะปิดแล้วเท่านั้น, ไม่แก้ยอดนับเดิม                                                                                   |

`POST /sales`, void, ใบลดหนี้ → 400 ตาม `shiftBlocker()` เมื่อ `StoreInfo.requireShift` เปิด

ขายระหว่างกะถูกล็อก (`lockedAt` ไม่ใช่ null) → 400 "หน้าจอถูกล็อก — ปลดล็อกก่อน" (E48: เดิมล็อกอยู่ใน localStorage ของเครื่อง ล้างแล้วปลดได้)

### บิลที่พักไว้ (E48 — เดิมอยู่ใน localStorage ของเครื่อง)

ต่อสาขา (`X-Branch-Id`) + เครื่อง (`X-Terminal-Id`, ไม่มี = เครื่องที่ไม่ใช่ POS → 400); body = `HeldBill` (`pos.store.ts`) — มีข้อมูลผู้ซื้อ (เลขผู้เสียภาษี / บัตร / ที่อยู่) จึงเก็บที่ server เท่านั้น

| method + path                | body → response                    | หมายเหตุ                                                          |
| ---------------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| `GET /pos/held-bills`        | → `HeldBill[]`                     | ของสาขา + เครื่องนี้ เก่าก่อน                                     |
| `POST /pos/held-bills`       | `HeldBill` ไม่มี `id` → `HeldBill` | server ออก `id`; ราคาใน bill ไว้แสดงเท่านั้น (ตอนเรียกคืนคิดใหม่) |
| `DELETE /pos/held-bills/:id` | → `null`                           | เรียกคืน / ทิ้ง; ของสาขา / เครื่องอื่น → 404                      |

## ที่จะเปลี่ยนตาม SaaS (`docs/saas-plan.md`)

ขั้น 1–6 ทำครบแล้วฝั่งหน้าบ้าน + mock (2026-10-18; หัวข้อด้านบน): login รหัสบริษัท, token มี tenant, `X-Branch-Id`, สิทธิ์สาขา, เอกสาร / สต็อกต่อสาขา, ใบโอน,
owner, แพ็กเกจ, billing, platform admin, สมัครใช้, ลืมรหัสผ่าน owner, export / ลบบริษัท, audit log

ยังไม่ทำ (เลื่อน): subdomain (D4), payment gateway (webhook ชำระเงิน), รายงานยื่นภาษีรวม (`vatFilingCombined`), จำกัดการ login ผิดต่อบัญชี / IP (หลังบ้านทำได้เลย)
