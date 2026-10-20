# เอกสารส่งต่อหลังบ้าน (สำหรับ repo web / api)

สถานะ: เริ่ม 2026-10-16 — SaaS ขั้น 1–5 เสร็จ, ขั้น 6 (ส่วน SaaS: owner, แพ็กเกจ, billing mock, platform admin, สมัครใช้, export / ลบ, audit log) เสร็จฝั่งหน้าบ้าน + mock 2026-10-18 — mock เก็บ db ละบริษัท; ซ่อนทุนจาก role user (P5, E43–E46) เสร็จ 2026-10-18; ทุกขั้นของ `docs/saas-plan.md` อัปเดตไฟล์ในโฟลเดอร์นี้ใน commit เดียวกับโค้ด

## ระบบมี 3 repo (E47, 2026-10-18 — เดิมแยก db เป็น repo ของตัวเอง)

| repo                         | หน้าที่                                                                                  | อ่านอะไรจากที่นี่                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **FrontEnd-An22** (repo นี้) | Angular SPA + mock backend — **แหล่งความจริงของ spec**                                   | —                                                                                               |
| **web** (`an22-web`)         | Node.js serve ไฟล์ static ของหน้าบ้าน + proxy `/api`                                     | หัวข้อ "web" ด้านล่าง, `deploy/nginx.conf` / `deploy/web.config` (ตัวอย่าง)                     |
| **api**                      | Java Spring Boot ต่อ PostgreSQL — ทำ API จริงแทน mock **และเป็นเจ้าของ schema** (Flyway) | `api-contract.md`, `domain-rules.md`, `data-model.md`, `docs/saas-plan.md` หัวข้อ 2, 3, 16 (D7) |

ลำดับทำ: **web → api** (E47)

- **web ก่อน**: งานเล็กและไม่ขึ้นกับใคร — build ของ repo นี้ใช้ `useMock: true` (`src/environments/environment.ts`) mock รันในเบราว์เซอร์ทั้งหมด
  จึงทดสอบ web กับแอปจริงได้ทันที; proxy `/api` ตั้งไว้ชี้ api ได้เลย แต่ยังไม่มีใครเรียกจนกว่าจะ build ด้วย `useMock: false`
- **api** มี migration ของ PostgreSQL อยู่ในตัว (`src/main/resources/db/migration`, Flyway) — schema กับโค้ดที่ใช้มันเปลี่ยนใน commit เดียวกัน,
  test ด้วย Testcontainers ได้ตั้งแต่วันแรก; กติกาของ schema (tenant_id + RLS — D7, ตาราง platform ไม่อยู่ใต้ RLS, audit_log insert-only, seed) เหมือนเดิมทุกข้อ
- สลับหน้าบ้านไปใช้ api จริง: `useMock: false` เมื่อ api ตอบครบตาม `api-contract.md` (ดู "Switching to a real backend" ใน `CLAUDE.md`)

## ไฟล์ในโฟลเดอร์นี้

- [`api-contract.md`](api-contract.md) — ทุก endpoint, header, auth, รูปแบบ error, status code
- [`domain-rules.md`](domain-rules.md) — กฎธุรกิจที่ server ต้องทำให้ผลตรงกับหน้าบ้าน (ฟังก์ชันไหน ไฟล์ไหน ใช้ที่ endpoint ไหน)
- [`data-model.md`](data-model.md) — entity → ตาราง, key, unique, ค่าที่ server คำนวณ, เลขรันเอกสาร, ระดับบริษัท / สาขา
- [`../decisions.md`](../decisions.md) — ดัชนีข้อตัดสินใจทั้งหมด (D, S, T, B) ชี้ไปไฟล์ plan ที่มีรายละเอียด
- [`fixtures/`](fixtures/README.md) — golden test cases ของกฎคำนวณ (input → output ที่ถูก) สร้างจากโค้ด TypeScript ให้ JUnit ฝั่ง api อ่านไฟล์เดียวกัน:
  `price-cart.json` (`priceCart()`), `payment.json` (`paymentSummary()` / `paymentError()`)

## หลักการ

1. **mock คือ reference implementation** — `src/app/core/interceptors/mock-backend.interceptor.ts` ตอบทุก endpoint
   ที่หน้าบ้านใช้ เอกสารไม่ชัดตรงไหน ให้ถือพฤติกรรมของ mock (และ spec `mock-backend.interceptor.spec.ts`) เป็นคำตอบ
2. **รูปร่างข้อมูล = interface TypeScript ใน `src/app/core/models/*.model.ts`** — เอกสารที่นี่ไม่ลอก field ทุกตัวซ้ำ
   (ลอก = เพี้ยน) แต่บอกสิ่งที่ TypeScript ไม่ได้บอก: key, unique, nullable, ใครคำนวณ, เก็บหรือ derive
3. **กฎธุรกิจเป็น pure function ใน `core/models`** ใช้ร่วม UI + mock — api ต้อง port ให้ได้ผลเหมือนกันทุกตัวเลข
   (ทศนิยม, การปัดเศษ, ข้อความ error ภาษาไทย) ห้ามคิดสูตรใหม่
4. **server คือผู้ตัดสิน** — หน้าบ้านตรวจก่อนเพื่อ UX เท่านั้น server ตรวจซ้ำทุกกฎ (สิทธิ์, สต็อก, ราคา, กะ, เครื่อง POS)
5. ข้อความ error เป็นภาษาไทย ส่งใน `{ "message": "..." }` หน้าบ้านแสดงตรง ๆ (ดู `api-contract.md`)

