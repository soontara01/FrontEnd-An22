# log การรันทดสอบรุ่น 2.0

ส่งต่อข้าม session: อ่านไฟล์นี้ก่อนทำต่อ แผนอยู่ที่ `docs/test-v2-platform.md` (หัวข้อ 0–1 = กติกา / เตรียม / ลำดับ) และ `docs/test-v2-user.md`

- branch ของ log / สิ่งที่เจอ: `test/v2-run` (FrontEnd-An22) — **ไม่ commit ลง main** (ผู้ใช้สั่ง)
- stack: project `an22-multi`, รหัสลับ `an22-api/.e2e/env` (สร้างใหม่ใน 1.5), override `docs/test-data/v2/compose.v2.yaml`
- เครื่องมือ (หัวข้อ 1.8): `C="docker compose -p an22-multi -f compose.multi.yaml -f ../FrontEnd-An22/docs/test-data/v2/compose.v2.yaml --env-file .e2e/env"` (รันใน `~/vscode/an22-api`)

## สถานะล่าสุด

| วัน           | ขั้น                  | สถานะ                                            |
| ------------- | --------------------- | ------------------------------------------------ |
| D1 2026-10-27 | 1 เตรียม              | ✅ เสร็จ                                         |
| D1 2026-10-27 | P0 stack              | ✅ 5/5                                           |
| D1 2026-10-27 | P1 login ผู้ให้บริการ | ✅ P1.1–P1.9 — ค้าง P1.10 (ท้าย D1)              |
| D1 2026-10-27 | P2.1                  | ✅                                               |
| D1 2026-10-27 | U1 + P2.2–P4          | ✅ (P3.2 ⚠️ V2-P-08) — ค้าง U1.7 pim, U1.8, U1.10 |
| D1 2026-10-27 | U2 ตั้งค่าร้าน        | ✅ (U2.4 ⚠️ V2-U-07) — ค้าง U2.1 ติ๊ก / ซ่อน / nok |
| D1 2026-10-27 | ถัดไป                 | ลำดับ 3: U3 ข้อมูลหลัก (SOMJAI) → U4–U10 → P5–P6 |

## สิ่งที่ค้าง / ต้องทำต่อ

- P1.10 ทำเป็น case สุดท้ายของ D1 (ล็อก IP 15 นาที)
- U1.7 (pim), U1.8 หลัง U4.1 ก่อน U4.4; U1.10 หลัง U3.5 + U4.7; P2.4 หลัง U4

## เลขเอกสาร / id ที่เกิดขึ้น

| รายการ                             | ค่า                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| platform admin                     | id 1 `platform` (INSERT 1.6 — 2026-10-27)                                                                  |
| บริษัท (id)                        | 1 SOMJAI · 2 ITMART · 3 NOVAT · 4 DELME (สมัคร 2026-10-27, ทดลองถึง 2026-11-10, ใบถัดไป 2026-11-11)        |
| สาขา HQ (id)                       | SOMJAI = 1 (ของบริษัทอื่นดูด้วย `q`)                                                                       |
| ที่อยู่ที่ใช้ตอนสมัคร (แผนไม่ระบุ) | ITMART "200 ถ.พระราม 9 กรุงเทพฯ" 02-333-4444 · NOVAT "5 ถ.งามวงศ์วาน นนทบุรี" · DELME "9 ถ.ทดลอง กรุงเทพฯ" |
| reset token                        | SOMJAI 1 แถว (U1.13 ก)                                                                                     |

## บันทึกการรัน

### D1 2026-10-27 — หัวข้อ 1 เตรียม

