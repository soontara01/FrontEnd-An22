# log การรันทดสอบรุ่น 2.0

ส่งต่อข้าม session: อ่านไฟล์นี้ก่อนทำต่อ แผนอยู่ที่ `docs/test-v2-platform.md` (หัวข้อ 0–1 = กติกา / เตรียม / ลำดับ) และ `docs/test-v2-user.md`

- branch ของ log / สิ่งที่เจอ: `test/v2-run` (FrontEnd-An22) — **ไม่ commit ลง main** (ผู้ใช้สั่ง)
- stack: project `an22-multi`, รหัสลับ `an22-api/.e2e/env` (สร้างใหม่ใน 1.5), override `docs/test-data/v2/compose.v2.yaml`
- เครื่องมือ (หัวข้อ 1.8): `C="docker compose -p an22-multi -f compose.multi.yaml -f ../FrontEnd-An22/docs/test-data/v2/compose.v2.yaml --env-file .e2e/env"` (รันใน `~/vscode/an22-api`)

## สถานะล่าสุด

| วัน           | ขั้น                  | สถานะ                                                                                   |
| ------------- | --------------------- | --------------------------------------------------------------------------------------- |
| D1 2026-10-27 | 1 เตรียม              | ✅ เสร็จ                                                                                |
| D1 2026-10-27 | P0 stack              | ✅ 5/5                                                                                  |
| D1 2026-10-27 | P1 login ผู้ให้บริการ | ✅ P1.1–P1.5, P1.6 (ข้อ 1), P1.9 — ค้าง P1.6 (ข้อ 2), P1.7, P1.8 หลัง U1; P1.10 ท้าย D1 |
| D1 2026-10-27 | P2.1                  | ✅                                                                                      |
| D1 2026-10-27 | ถัดไป                 | ลำดับ 2: ไฟล์ user U1 (สมัคร 4 บริษัท) → P2.2–P4                                        |

## สิ่งที่ค้าง / ต้องทำต่อ

- P1.6 (ส่วน token ร้าน), P1.7, P1.8 ต้องทำหลัง U1
- P1.10 ทำเป็น case สุดท้ายของ D1 (ล็อก IP 15 นาที)

## เลขเอกสาร / id ที่เกิดขึ้น

| รายการ         | ค่า                                       |
| -------------- | ----------------------------------------- |
| platform admin | id 1 `platform` (INSERT 1.6 — 2026-10-27) |

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