## ให้ Claude ใน repo อื่นอ่าน repo นี้ได้

clone ทุก repo ไว้ในโฟลเดอร์แม่เดียวกัน (เช่น `~/vscode/FrontEnd-An22`, `~/vscode/an22-web`, `~/vscode/an22-api`) แล้วในแต่ละ repo:

```jsonc
// .claude/settings.json
{ "permissions": { "additionalDirectories": ["../FrontEnd-An22"] } }
```

(หรือเปิดด้วย `claude --add-dir ../FrontEnd-An22`) แล้วใน `CLAUDE.md` ของ repo นั้นเขียนว่า
"spec อยู่ที่ `../FrontEnd-An22/docs/backend/README.md` อ่านก่อนทำงาน"

## สิ่งที่ `CLAUDE.md` ของแต่ละ repo ควรมี

**web**

- serve `dist/frontend-an22/browser` (build ของ repo นี้: `npm run build`)
- SPA fallback: path ที่ไม่ใช่ไฟล์ → `index.html` (ทุกเมนูเป็น full page reload — ดู "SPA per menu" ใน `CLAUDE.md`)
- `index.html` → `Cache-Control: no-cache`; ไฟล์ที่มี hash (`*-<hash>.js|css`) → cache ยาว `immutable`
- proxy `/api` → api **โดยคง `/api` ไว้** (`/api/auth/login` → `http://<api>:8080/api/auth/login` — api ตั้ง context path `/api`;
  dev ของหน้าบ้านใช้ `proxy.conf.json` แบบเดียวกัน); ตัวอย่าง config ใน `deploy/nginx.conf`, `deploy/web.config`
- ไฟล์อื่นที่ไม่มี hash (`favicon.ico`) → `no-cache` ด้วย; path ที่ดูเป็นไฟล์แต่ไม่มีจริง → 404 (ไม่ตอบ `index.html` แทน JS)
- ทดสอบได้ก่อนมี api: build ของ repo นี้ใช้ mock ในเบราว์เซอร์ (`useMock: true`) — ตรวจ fallback / cache header / ไม่มี request `/api` ออกไป
- **session ของ login (E48, BFF)**: web ถือ token ที่ api ออกไว้ใน session (store `memory` / `mongodb` เลือกด้วย env), browser ได้แค่ cookie `an22.sid` (httpOnly, SameSite=Lax);
  web ใส่ `Authorization` ให้ทุก request `/api`, ตอบ `auth/logout` / `platform/auth/logout` เอง, กัน CSRF ด้วย `XSRF-TOKEN` / `X-XSRF-TOKEN`, ไม่ใช้งาน 12 ชม. / สูงสุด 7 วัน — รายละเอียด `api-contract.md` หัวข้อ "Session"
- **ทำแล้ว (C1, 2026-10-19): repo `an22-web`** — Node 24 + Express 5 (TypeScript รันตรง), port `4000`, env `API_URL` / `DIST_DIR` / `LOG_LEVEL`,
  health `GET /healthz`, deploy เป็น Docker image ที่มี dist ของหน้าบ้านอยู่ในตัว (`npm run docker:build`); รายละเอียดใน `CLAUDE.md` ของ repo นั้น

**api** (รวมงาน db เดิม — E47)

- เวอร์ชัน Java / Spring Boot, โครง package, คำสั่ง build / test
- **schema = migration ของ Flyway ใน repo นี้เท่านั้น** (`src/main/resources/db/migration/V<n>__<desc>.sql`, ไม่แก้ไฟล์ที่ apply แล้ว) —
  ห้ามใช้ Hibernate `ddl-auto` (`validate` ได้); คำสั่งรัน / รีเซ็ต PostgreSQL local และ test ด้วย Testcontainers
- ทุกตารางข้อมูลมี `tenant_id` (+ `branch_id` ตามระดับใน `data-model.md`), เปิด RLS, policy อ่านจาก `current_setting('app.tenant_id')` (D7)
- ทุก unique key รวม `tenant_id`; เงินเป็น `numeric(14,2)`; เวลาเป็น `timestamptz`; วันที่ธุรกิจเป็น `date`
- ตาราง platform (`companies`, ใบแจ้งหนี้, `platform_admins`, `password_reset_tokens`) ไม่อยู่ใต้ RLS และใช้ DB role แยก; `audit_log` insert-only
- seed สำหรับ dev ตรงกับ seed ของ mock (บริษัท `DEMO`, สาขา `HQ` + `BN`, login `admin` / `admin`, พนักงาน `somchai` / `1234`, platform `platform` / `platform`)
- JWT ไม่ถึง browser (web ถือไว้ — E48) อายุ ≥ 7 วัน; tenant มาจาก JWT เท่านั้น; ทุก transaction `SET LOCAL app.tenant_id`; ตรวจ `X-Branch-Id` / `X-Terminal-Id` ทุก request
- กฎใน `domain-rules.md` port เป็น class แยก (ไม่ผูก Spring) + test ด้วย `fixtures/` ของ repo นี้
- ตอบ JSON ตาม `api-contract.md`: ไม่ละ field ที่เป็น `null` (`spring.jackson.default-property-inclusion=always`), วันที่เป็น ISO-8601