- **1.1** ✅ ทั้ง 3 repo อยู่ `main` สะอาด, HEAD = `origin/main`: FrontEnd `d88f25c` · an22-web `d16a1d1` · an22-api `03118f6` (ไม่ต้อง pull — สั่ง `switch`/`pull` ไม่ผ่าน permission แต่ตรวจด้วย `fetch` + `rev-parse` แล้วตรงกัน)
- **1.2** ✅ tag `2.0.0` (annotated) มีอยู่แล้วและ push แล้วทั้ง 3 repo ชี้ HEAD ข้างบน — สร้างเมื่อ 2026-10-27 16:12–16:22 ข้อความ "deploy" / "test" (ไม่ตรงข้อความในแผน — ไม่ย้าย tag, ดู V2-P-06)
- **1.3** FrontEnd: build ✅ (Initial total 545.09 kB) · test ✅ 68 ไฟล์ / 521 ข้อ · lint ✅ — an22-web: test ✅ 83 ผ่าน / 2 ข้าม (test MongoDB ต้องตั้ง `TEST_MONGODB_URI` — ครอบด้วย P1.3/P1.4) · image `an22-web:d88f25c` → `an22-web:2.0.0` (ไม่มี `.nvmrc` ใช้ `nvm use 24` — V2-P-07)
- **1.4** ✅ สร้าง `docs/test-data/v2/compose.v2.yaml` ตามแผน, `config` merge ได้
- **1.3** an22-api: `./mvnw -q verify` ✅ 415 ข้อ ผ่านทั้งหมด (ERROR ใน log 3 บรรทัด = `test-probe` ที่ตั้งใจ) · image `an22-api:2.0.0` label `an22.commit=2.0.0`
- **1.5** ✅ รหัสลับใหม่ใน `.e2e/env` (`JOBS_CRON="0 */5 * * * *"`), `down -v` ลบ stack C3 เดิม, `db-apply.sh` ไม่มี `--seed` → migrate v1–v9
- **1.6** ✅ INSERT `dt_platform_admins` → `1 | platform | ผู้ดูแลแพลตฟอร์ม | $2a$10$ | system`
- **1.7** ✅ api1/api2 `an22-api:2.0.0`, web `an22-web:2.0.0` healthy, db/pgbouncer/lb/mongo ขึ้นครบ, `/healthz` → `{"status":"ok"}`
- **1.8** ✅ helper อยู่ใน scratchpad ของ session (`v2tools.sh` — session ใหม่สร้างใหม่จากหัวข้อ 1.8); `q` เป็น read-only จริง (CREATE ถูกปฏิเสธ)

### D1 2026-10-27 — P0

- **P0.1** ✅ tag `2.0.0` = `origin/main` ทั้ง 3 repo; label `an22.commit=2.0.0`; api1/api2 = `an22-api:2.0.0`, web = `an22-web:2.0.0`
- **P0.2** ✅ `none` (ไม่มี mock ใน image) และ `public/index.html` ตรงกับ `dist/`
- **P0.3** ✅ flyway `1,…,9`; `0 | 0 | 0 | 0`; platform admin 1 แถว
- **P0.4** ✅ `mongodb` + `mongodb://mongo:27017/an22`; sessions = 0
- **P0.5** ✅ 401 ×6, api1 3 / api2 3

### D1 2026-10-27 — P1 / P2.1 (Chrome แท็บ platform)

