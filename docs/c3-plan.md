# แผน C3 — หน้าบ้านใช้ api จริง (local)

สถานะ: **ร่าง รอ review** (2026-10-25)
ที่มา: `docs/next-steps-plan.md` หัวข้อ C3 · api พร้อมแล้ว — C2 เสร็จ 2026-10-23 + E2E ของ an22-api ผ่านครบกับ image `7ce6576` (`an22-api/docs/e2e-test-plan.md` ข้อ 38)

## 1. ขอบเขต (ตกลง 2026-10-25)

| เรื่อง                                   | ตกลง                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| build production (`environment.ts`)      | `useMock: false` → เรียก `/api` จริงผ่าน an22-web                          |
| build dev (`environment.development.ts`) | **คง mock** (`useMock: true`) — ทำหน้าบ้านได้โดยไม่ต้องเปิด api            |
| ที่รัน                                   | **local เท่านั้น** — ไม่ deploy Azure ในรอบนี้                             |
| อีเมล                                    | **เลื่อน** — api ยังเป็น `LoggingMailer` (ไม่ส่ง / ไม่ log ลิงก์)          |
| เมนู "อีเมลที่ส่ง (mock)" ของ platform   | **ปล่อยไว้** — api จริงตอบ 404 (`GET /platform/outbox` ไม่มี — ตกลงตอน C2) |
| repo ที่ทำงาน                            | session ของ FrontEnd-An22 (`--add-dir ../an22-api --add-dir ../an22-web`)  |

ไม่อยู่ใน C3: deploy จริง (Azure Flexible Server, readiness probe / grace period ≥ 50 วิ, TLS), ผู้ให้บริการอีเมล, payment gateway, โหลดจริง, backup / restore

## 2. สภาพแวดล้อมทดสอบ

stack `an22-multi` ของ an22-api (`compose.multi.yaml`) + profile `web` — ไม่แตะ DB dev (project `an22-api`) / `noom-test.txt`

```
เบราว์เซอร์ (Claude in Chrome) → http://localhost:14000  an22-web (BFF: cookie an22.sid, XSRF, proxy /api)
                                   → lb :8080 (nginx) → api1 / api2 (image an22-api:local = main ล่าสุด)
                                   → PgBouncer → PostgreSQL 18 (seed DEMO)
```

ขั้นเปิด stack (ทำซ้ำได้ทุกรอบ):

1. หน้าบ้าน: `environment.ts` → `useMock: false` (บน branch ของ C3) → `npm run build`
2. an22-web: `cd ../an22-web && npm run docker:build` → image `an22-web:<sha ของหน้าบ้าน>[-dirty]` (คัดลอก `dist/` เข้า image — ไม่แก้โค้ด web)
3. an22-api: `BUILD=1 scripts/e2e/reset.sh` (DB สะอาด + seed + api 2 ตัว + lb, secrets สุ่มใน `.e2e/env` — ไม่ commit)
   แล้ว `WEB_IMAGE=an22-web:<tag> docker compose -p an22-multi -f compose.multi.yaml --env-file .e2e/env --profile web up -d web`
4. ตรวจ: `http://localhost:14000/healthz` 200, `/api/readyz` (ผ่าน web) 200

ข้อมูลเริ่มต้น = seed ของ api (= `seedDb()` ของ mock): บริษัท `DEMO` (HQ + BN), `admin` / `admin` (owner), `somchai` / `1234`, platform `platform` / `platform`
— ล้างใหม่ด้วยข้อ 3 เมื่อจำเป็นเท่านั้น (บอกก่อน)

## 3. ขั้นงาน

### C3.0 รีเช็คก่อนเปิดหน้าจอ

- `npm run build` (budget, mock chunk **ไม่อยู่** ใน build production: ไม่มี request ไปไฟล์ `mock-backend`), `npx ng test --watch=false`, `npx ng lint`, `npx prettier --check src docs`
- **endpoint ที่หน้าบ้านเรียก ↔ api จริง**: ทุก path จาก `api.get/post/put/delete` (108+ path, test-final 0.6) มี route ใน api
  (เทียบกับ `RequestMappingHandlerMapping` / controller ของ an22-api) — ที่ไม่มี = รายการ (คาด: `GET /platform/outbox` เท่านั้น)
- header ที่หน้าบ้านส่ง (`X-Branch-Id`, `X-Terminal-Id`, `X-XSRF-TOKEN`) ↔ ที่ web / api รับ

### C3.1 ทดสอบหน้าจอซ้ำ `docs/test-final.md` F1–F9 บน api จริง

