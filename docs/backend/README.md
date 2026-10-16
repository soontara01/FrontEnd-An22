# เอกสารส่งต่อหลังบ้าน (สำหรับ repo web / api / db)

สถานะ: เริ่ม 2026-10-16 — SaaS ขั้น 1 (login รหัสบริษัท, token มี tenant, `X-Branch-Id`; ข้อมูลยัง 1 บริษัท 1 สาขา); ทุกขั้นของ `docs/saas-plan.md` อัปเดตไฟล์ในโฟลเดอร์นี้ใน commit เดียวกับโค้ด

## ระบบมี 4 repo

| repo                         | หน้าที่                                                | อ่านอะไรจากที่นี่                                         |
| ---------------------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| **FrontEnd-An22** (repo นี้) | Angular SPA + mock backend — **แหล่งความจริงของ spec** | —                                                         |
| **db**                       | สคริปต์ PostgreSQL ทั้งหมด (migration, RLS, seed)      | `data-model.md`, `docs/saas-plan.md` หัวข้อ 2, 3, 16 (D7) |
| **api**                      | Java Spring Boot ต่อ PostgreSQL — ทำ API จริงแทน mock  | `api-contract.md`, `domain-rules.md`, `data-model.md`     |
| **web**                      | Node.js serve ไฟล์ static ของหน้าบ้าน + proxy `/api`   | หัวข้อ "web" ด้านล่าง, `deploy/nginx.conf` (ตัวอย่าง)     |

ลำดับทำ: **db → api → web** (api ต้องมี schema ก่อน, web ต้องมี api ให้ proxy) — หน้าบ้านทำ SaaS ขั้น 1–6 ด้วย mock ไปก่อนได้

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

clone ทุก repo ไว้ในโฟลเดอร์แม่เดียวกัน (เช่น `~/vscode/FrontEnd-An22`, `~/vscode/an22-api`, …) แล้วในแต่ละ repo:

```jsonc
// .claude/settings.json
{ "permissions": { "additionalDirectories": ["../FrontEnd-An22"] } }
```

(หรือเปิดด้วย `claude --add-dir ../FrontEnd-An22`) แล้วใน `CLAUDE.md` ของ repo นั้นเขียนว่า
"spec อยู่ที่ `../FrontEnd-An22/docs/backend/README.md` อ่านก่อนทำงาน"

## สิ่งที่ `CLAUDE.md` ของแต่ละ repo ควรมี

**db**

- เครื่องมือ migration (แนะนำ Flyway: `V<n>__<desc>.sql`, ไม่แก้ไฟล์ที่ apply แล้ว) และคำสั่งรัน / รีเซ็ต DB local
- ทุกตารางข้อมูลมี `tenant_id` (+ `branch_id` ตามระดับใน `data-model.md`), เปิด RLS, policy อ่านจาก `current_setting('app.tenant_id')` (D7)
- ทุก unique key รวม `tenant_id`; เงินเป็น `numeric(14,2)`; เวลาเป็น `timestamptz`; วันที่ธุรกิจเป็น `date`
- seed สำหรับ dev ตรงกับ seed ของ mock (บริษัท `DEMO`, สาขา `HQ`, login `admin` / `admin`, พนักงาน `somchai` / `1234`)

**api**

- เวอร์ชัน Java / Spring Boot, โครง package, คำสั่ง build / test
- **ห้ามใช้ Hibernate `ddl-auto`** — schema มาจาก repo db เท่านั้น (`validate` ได้)
- tenant มาจาก JWT เท่านั้น; ทุก transaction `SET LOCAL app.tenant_id`; ตรวจ `X-Branch-Id` / `X-Terminal-Id` ทุก request
- กฎใน `domain-rules.md` port เป็น class แยก (ไม่ผูก Spring) + test ด้วย `fixtures/` ของ repo นี้
- ตอบ JSON ตาม `api-contract.md`: ไม่ละ field ที่เป็น `null` (`spring.jackson.default-property-inclusion=always`), วันที่เป็น ISO-8601

**web**

- serve `dist/frontend-an22/browser` (build ของ repo นี้: `npm run build`)
- SPA fallback: path ที่ไม่ใช่ไฟล์ → `index.html` (ทุกเมนูเป็น full page reload — ดู "SPA per menu" ใน `CLAUDE.md`)
- `index.html` → `Cache-Control: no-cache`; ไฟล์ที่มี hash (`*-<hash>.js|css`) → cache ยาว `immutable`
- proxy `/api` → api (dev ของหน้าบ้านใช้ `proxy.conf.json` แบบเดียวกัน); ตัวอย่าง config ใน `deploy/nginx.conf`, `deploy/web.config`