- ก่อนเริ่ม: localStorage ของ `localhost:14000` มีค่าค้างจากรอบ C3 (`an22.pos.terminal.1/2/3`, `an22.branch`, `an22.companyCode`) — id บริษัทใหม่เริ่มที่ 1 อีก จึงล้าง localStorage ให้เป็นเครื่องใหม่ (เหลือ `an22.theme`)
- **P1.1** ✅ `/platform`, `/platform/companies` → `/platform/login` "ผู้ให้บริการระบบ" / "สำหรับผู้ดูแลแพลตฟอร์มเท่านั้น", ไม่มี "(ทดลอง…)", ช่องว่าง; sessions 0
- **P1.2** ✅ `platform`+ผิด และ `nobody` → "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" ทั้งคู่; throttle `account` 2 แถว (1/1) + `ip` 2, key = `key_hash` bytea 32 (ในแผนเขียน `key` — คอลัมน์จริงชื่อ `key_hash`)
- **P1.3** ✅ → `/platform/companies` "ทั้งหมด 0 บริษัท"; sessions 1, `eyJ` false, TTL index true; login ถูกลบแถว account ของ `platform` (ip ยัง 2)
- **P1.4** ✅ reload + `restart web` แล้วยังอยู่หน้าเดิม, sessions 1
- **P1.5** ✅ `/dashboard` → `/auth/login`
- **P1.6** ข้อ 1 ✅ token platform → `/products` 401 (และ `/me` 401) — ข้อ 2 รอหลัง U1
- **P1.9** ✅ 2 แท็บ, logout แท็บ A → แท็บ B กดโหลดใหม่ → `/platform/login?expired=1` "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"
- **P2.1** ✅ "ทั้งหมด 0 บริษัท" "ไม่พบบริษัท", console ไม่มี error
- หมายเหตุ IP: login ไม่ผ่านจากเครื่องทดสอบนับไปแล้ว 2–3 ครั้ง (เพดาน web 20 / 15 นาที)
- **P1.6** ข้อ 2 ✅ token ร้าน SOMJAI → `/platform/companies` 401 (control `/me` 200)
- **P1.7** ✅ ดัก XHR ใน page: `/api/platform/companies` มีแค่ header `accept` (ขณะ localStorage มี `an22.branch`); api log `branch=null` ส่วน request ร้าน `/company/onboarding` `branch=1`
- **P1.8** ✅ logout platform → `/platform/login`, ร้าน `/sales` ยังใช้ได้, sessions ยัง 1

### D1 2026-10-27 — U1 (Chrome แท็บร้าน)

- วิธีกรอก: focus ช่องด้วย JS แล้วพิมพ์ด้วยคีย์บอร์ด (`computer type`), กดปุ่มด้วยการคลิก
- **U1.1** ✅ ข้อความครบ 6 ข้อ ตามลำดับ (`ab` และ `ร้าน1` ได้ข้อความรหัสเดียวกัน); บริษัท 0 — ข้อสังเกต V2-U-05
- **U1.2** ✅ `/dashboard`, เริ่มต้นใช้งาน 0/5, toolbar "บริษัท ร้านมือถือสมใจ จำกัด · สำนักงานใหญ่"; DB ตรงทุกข้อ (audit detail เป็น ISO `2026-11-10` = V2-U-02)
- **U1.3–U1.5** ✅ ITMART standard / NOVAT VAT f + tax_id ว่าง / DELME; signup 1 แถวต่อบริษัท — ระหว่างนี้เจอ V2-U-04 (logout จาก `/sales` → "เซสชันหมดอายุ")
- **U1.6** ✅ `somjai` → snackbar "รหัสบริษัทนี้ถูกใช้แล้ว"; ยัง 4 บริษัท
- **U1.7** ✅ (ยกเว้น pim) NOPE / รหัสผิด / ghost → "รหัสบริษัท ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง"; `login_failed` ของ SOMJAI 2 แถว (somjai, ghost)
- **U1.9** ✅ หลัง logout "บริษัท: SOMJAI · เปลี่ยน", ช่องว่าง; localStorage = `an22.branch`, `an22.companyCode`, `an22.theme` เท่านั้น
- **U1.11** ✅ จอกลับ login, back + reload ยังอยู่ login; sessions 1 → 0; curl ผ่าน web: cookie เดิมหลัง logout → `/api/me` 401
- **U1.12** ✅ แท็บ B → `/auth/login?expired=1` "เซสชันหมดอายุ…" ไม่มี snackbar
- **U1.13** ✅ ข้อความเดียว 3 แบบ; token SOMJAI 1 แถว อายุ 1 ชม.; log `อีเมล (ยังไม่ส่งจริง) ถึง o***@somjai.test` ไม่มีลิงก์ / token
- **U1.14** ✅ token ปลอม → "ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง หมดอายุ หรือใช้ไปแล้ว — ขอลิงก์ใหม่"; ลิงก์จริง ⏭️ (Q3)
- **U1.15** ✅ (login อยู่) "404 - ไม่พบหน้าที่ต้องการ" + `<a href="/">`; ยังไม่ login → `/auth/login` (V2-U-06)