รูปแบบเดียวกับ test-final (ตาราง # / กรณี / ผลที่คาด / ผล), ผลลง **`docs/test-c3.md`** — เริ่มจาก seed สะอาด, Claude in Chrome

- F1 Auth / โครงแอป · F2 ข้อมูลหลัก + ผู้ใช้ · F3 SKU / ราคา / โปร · F4 คลัง + โอน · F5 POS + กะ · F6 การขาย / หลังการขาย ·
  F7 ตั้งค่า / แดชบอร์ด / บัญชีบริษัท · F8 Platform · F9 สิทธิ์ข้ามบทบาท
- ที่ต่างจาก mock (คาดไว้ก่อน):
  - ลืมรหัสผ่าน (F1.10–1.11): ไม่มีลิงก์ใน outbox → สร้าง token ด้วย SQL แบบ E2E ข้อ 5 ของ an22-api แล้วเปิด `/auth/reset-password?token=…` (หรือ ⏭️)
  - เมนู "อีเมลที่ส่ง (mock)" → ข้อความ error ของ 404 (⚠️ ตามที่ตกลง)
  - เลขเอกสาร / วันที่ = วันจริงของเครื่อง (mock ใช้วันจริงเหมือนกัน — ตรวจแค่รูปแบบ)
  - ข้อมูลที่ mock เก็บใน localStorage ไม่ถูกใช้แล้ว (`an22.mock.*`) — ค่าของเครื่อง (`branch`, `pos.terminal.<companyId>`, theme) ยังอยู่
- ผลแต่ละหน้าจอเทียบกับ DB ได้เมื่อสงสัย (psql ใน container ของ stack)

### C3.2 เฉพาะ C3 (web + api จริง — mock ทดสอบไม่ได้)

| #    | ตรวจ                                                                                                                                     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1  | cookie: login → `an22.sid` (httpOnly, SameSite=Lax), ไม่มี token / ข้อมูลผู้ใช้ใน localStorage (E48); logout → cookie หาย, `/api/me` 401 |
| 2.2  | XSRF: request เขียนจากแอปมี `X-XSRF-TOKEN` ตรงกับ cookie `XSRF-TOKEN`; ยิงเองไม่มี header → 403                                          |
| 2.3  | reload URL ลึก / เปลี่ยนเมนู (full reload) / เปิดหลายแท็บ — session เดิม, `GET /me` ทุกหน้า                                              |
| 2.4  | CSP: console ไม่มี violation ทุกหน้า (E49), ไม่มี request ออกนอก origin (ยกเว้น Google Fonts)                                            |
| 2.5  | 401 กลางทาง (session หมดอายุ / api รีสตาร์ต token ยังใช้ได้) → กลับ login พร้อมข้อความ; error 4xx ของ api แสดงข้อความไทยตรงทุกตัวอักษร   |
| 2.6  | 2 instance: ทำงานต่อเนื่องขณะ lb สลับ api1 / api2 (`X-Upstream`), `docker restart` api ตัวหนึ่งระหว่างใช้งาน                             |
| 2.7  | rate limit ของ web (`AUTH_RATE_LIMIT` 20 / 15 นาที) + ของ api (login ผิด 5 ครั้ง → 429 ข้อความไทย) แสดงบนหน้าจอถูก                       |
| 2.8  | log ของ an22-web + api หลังทดสอบ: ไม่มีรหัสผ่าน / token / `XSRF-TOKEN` / เลขผู้เสียภาษี (B10 / E50) / ชื่อ-ที่อยู่ผู้ซื้อ                |
| 2.9  | ซ่อนทุน (E43–E46): `somchai` ไม่เห็นทุนทุกหน้าจอ / Excel, api ส่ง `null`                                                                 |
| 2.10 | ความเร็วโดยรวม: หน้าที่โหลดรายการใหญ่ (สินค้า, การขายทั้งเดือน) ไม่ช้าผิดปกติ — จดเวลาไว้                                                |

### C3.3 แก้สิ่งที่เจอ

- กติกาเดียวกับ E2E ของ an22-api: case ไม่ผ่าน → บันทึก ❌ + สาเหตุ + วิธีแก้ที่เสนอ แล้วไปต่อ; **แก้เป็นรอบเมื่อผู้ใช้สั่ง**
  (ยกเว้น bug ที่บล็อกการทดสอบ หรือทำให้ข้อมูลผิด / รั่ว → หยุดบอกทันที)
- แก้ในหน้าบ้าน: repo นี้ (+ test) · spec ต้องแก้ → บอกก่อน แล้วแก้ docs + mock commit เดียว ·
  bug ของ api / web → บอกก่อน, แก้ใน repo นั้นตามกติกาของมัน (`an22-api/CLAUDE.md`: ห้ามแก้ `../an22-web` โดยไม่ถาม)
- หลังแก้: build image ใหม่ (ขั้นใน §2) แล้วรันซ้ำเฉพาะ case ที่ ❌ + case ที่เกี่ยวข้อง

### C3.4 สลับถาวร

- commit `environment.ts` `useMock: false` (dev คง mock) + อัปเดต `CLAUDE.md` (หัวข้อ backend: production = api จริง, dev = mock),
  `docs/next-steps-plan.md` (C3 ✅ + ผล), `docs/backend/README.md` (ถ้ามีวิธีรัน local ที่เปลี่ยน), `docs/test-c3.md`
- PR ใน FrontEnd-An22 (ผู้ใช้ merge เอง); repo อื่นไม่ต้องแก้ถ้าไม่เจอ bug

## 4. ความเสี่ยง / ข้อควรระวัง

- **build production ไม่มี mock แล้ว**: ใครเปิด `dist/` โดยไม่มี api จะใช้ไม่ได้ — `npm start` (dev) ยังใช้ mock เหมือนเดิม
- an22-web ที่ deploy อยู่เดิม (ถ้ามี) จะใช้ไม่ได้จนกว่ามี api — C3 รอบนี้ local เท่านั้น จึงยังไม่กระทบ
- ข้อมูลที่ผู้ใช้เคยทำใน mock (localStorage) **ไม่ย้าย** ไป api — ตั้งใจ (mock เป็นข้อมูลทดลอง)
- ไม่มีความลับใน repo: secrets ของ stack อยู่ที่ `an22-api/.e2e/env` (ignore แล้ว)

## 5. เปิด session

```sh
cd ~/vscode/FrontEnd-An22 && claude --add-dir ../an22-api --add-dir ../an22-web
```

VS Code: เปิดโฟลเดอร์ `~/vscode/FrontEnd-An22` แล้วเริ่ม Claude ในนั้น (เพิ่ม `../an22-api`, `../an22-web` เป็น working directory เพิ่ม)
— ข้อความเริ่ม: "ทำ C3 ตาม `docs/c3-plan.md` เริ่มจาก C3.0" (ทีละขั้น หยุดรายงานทุกขั้น)