### D1 2026-10-27 — P2.2–P4 (แท็บ platform)

- **P2.2** ✅ 4 แถว Starter/Standard/Starter/Starter · ทดลองใช้ · 1/1/0 · - · 11 พ.ย. 2569; DB `t | 14 | 15` ทุกบริษัท
- **P2.3** ✅ `mart` → ITMART, `ร้านมือถือ` → SOMJAI, `zzz` → "ไม่พบบริษัท"
- **P3.1** ✅ หัวข้อ, เลขภาษี, "วิชัย มั่นคง (wichai) · owner@itmart.test", 10 พ.ย. / 11 พ.ย. 2569, "ยังไม่มีใบแจ้งหนี้", การ์ดครบ — ตรง DB
- **P3.2** ⚠️ snackbar "ไม่พบบริษัท", console สะอาด แต่ spinner หมุนค้าง (V2-P-08)
- **P4.1** ✅ ปุ่มปิดก่อนเลือก; เลือก Pro → "เปลี่ยนเป็นแพ็กเกจ Pro แล้ว"; DB `pro` + audit `plan_change | platform | t | ผู้ดูแลแพลตฟอร์ม | ITMART | ผู้ให้บริการเปลี่ยนเป็นแพ็กเกจ Pro`; รายการ Pro; wichai `/account/subscription` "แพ็กเกจปัจจุบัน: Pro" (หมายเหตุ: ครั้งแรกคลิก option ด้วย ref แล้วโดน Starter — ยังไม่กดบันทึก ไม่มีผล)
- **P4.2** ✅ DELME → Standard → Starter บันทึกได้ทั้งคู่; audit 2 แถว, `starter`
- สถานะเบราว์เซอร์ตอนนี้: แท็บร้าน login wichai (ITMART); แท็บ platform login อยู่

### D1 2026-10-27 — U2 (แท็บร้าน)

- **U2.1** ✅ (ส่วนแรก) somjai แดชบอร์ด "เริ่มต้นใช้งาน 0/5" ครบ 5 ขั้น — ติ๊กหลัง U3–U6, "ซ่อน" และ nok ไม่เห็น: ทำหลัง U6 / U4.1
- **U2.2** ✅ 400 → "จำนวนวันเปลี่ยนสินค้าต้องเป็นจำนวนเต็ม 0–365" (ปุ่มบันทึกปิด); 50 บันทึก + reload ยัง 50; DB `50.00 | 7`; audit `company_settings` "ส่วนต่างที่ต้องให้ admin อนุมัติ: ฿100 → ฿50"
- **U2.3** ✅ preview เปลี่ยนก่อนบันทึก, reload ยังอยู่; 201 ตัว → "ข้อความท้ายใบเสร็จต้องไม่เกิน 200 ตัวอักษร" (ไม่บันทึก); DB HQ `ขอบคุณที่อุดหนุนร้านสมใจ`; audit `branch_settings` branch_id 1 (detail เป็นข้อความคงที่ "แก้ชื่อสถานประกอบการ / ที่อยู่ / โทร / ท้ายใบเสร็จ" — ตรงกับ api + IT)
- **U2.4** ⚠️ NOVAT (nid): สวิตช์จด VAT ปิด, preview "ใบเสร็จรับเงิน" ไม่มีบรรทัด VAT — แต่มี "POS ID E051234567890" จากบิลตัวอย่าง (V2-U-07)
- **U2.5** ✅ โหมดมืด: `html.dark-theme`, ข้อมูลหลัก / ตั้งค่า / POS / บัญชีบริษัท อ่านได้, อยู่ข้าม reload; localStorage `an22.theme` เท่านั้น ไม่มี request ไป server (สลับกลับโหมดสว่างหลังทดสอบ)

