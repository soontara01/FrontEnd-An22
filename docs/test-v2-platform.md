# ทดสอบรุ่น 2.0 เสมือนใช้งานจริง — ส่วน platform (ผู้ให้บริการ)

สถานะ: **พร้อมรัน — ผู้ใช้ตอบ Q1–Q5 แล้ว (2026-10-27) รอสั่งเริ่ม** (เขียน 2026-10-27)
คู่กับ: `docs/test-v2-user.md` (ส่วนผู้ใช้ / ร้านค้า) — **หัวข้อ 0–1 ของไฟล์นี้ใช้กับทั้งสองไฟล์**

## 0. ภาพรวมและกติกา

**เป้าหมาย**: ทดสอบระบบทั้งหมดรุ่น 2.0 (tag `2.0.0`) เหมือนตอนเปิดใช้งานจริง:

- ทั้ง 3 repo pull จาก `main` แล้ว tag `2.0.0`, build image ใหม่ และ deploy บน docker
- stack: web (an22-web + MongoDB) → load balancer → api 2 ตัว → PostgreSQL ผ่าน PgBouncer
- DB ว่างตั้งแต่ศูนย์ ไม่ใช้ seed DEMO และไม่ใช้ mock
- ทุก case ทำผ่านหน้าจอจริง ถ้าทำผ่านหน้าจอไม่ได้จึงยิง api
- ทุก case กำหนดทั้ง **ผลที่คาดบนหน้าจอ** และ **ผลที่คาดใน DB** (query ดู)

**กติกา**

- **ไม่แก้โค้ดระหว่างทดสอบ**: สิ่งที่เจอให้บันทึกในหัวข้อ "สิ่งที่เจอ" ของไฟล์นั้น (รหัส `V2-P-xx` / `V2-U-xx`) แล้วแก้รวมหลังทดสอบเสร็จตามที่ผู้ใช้สั่ง
- **DB อ่านอย่างเดียว** ผ่าน `q` (transaction read-only) มีข้อยกเว้นแค่ 2 ข้อ ที่ผู้ใช้อนุมัติแล้ว (หัวข้อ 1.9):
  - สร้าง platform admin คนแรก (Q1 — หัวข้อ 1.6)
  - เลื่อนวันที่ใน case ที่มีป้าย ⏱️ เพราะรอจริงเป็นสัปดาห์ไม่ได้ (Q2) — ใช้เฉพาะคำสั่ง UPDATE ที่เขียนไว้ใน case นั้น
- ข้อมูลทุกอย่างสร้างผ่านหน้าจอ ไม่ใช้ api สร้างข้อมูลแทนหน้าจอ
- ไม่ reset / ลบ stack ระหว่างทดสอบโดยไม่บอกผู้ใช้ เพราะต้องเล่นข้าม 2 วันจริง
- ดาวน์โหลดไฟล์ (Excel / JSON) ให้ดักใน page ไม่ให้ไฟล์ลงเครื่อง ส่วน `window.print` ให้แทนใน page ก่อนเปิดหน้าที่พิมพ์เอง
- ผล: ✅ ผ่าน · ❌ ไม่ผ่าน · ⚠️ ผ่านแต่มีข้อสังเกต · ⏭️ ทำไม่ได้ / ข้าม (ระบุเหตุผล)

**ป้ายช่องทาง** (ท้ายชื่อ case):

- `จอ` = ทำผ่านหน้าจอ (Claude in Chrome ที่ http://localhost:14000)
- `API` = ยิง api เพราะทำผ่านหน้าจอไม่ได้
- `DB` = query อย่างเดียว
- ⏱️ = ต้องเลื่อนวันใน DB ก่อน (อนุมัติแล้ว — Q2)
- `D1` / `D2` = วันที่ทดสอบวันแรก / วันถัดไปจริง

**ไม่อยู่ในรอบนี้**:

- https / โดเมนจริง / Azure
- ผู้ให้บริการอีเมลจริง (api log ว่า "ส่งแล้ว" เท่านั้น)
- payment gateway
- โหลดหนัก / ทดสอบความเร็ว
- backup / restore

## 1. เตรียม (ทำครั้งเดียว ก่อนทั้งสองไฟล์)

### 1.1 pull + ตรวจ repo

```bash
cd ~/vscode
for r in FrontEnd-An22 an22-web an22-api; do
  git -C $r switch main && git -C $r pull --ff-only && git -C $r status --short   # ต้องว่าง
done
```

### 1.2 tag `2.0.0`

tag แบบ annotated เหมือน tag เดิม (`1.1.0`), ชื่อไม่มี `v`

```bash
for r in FrontEnd-An22 an22-web an22-api; do
  git -C $r tag -a 2.0.0 -m "2.0.0 — ทดสอบเสมือนใช้งานจริง (docs/test-v2-*.md)"
  git -C $r push origin 2.0.0
done
```

ถ้าทดสอบแล้วต้องแก้ ให้ออกรุ่น `2.0.1` (ไม่ย้าย tag `2.0.0`)

### 1.3 build + gate

```bash
# หน้าบ้าน (dist ของ production: useMock false)
cd ~/vscode/FrontEnd-An22 && nvm use && npm ci && npm run build && npx ng test --watch=false && npx ng lint
# web: image = server + dist ข้างบน → tag 2.0.0
cd ~/vscode/an22-web && nvm use && npm ci && npm test && npm run docker:build
docker tag an22-web:$(git -C ../FrontEnd-An22 rev-parse --short HEAD) an22-web:2.0.0
# api: unit + integration แล้ว build image
cd ~/vscode/an22-api && ./mvnw -q verify && docker build -t an22-api:2.0.0 --label an22.commit=2.0.0 .
```

### 1.4 compose override (สร้างตอนรันที่ `docs/test-data/v2/compose.v2.yaml`)

ใช้คู่กับ `an22-api/compose.multi.yaml` โดยไม่แก้ไฟล์ของ an22-api:

```yaml
# ทดสอบรุ่น 2.0: image 2.0.0, DB ไม่มี seed, web เก็บ session ใน MongoDB
services:
  api1:
    image: an22-api:2.0.0
    environment:
      AN22_DB_LOCATIONS: filesystem:db/migration # ไม่มี db/seed เหมือน production
  api2:
    image: an22-api:2.0.0
    environment:
      AN22_DB_LOCATIONS: filesystem:db/migration
  mongo:
    image: mongo:8.0 # รุ่นเดียวกับ an22-web/compose.yaml, ไม่เปิด port ออกนอก network
    volumes: [mongo-data:/data/db]
  web:
    image: an22-web:2.0.0
    environment:
      SESSION_STORE: mongodb
      MONGODB_URI: mongodb://mongo:27017/an22
    depends_on: [lb, mongo]
volumes:
  mongo-data:
```

### 1.5 รหัสลับใหม่ + DB ว่าง

รายละเอียด:

- คำสั่ง `down -v` ลบ volume ของ project `an22-multi` ทั้งหมด ข้อมูล C3 เดิมจะหายตามที่ผู้ใช้สั่ง "db ล้างใหม่"
- DB dev ของ project `an22-api` ไม่ถูกแตะ
- `JOBS_CRON` ตั้งให้ job ทุก 5 นาที (production = ทุกวัน 00:05) เพื่อให้เห็น job ของ 2 instance ภายในวันทดสอบ ระหว่างนั้น login หรือ `GET /me` ก็ไล่ออกใบแจ้งหนี้ให้เองเหมือนจริง
- `db-apply.sh` รันแบบไม่มี `--seed`

```bash
cd ~/vscode/an22-api
mkdir -p .e2e && chmod 700 .e2e
secret() { openssl rand -base64 32 | tr -d '\n'; }
umask 077; cat > .e2e/env <<EOF
DB_NAME=an22
DB_SUPERUSER_PASSWORD=$(secret)
DB_ADMIN_PASSWORD=$(secret)
DB_OWNER_PASSWORD=$(secret)
DB_APP_PASSWORD=$(secret)
DB_PLATFORM_PASSWORD=$(secret)
PII_KEYS=1:$(secret)
PII_HASH_KEY=$(secret)
JWT_SECRET=1:$(secret)
SESSION_SECRET=$(secret)
JOBS_CRON="0 */5 * * * *"
EOF
umask 022
C="docker compose -p an22-multi -f compose.multi.yaml -f ../FrontEnd-An22/docs/test-data/v2/compose.v2.yaml --env-file .e2e/env"
$C --profile web down -v --remove-orphans
$C up -d --wait db pgbouncer
( set -a; source .e2e/env; set +a
  DB_MIGRATE_URL=jdbc:postgresql://db:5432/an22 DB_OWNER_USER=an22_owner DB_APPLY_NETWORK=an22-multi_default \
    scripts/db-apply.sh )
```

### 1.6 platform admin คนแรก (Q1 — Claude ใส่ให้ตอนรัน)

**ทำไมต้องใส่เอง**

- ผู้ดูแลแพลตฟอร์ม (คนที่ login หน้า `/platform`) เก็บในตาราง `dt_platform_admins`
- แถวเดียวที่เคยมีมาจาก seed ของ DEMO (`db/seed/V1_1__seed_demo.sql`, ชื่อ `platform` รหัส `platform`)
- รอบนี้ DB เริ่มจากศูนย์แบบ production (ไม่ apply seed) ตารางนี้จึงว่าง และไม่มีใคร login ฝั่งผู้ให้บริการได้
- api ไม่มี endpoint หรือ script สร้างคนแรก (V2-P-01) จึงต้องให้ DBA ใส่ 1 แถวเองครั้งเดียวตอนเปิดระบบ

**คำสั่ง** (รันหลัง 1.5 ก่อนเปิด api)

```bash
cd ~/vscode/an22-api
set -a; source .e2e/env; set +a      # ได้ DB_OWNER_PASSWORD ของรอบนี้
HASH=$(python3 -c "import bcrypt; print(bcrypt.hashpw(b'Platform#2569', bcrypt.gensalt(10, prefix=b'2a')).decode())")
$C exec -T -e PGPASSWORD="$DB_OWNER_PASSWORD" db \
  psql -v ON_ERROR_STOP=1 -v hash="$HASH" -h 127.0.0.1 -U an22_owner -d an22 <<'SQL'
INSERT INTO dt_platform_admins (username, name, password_hash)
VALUES ('platform', 'ผู้ดูแลแพลตฟอร์ม', :'hash');
SQL
```

**แต่ละบรรทัดทำอะไร**

1. `source .e2e/env` อ่านรหัสลับที่สร้างใน 1.5 เพื่อใช้รหัสของ role `an22_owner` (role เจ้าของ schema ตัวเดียวกับที่ `db-apply.sh` ใช้)
2. `HASH=…` แปลงรหัสผ่าน `Platform#2569` เป็น bcrypt hash
   - ใช้ cost 10 แบบ `$2a$` ซึ่งเป็นรูปแบบเดียวกับที่ api ใช้ตรวจตอน login (`BCryptPasswordEncoder(10)` ใน `SecurityConfig`)
   - ใช้ไลบรารี `bcrypt` ของ python ที่มีในเครื่องอยู่แล้ว ไม่ต้องดาวน์โหลดอะไร
   - ได้ข้อความยาว 60 ตัว ขึ้นต้น `$2a$10$` — ใน DB เก็บแค่ hash นี้ ไม่มีรหัสผ่านจริง
3. `psql … -U an22_owner` ต่อ DB แบบใช้รหัสผ่าน เหมือน DBA ต่อ Azure (บน Azure ไม่มี superuser ให้ใช้)
   - hash ส่งเข้าเป็นตัวแปร `:'hash'` เพื่อไม่ต้องห่วงเครื่องหมาย `$` ในคำสั่ง
4. `INSERT` ใส่แค่ 3 ช่อง:
   - `username` = `platform` (ต้องเป็น a-z 0-9 . \_ - ยาว 3–30 ตาม CHECK ของตาราง และไม่ซ้ำ)
   - `name` = `ผู้ดูแลแพลตฟอร์ม` (ชื่อที่ร้านเห็นใน audit "ผู้ให้บริการ: …")
   - `password_hash`
   - ช่องที่เหลือ DB เติมเอง: `id` (เลขรัน), `created_at` / `updated_at` = เวลาตอนนั้น, `created_by_kind` = `system`, `created_by` = ว่าง (trigger `set_row_stamp` — session ของ psql ไม่มีผู้ใช้ของแอป)

**ตรวจหลังใส่**

- `q "SELECT id, username, name, left(password_hash, 7), created_by_kind FROM dt_platform_admins"` → `1 | platform | ผู้ดูแลแพลตฟอร์ม | $2a$10$ | system`
- login ที่ `/platform/login` ด้วย `platform` / `Platform#2569` ได้ — ตรวจใน P1.3

**ถ้าทำตอนเปิดระบบจริง** (ไม่ใช่รอบทดสอบนี้)

- ใช้รหัสผ่านที่แข็งแรง และอ่านรหัสด้วย `read -s` แทนการพิมพ์ลงในคำสั่ง (ไม่ให้ค้างใน shell history)
- ต่อ Azure ด้วย `an22_owner` (หรือ `an22_platform` ที่เขียนตารางนี้ได้) ผ่าน TLS
- เปลี่ยนรหัสภายหลังต้อง UPDATE `password_hash` แบบเดียวกัน เพราะยังไม่มีหน้าจอเปลี่ยนรหัส (V2-P-02)

### 1.7 เปิด stack

```bash
$C up -d api1 api2 lb mongo && $C --profile web up -d web
for u in 18081 18082 18080; do until curl -fs http://127.0.0.1:$u/api/readyz >/dev/null; do sleep 1; done; done
curl -fs http://127.0.0.1:14000/healthz
```

### 1.8 เครื่องมือตรวจ

```bash
# DB อ่านอย่างเดียว (postgres ข้าม RLS เห็นทุกบริษัท) — ผลคั่นด้วย " | "
q()  { $C exec -T -e PGOPTIONS='-c default_transaction_read_only=on' db psql -qAtX -F ' | ' -U postgres -d an22 -c "$1"; }
# MongoDB (session ของ web)
mq() { $C exec -T mongo mongosh --quiet an22 --eval "$1"; }
# api ตรง (lb) — ใช้เฉพาะ case ที่มีป้าย API; token ได้จาก login ตรงที่ api (web ไม่ส่ง token ให้เบราว์เซอร์)
API=http://127.0.0.1:18080/api
tok()  { curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
           -d "{\"companyCode\":\"$1\",\"username\":\"$2\",\"password\":\"$3\"}" | jq -r .token; }
ptok() { curl -s -X POST $API/platform/auth/login -H 'Content-Type: application/json' \
           -d "{\"username\":\"$1\",\"password\":\"$2\"}" | jq -r .token; }
# log ของทุก container (ใช้ตรวจความลับ / error)
logs() { $C --profile web logs --no-color "$@"; }
```

ตัวย่อใน SQL (แทนด้วย subquery ตอนรัน):

- `{S}` `{M}` `{N}` `{D}` = `(SELECT id FROM dt_companies WHERE code='SOMJAI' / 'ITMART' / 'NOVAT' / 'DELME')`
- `{br:M:BN}` = `(SELECT id FROM dt_branches WHERE tenant_id={M} AND code='BN')`
- `{p:S:CASE-IP15}` = `(SELECT id FROM dt_products WHERE tenant_id={S} AND sku='CASE-IP15')`
- `{u:S:nok}` = `(SELECT id FROM dt_users WHERE tenant_id={S} AND username='nok')`

`<D1>` / `<D2>` ในเลขเอกสารหมายถึง `YYYYMMDD` ของวันทดสอบ ส่วน `<D1+14>` คือวันที่ห่างไป 14 วัน

### 1.9 สิ่งที่ผู้ใช้ตัดสินแล้ว (2026-10-27)

| #   | เรื่อง                         | ตัดสิน                                                                                                                                 |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | platform admin คนแรก           | INSERT 1 แถวตาม 1.6 — Claude ทำเองตอนรัน พร้อมคำอธิบายในหัวข้อ 1.6                                                                     |
| Q2  | case ⏱️ (ค่าบริการ / ลบบริษัท) | อนุญาต UPDATE วันที่ตามที่เขียนในแต่ละ case (แบบ E2E ข้อ 31 / 33 ของ an22-api) — ไม่เขียน DB นอกเหนือจากนี้                            |
| Q3  | ลิงก์ตั้งรหัสผ่านทางอีเมล      | ⏭️ — อีเมลไม่ส่งจริง, api ไม่ log ลิงก์, เก็บแค่ hash (เหมือน C3) ทดสอบเฉพาะคำตอบกลาง / token ที่สร้างใน DB / ลิงก์ปลอม (U1.13, U1.14) |
| Q4  | ชื่อรุ่น                       | รุ่น **2.0** — tag `2.0.0` ทั้ง 3 repo; `version` ใน `package.json` / `pom.xml` ไม่แก้ในรอบนี้                                         |
| Q5  | `JOBS_CRON`                    | ทุก 5 นาที (`0 */5 * * * *`) เพื่อเห็น job ของ 2 instance ในวันทดสอบ (production = 00:05 ทุกวัน)                                       |

### 1.10 ลำดับรันข้าม 2 วัน

| ลำดับ | วัน | ทำ                                                                                      |
| ----- | --- | --------------------------------------------------------------------------------------- |
| 1     | D1  | ไฟล์นี้ P0 → P1 → P2.1 (ยังไม่มีบริษัท)                                                 |
| 2     | D1  | ไฟล์ user U1 (สมัคร 4 บริษัท) → ไฟล์นี้ P2.2–P4                                         |
| 3     | D1  | ไฟล์ user U2–U10 (ตั้งร้าน, สินค้า, คลัง, โอน, ขายวันที่ 1) → ไฟล์นี้ P5–P6 (กับ DELME) |
| 4     | D1  | ไฟล์ user U15 ส่วนระบบที่ไม่ต้องรอวัน (cookie, XSRF, Mongo, restart, failover)          |
| 5     | D2  | ไฟล์ user U10 (ปิดกะค้างคืน) → U11–U14                                                  |
| 6     | D2  | ไฟล์นี้ P7 (ค่าบริการ NOVAT ⏱️) → P8 (ลบ DELME ⏱️) → P9 → P10                           |
| 7     | D2  | ไฟล์ user U16 (ความสอดคล้องทั้ง DB + log) แล้วสรุปผลทั้งสองไฟล์                         |

### 1.11 บัญชีทดสอบ (ค่าทดสอบบน stack local เท่านั้น)

| ใคร                   | login                                 | ใช้ใน              |
| --------------------- | ------------------------------------- | ------------------ |
| ผู้ดูแลแพลตฟอร์ม      | `platform` / `Platform#2569`          | ไฟล์นี้            |
| เจ้าของร้านทั้ง 4 ราย | ดูตารางบัญชีใน `docs/test-v2-user.md` | สร้างตอนสมัครใน U1 |

---

## 2. Test cases

### P0 — ตรวจ stack ก่อนเริ่ม (D1)

#### P0.1 tag + image ถูกรุ่น · DB

- **ทำ**: `git -C <repo> rev-parse 2.0.0^{commit}` เทียบ `origin/main` ทั้ง 3 repo; `docker image inspect an22-api:2.0.0 an22-web:2.0.0`; `$C ps`
- **จอ**: —
- **ผลที่คาด**:
  - tag `2.0.0` ชี้ HEAD ของ `main` ทั้ง 3 repo
  - label `an22.commit` ของ an22-api:2.0.0 = `2.0.0`
  - container `api1`, `api2` ใช้ image `an22-api:2.0.0` และ `web` ใช้ `an22-web:2.0.0`
  - `db`, `pgbouncer`, `lb`, `mongo` ขึ้นครบ และ `web` = healthy

#### P0.2 ไม่มี mock ใน build ที่ deploy · DB

- **ทำ**: `docker run --rm an22-web:2.0.0 sh -c "grep -rl 'mock-jwt\|seedDb\|mockToken' public || echo none"`
- **ผลที่คาด**: `none` (ไม่มี chunk mock — C3-1) และ `public/index.html` ตรงกับ `dist/` ที่ build ใน 1.3

#### P0.3 DB เริ่มจากศูนย์ · DB

- **DB**:
  - `q "SELECT string_agg(version, ',' ORDER BY installed_rank) FROM flyway_schema_history WHERE version IS NOT NULL"` → `1,2,3,4,5,6,7,8,9` (ไม่มี `1.1`, `3.1`, `4.1`, `5.1`, `8.1` ของ seed)
  - `q "SELECT (SELECT count(*) FROM dt_companies), (SELECT count(*) FROM dt_users), (SELECT count(*) FROM dt_products), (SELECT count(*) FROM dt_audit_log)"` → `0 | 0 | 0 | 0`
  - `q "SELECT username, name, created_by_kind FROM dt_platform_admins"` → `platform | ผู้ดูแลแพลตฟอร์ม | system` (หลัง 1.6 — 1 แถว)

#### P0.4 web เก็บ session ใน MongoDB · DB

- **ทำ**: `$C exec web printenv SESSION_STORE MONGODB_URI`; `mq "db.sessions.countDocuments()"`
- **ผลที่คาด**: `mongodb` + `mongodb://mongo:27017/an22`; sessions = 0 ก่อนมีคน login

#### P0.5 api 2 ตัวหลัง lb · DB

- **ทำ**: `for i in $(seq 6); do curl -s -o /dev/null $API/me; done` (ไม่มี token → 401) แล้วนับบรรทัด `"path":"/api/me"` ใน `logs api1` / `logs api2` (health ลง log ระดับ debug จึงใช้นับไม่ได้)
- **ผลที่คาด**: ทั้ง 6 ครั้งได้ 401 และ lb กระจายไปทั้ง api1 และ api2 (ไม่ใช่ตัวเดียวทั้งหมด)

### P1 — login ผู้ให้บริการ (D1)

#### P1.1 ยังไม่ login · จอ

- **ทำ**: เปิด `/platform`, `/platform/companies`
- **จอ**:
  - ไป `/platform/login` หัวข้อ "ผู้ให้บริการระบบ" และ "สำหรับผู้ดูแลแพลตฟอร์มเท่านั้น"
  - **ไม่มี** "(ทดลอง: platform / platform)" และช่องว่าง (C3-2)
- **DB**: `mq "db.sessions.countDocuments()"` → 0 หรือมีแต่ session ที่ไม่มีข้อมูล login

#### P1.2 รหัสผิด · จอ

- **ทำ**: `platform` + รหัสผิด / ชื่อที่ไม่มี `nobody` + รหัสใดก็ได้
- **จอ**: ข้อความเดียวกันทั้งสองแบบ "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" และยังอยู่หน้า login
- **DB**: `q "SELECT scope, failures FROM dt_login_throttle ORDER BY updated_at DESC LIMIT 3"` → มีแถว `account` และ `ip` นับ failures (key เป็น hash ไม่ใช่ชื่อจริง)

#### P1.3 login ถูก · จอ

- **ทำ**: `platform` / `Platform#2569`
- **จอ**: ไป `/platform/companies` "บริษัทลูกค้า" "ทั้งหมด 0 บริษัท" (ตารางว่าง)
- **DB**:
  - `mq "db.sessions.countDocuments()"` → 1
  - `mq "JSON.stringify(db.sessions.find().toArray()).includes('eyJ')"` → `false` (token ไม่อยู่ในรูปอ่านได้ — session เข้ารหัสด้วย `SESSION_SECRET`)
  - `mq "db.sessions.getIndexes().some(i => i.expireAfterSeconds !== undefined)"` → `true` (TTL ลบเอง)

#### P1.4 reload + restart web แล้วยัง login อยู่ · จอ

- **ทำ**: reload `/platform/companies`; `$C restart web` แล้ว reload อีกครั้ง
- **จอ**: ยังอยู่หน้าเดิม ไม่ถูกส่งไป login (ต่างจาก C3 ที่ใช้ memory store)
- **DB**: `mq "db.sessions.countDocuments()"` → ยัง 1

#### P1.5 session platform ไม่ใช้กับร้าน · จอ

- **ทำ**: ยังไม่ login ร้าน เปิด `/dashboard`
- **จอ**: ไป `/auth/login` (หน้า login ร้าน) — session ของ platform ไม่ทำให้เข้าเมนูร้านได้

#### P1.6 token ข้ามฝั่งไม่ได้ · API

- **ทำ**:
  - `PT=$(ptok platform 'Platform#2569')`; `curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $PT" $API/products`
  - หลัง U1 (มีบริษัท): `ST=$(tok SOMJAI somjai 'Somjai#2569')`; `curl … -H "Authorization: Bearer $ST" $API/platform/companies`
- **ผลที่คาด**: ทั้งสองครั้ง `401` (token ของอีกฝั่งใช้ไม่ได้)

#### P1.7 request platform ไม่ส่ง header ของร้าน · จอ

- **ทำ**: login ร้านใน U1 ก่อน (มี `an22.branch` ในเครื่อง) แล้วเปิด `/platform/companies` และดู network request `/api/platform/companies`
- **จอ**: request ไม่มี `X-Branch-Id` / `X-Terminal-Id` (`isPlatformRequest()`)

#### P1.8 ร้าน + platform พร้อมกันในเบราว์เซอร์เดียว · จอ

- **ทำ**: login ร้าน SOMJAI แล้ว login platform แล้วกด logout ที่ platform
- **จอ**: platform กลับหน้า login แต่เมนูร้านยังใช้ได้ (logout platform จบเฉพาะ slot ของ platform — E48)
- **DB**: `mq "db.sessions.countDocuments()"` → session เดิมยังอยู่ (ไม่ถูกลบทั้งก้อน)

#### P1.9 session หมดกลางทาง → บอกเหตุ · จอ

- **ทำ**: เปิด 2 แท็บที่ `/platform/companies` แล้วกด logout ในแท็บ A จากนั้นในแท็บ B กดเข้ารายละเอียดบริษัท (หรือ refresh รายการ)
- **จอ**: แท็บ B ไป `/platform/login?expired=1` และแสดง "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" (C3-6)

#### P1.10 จำกัดจำนวนครั้ง login platform · API

- **ทำ**: ผ่าน web (มี cookie + XSRF แบบเดียวกับหน้า login)
  1. `curl -c jar -b jar http://127.0.0.1:14000/platform/login` เพื่อรับ `XSRF-TOKEN`
  2. ยิง `POST http://127.0.0.1:14000/api/platform/auth/login` ด้วยชื่อ `nobody` รหัสผิด 21 ครั้ง (header `X-XSRF-TOKEN` จาก jar)
  3. แล้ว login `platform` ถูกต้อง 1 ครั้ง
- **ผลที่คาด**:
  - ครั้งที่ 1–5 ได้ `401`
  - ครั้งที่ 6–20 ได้ `429` "พยายามบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" จาก api (ล็อกบัญชี `nobody` — ไม่มี header `RateLimit`)
  - ครั้งที่ 21 ได้ `429` จาก web (มี header `RateLimit`)
  - หลังเพดาน web เต็ม login ที่ถูกก็ได้ `429` จนครบ 15 นาที (C3-7: นับเฉพาะครั้งที่ไม่ผ่าน)
- **DB**: `q "SELECT scope, failures, locked_until > now() FROM dt_login_throttle WHERE scope='account' ORDER BY updated_at DESC LIMIT 1"` → `account | 5 | t`
- **หมายเหตุ**: ทำเป็น case สุดท้ายของวัน D1 (ล็อก IP ของเครื่องทดสอบ 15 นาที)

### P2 — รายการบริษัท

#### P2.1 ยังไม่มีบริษัท · จอ · D1

- **จอ**: "ทั้งหมด 0 บริษัท" และตารางว่าง ไม่มี error

#### P2.2 หลังสมัคร 4 บริษัท (U1) · จอ · D1

- **จอ**: 4 แถว
  - SOMJAI: Starter · ทดลองใช้ · 1 / 1 / 0 · ค้างชำระ "-" · ใบถัดไป `<D1+15>`
  - ITMART: Standard · ทดลองใช้ · 1 / 1 / 0
  - NOVAT: Starter · ทดลองใช้ · 1 / 1 / 0
  - DELME: Starter · ทดลองใช้ · 1 / 1 / 0
- **DB**: `q "SELECT code, plan_id, active, trial_ends_on - current_date, next_invoice_on - current_date FROM dt_companies ORDER BY id"` → 4 แถว `… | t | 14 | 15` (plan ตามข้างบน)

#### P2.3 ค้นหา · จอ · D1

- **ทำ**: พิมพ์ `mart`, `ร้านมือถือ`, `zzz`
- **จอ**:
  - `mart` → ITMART
  - `ร้านมือถือ` → SOMJAI (ชื่อ)
  - `zzz` → ไม่พบ

#### P2.4 การใช้งานตามจริง · จอ · D1 (หลัง U4)

- **จอ**: SOMJAI 1 สาขา / 4 ผู้ใช้ (pim ปิดใช้งานใน U4.4) / 2 เครื่อง; ITMART 3 / 7 / 3 (ตามข้อมูลใน `docs/test-v2-user.md`)
- **DB**: `q "SELECT (SELECT count(*) FROM dt_branches WHERE tenant_id={M} AND active), (SELECT count(*) FROM dt_users WHERE tenant_id={M} AND active), (SELECT count(*) FROM dt_pos_terminals WHERE tenant_id={M} AND active)"` → `3 | 7 | 3`

### P3 — รายละเอียดบริษัท (D1)

#### P3.1 ข้อมูลครบ · จอ

- **ทำ**: กด ITMART
- **จอ**:
  - หัวข้อ "ITMART · บริษัท ไอทีมาร์ท จำกัด"
  - เลขผู้เสียภาษีตามที่สมัคร และเจ้าของ "วิชัย … (wichai) · อีเมล"
  - ทดลองใช้ถึง `<D1+14>` และใบแจ้งหนี้ถัดไป `<D1+15>` (วันที่ไทย พ.ศ.)
  - "ยังไม่มีใบแจ้งหนี้"
  - การ์ด: แพ็กเกจ / การใช้งานของบริษัท / รหัสผ่านเจ้าของบริษัท
- **DB**: `q "SELECT ci.name, ci.tax_id, u.username, u.email FROM dt_company_info ci JOIN dt_users u ON u.tenant_id = ci.tenant_id AND u.role='owner' WHERE ci.tenant_id={M}"` → ตรงกับจอ

#### P3.2 id ที่ไม่มี · จอ

- **ทำ**: เปิด `/platform/companies/99999`
- **จอ**: ข้อความไม่พบบริษัท (snackbar จาก 404) ไม่ค้างหมุน ไม่มี error ใน console (นอกจาก 404 ที่รับไว้แล้ว)

### P4 — เปลี่ยนแพ็กเกจ (D1)

#### P4.1 ITMART Standard → Pro · จอ

- **ทำ**: เลือก "Pro — ฿3,490 / เดือน" แล้วกด "บันทึกแพ็กเกจ" (ก่อนเลือก ปุ่มต้องปิดเพราะเป็นแพ็กเกจเดิม)
- **จอ**: บันทึกแล้ว แถวในรายการเป็น Pro; ฝั่งร้าน owner ITMART เห็น "Pro" ที่ `/account/subscription`
- **DB**:
  - `q "SELECT plan_id FROM dt_companies WHERE code='ITMART'"` → `pro`
  - `q "SELECT action, actor_kind, user_id IS NULL, user_name, ref_label, detail FROM dt_audit_log WHERE tenant_id={M} AND action='plan_change' ORDER BY id DESC LIMIT 1"` → `plan_change | platform | t | ผู้ดูแลแพลตฟอร์ม | ITMART | ผู้ให้บริการเปลี่ยนเป็นแพ็กเกจ Pro`

#### P4.2 ลดแพ็กเกจกลับ · จอ

- **ทำ**: DELME Starter → Standard → Starter
- **จอ**: บันทึกได้ทั้งสองครั้ง
- **DB**: `q "SELECT count(*) FROM dt_audit_log WHERE tenant_id={D} AND action='plan_change'"` → 2 และ plan_id = `starter`

### P5 — ระงับ / เปิดใช้งาน (D1, กับ DELME)

#### P5.1 ต้องมีเหตุผล · จอ + API

- **จอ**: ช่องเหตุผลว่าง → ปุ่ม "ระงับบริษัท" ปิด
- **API**: `curl -s -X POST -H "Authorization: Bearer $PT" -H 'Content-Type: application/json' -d '{"note":" "}' $API/platform/companies/<DELME id>/suspend` → `400` "กรุณากรอกเหตุผลที่ระงับ"

#### P5.2 ระงับ · จอ

- **ทำ**: เหตุผล "ทดสอบระงับ v2" แล้วกดระงับ
- **จอ**: หัวข้อแสดงสถานะ "ระงับ: ผู้ให้บริการระงับ", การ์ดเปลี่ยนเป็น "ระงับอยู่ (ระงับ: ผู้ให้บริการระงับ)" + ปุ่ม "เปิดใช้งานอีกครั้ง"; รายการแสดงสถานะเดียวกัน
- **DB**:
  - `q "SELECT active, suspended_reason, suspend_note FROM dt_companies WHERE code='DELME'"` → `f | platform | ทดสอบระงับ v2`
  - audit `company_suspend | platform | ทดสอบระงับ v2` (query แบบ P4.1)

#### P5.3 ร้านที่ถูกระงับ · จอ

- **ทำ**:
  1. ก่อนระงับให้ dang (owner DELME) login ค้างไว้ในอีกแท็บ แล้วหลังระงับให้กดเมนูใดก็ได้
  2. จากนั้น login ใหม่ด้วยรหัสผิด แล้วด้วยรหัสถูก
- **จอ**:
  - แท็บที่ค้างไว้ไป `/auth/login?expired=1` (401)
  - รหัสผิด → "รหัสบริษัท ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง"
  - รหัสถูก → "บริษัทนี้ถูกผู้ให้บริการระงับการใช้งาน — เจ้าของบริษัทติดต่อผู้ให้บริการ" (บอกหลังรหัสถูกเท่านั้น — E3)

#### P5.4 ระงับซ้ำ · API

- **ทำ**: POST suspend อีกครั้ง
- **ผลที่คาด**: `400` "บริษัทนี้ถูกระงับอยู่แล้ว"

#### P5.5 เปิดใช้งานอีกครั้ง · จอ

- **ทำ**: กด "เปิดใช้งานอีกครั้ง"
- **จอ**: สถานะกลับเป็นทดลองใช้ และ dang login ได้
- **DB**:
  - `q "SELECT active, suspended_reason IS NULL FROM dt_companies WHERE code='DELME'"` → `t | t`
  - audit `company_reactivate | platform | ` (detail ว่าง)

### P6 — ตั้งรหัสผ่านเจ้าของบริษัท (D1, กับ DELME)

#### P6.1 รหัสสั้น · จอ

- **ทำ**: รหัส `123` แล้วกด "ตั้งรหัสผ่านใหม่"
- **จอ**: hint สีแดง "รหัสผ่านต้องมีอย่างน้อย 4 ตัว" ไม่บันทึก

#### P6.2 ตั้งรหัสใหม่ · จอ

- **ทำ**: เก็บ hash เดิมก่อน `q "SELECT md5(password_hash) FROM dt_users WHERE tenant_id={D} AND role='owner'"` แล้วตั้งรหัส `Delme#2570`
- **จอ**: บันทึกแล้ว ช่องว่างลง; ฝั่งร้าน รหัสเดิม `Delme#2569` login ไม่ได้ (ข้อความเดียว) และ `Delme#2570` login ได้
- **DB**:
  - md5 ของ hash ไม่เท่าค่าเดิม
  - audit `user_password | platform | t | ผู้ดูแลแพลตฟอร์ม | dang | ผู้ให้บริการตั้งรหัสผ่านใหม่ให้เจ้าของบริษัท`

### P7 — ค่าบริการ (D2, กับ NOVAT · Starter ฿590) ⏱️

ทุกข้อเลื่อนวันใน DB ก่อน (อนุมัติแล้ว — Q2) แล้วรอ job ≤ 5 นาที หรือให้ nid login ใหม่ (`catchUp`)

#### P7.1 ใกล้หมดช่วงทดลอง · จอ ⏱️

- **เลื่อน**: `UPDATE dt_companies SET trial_ends_on = current_date + 2, next_invoice_on = current_date + 3 WHERE code='NOVAT'`
- **จอ**:
  - nid (owner) เห็นแถบบน "ทดลองใช้เหลืออีก 2 วัน (ถึง d/m/พ.ศ.) — ใบแจ้งหนี้แรกออกวันที่ d/m/พ.ศ."
  - nun (user ของ NOVAT) **ไม่เห็น** แถบ
- **DB**: `q "SELECT count(*) FROM dt_billing_invoices WHERE company_id={N}"` → 0

#### P7.2 หมดช่วงทดลอง → ออกใบแรก · จอ ⏱️

- **เลื่อน**: `UPDATE dt_companies SET trial_ends_on = current_date - 1, next_invoice_on = current_date WHERE code='NOVAT'`
- **จอ**:
  - nid login แล้วเห็นแถบ "ใบแจ้งหนี้ SUB-<YYYYMM>-0001 ฿590 ครบกำหนดชำระ <วันนี้+7>"
  - platform: รายการ NOVAT ค้างชำระ ฿590 สถานะ "ใช้งานปกติ"
  - รายละเอียดมีใบ 1 ใบ (รอบ วันนี้ – ก่อนวันเดียวกันเดือนหน้า · Starter · ยอด ฿590 · ครบกำหนด · ปุ่ม "รับชำระ")
- **DB**:
  - `q "SELECT invoice_no, plan_id, amount, period_start = current_date, due_date - current_date, status, created_by_kind FROM dt_billing_invoices WHERE company_id={N}"` → `SUB-<YYYYMM>-0001 | starter | 590.00 | t | 7 | open | system`
  - `q "SELECT next_invoice_on = (current_date + interval '1 month')::date FROM dt_companies WHERE code='NOVAT'"` → `t`

#### P7.3 job ของ 2 instance ออกใบครั้งเดียว · DB

- **ทำ**: รอให้ job รันอีก 2 รอบ (≥ 10 นาที) และ login nid ซ้ำ 2 ครั้ง
- **DB**: จำนวนใบของ NOVAT ยัง 1; `q "SELECT last_no FROM dt_platform_doc_counters WHERE prefix LIKE 'SUB-%'"` → 1 (ไม่ข้าม ไม่ซ้ำ); log api1 / api2 ไม่มี ERROR จาก job

#### P7.4 เลยกำหนดชำระ · จอ ⏱️

- **เลื่อน**: `UPDATE dt_billing_invoices SET due_date = current_date - 2 WHERE company_id={N}`
- **จอ**:
  - nid เห็นแถบสีแดง "ค้างชำระ SUB-…-0001 ฿590 (ครบกำหนด …) — จะระงับการใช้งานหลังวันที่ … (อีก 5 วัน)"
  - platform สถานะ "ค้างชำระ"
  - ร้านยังใช้งานได้

#### P7.5 เลยช่วงผ่อนผัน → ระงับ · จอ ⏱️

- **เลื่อน**: `UPDATE dt_billing_invoices SET due_date = current_date - 8 WHERE company_id={N}`
- **จอ**:
  - หลัง job / login: nid รหัสถูก → "บริษัทนี้ถูกระงับการใช้งานเพราะค้างชำระค่าบริการ — เจ้าของบริษัทติดต่อผู้ให้บริการเพื่อชำระเงิน"
  - platform สถานะ "ระงับ: ค้างชำระ"
  - ปุ่ม "เปิดใช้งานอีกครั้ง" ปิดพร้อมข้อความ "บริษัทค้างชำระ — บันทึกรับชำระใบแจ้งหนี้แทน"
- **DB**: `q "SELECT active, suspended_reason FROM dt_companies WHERE code='NOVAT'"` → `f | overdue`

#### P7.6 รับชำระ → เปิดเอง · จอ + API

- **ทำ**: กด "รับชำระ" ที่ใบ แล้วยืนยัน; จากนั้นยิงซ้ำ `POST $API/platform/invoices/<id>/pay`
- **จอ**: ใบเป็น "ชำระแล้ว" และวันชำระ; บริษัทกลับ "ใช้งานปกติ" เอง; nid login ได้ ไม่มีแถบค้างชำระ
- **API**: ครั้งที่สอง `400` "ใบแจ้งหนี้นี้ชำระแล้ว"
- **DB**:
  - `q "SELECT status, paid_at IS NOT NULL FROM dt_billing_invoices WHERE company_id={N}"` → `paid | t`
  - บริษัท `active = t`, `suspended_reason` = null
  - audit `invoice_paid | platform | … | SUB-<YYYYMM>-0001 | ฿590`

#### P7.7 ออกใบย้อนหลังหลายรอบ · DB ⏱️

- **เลื่อน**: `UPDATE dt_companies SET next_invoice_on = (current_date - interval '2 months')::date WHERE code='NOVAT'`
- **ทำ**: nid login
- **ผลที่คาด**:
  - มีใบใหม่ 3 ใบ รอบต่อเนื่องกัน (−2 เดือน, −1 เดือน, เดือนนี้)
  - เลข SUB เรียงต่อจาก 0001
  - ยอดใบละ ฿590
  - `next_invoice_on` = วันนี้ + 1 เดือน
- **DB**: `q "SELECT string_agg(period_start::text, ',' ORDER BY period_start) FROM dt_billing_invoices WHERE company_id={N} AND status='open'"` → 3 วันที่ห่างกัน 1 เดือน

### P8 — ลบข้อมูลบริษัท (D2, กับ DELME) ⏱️

ต้องทำ U14.8 (dang ขอลบข้อมูล) ก่อน

#### P8.1 เห็นคำขอลบ · จอ

- **จอ**:
  - รายการ: DELME สถานะ "ระงับ: รอลบข้อมูล"
  - รายละเอียด: การ์ด "คำขอลบข้อมูล" แสดง "ขอเมื่อ … โดย <ชื่อ dang> — <เหตุผล>" และ "ลบได้ตั้งแต่วันที่ <D2+30>"
  - ปุ่ม "ลบข้อมูลถาวร" ปิดพร้อม tooltip "ลบข้อมูลได้ตั้งแต่วันที่ d/m/พ.ศ."
- **DB**: `q "SELECT active, suspended_reason, purge_after - current_date FROM dt_companies WHERE code='DELME'"` → `f | deletion | 30`

#### P8.2 เปิดใช้งานแทนไม่ได้ · จอ

- **จอ**: ปุ่ม "เปิดใช้งานอีกครั้ง" ปิด และข้อความ "บริษัทอยู่ระหว่างรอลบข้อมูล — ให้เจ้าของบริษัทยกเลิกคำขอลบ"

#### P8.3 ลบถาวร · จอ ⏱️

- **เลื่อน**: `UPDATE dt_companies SET purge_after = current_date WHERE code='DELME'`
- **ทำ**: reload แล้วกด "ลบข้อมูลถาวร" และยืนยัน
- **จอ**: การ์ดแสดง "ลบข้อมูลแล้วเมื่อ …"; การใช้งาน 0 / 0 / 0, เจ้าของ "-"; ไม่มีการ์ดแพ็กเกจ / ระงับ / รหัสผ่าน; รายการแสดงสถานะ "ลบข้อมูลแล้ว" และใบถัดไป "-"
- **DB**:
  - ทุกตารางที่มี `tenant_id` ของ DELME = 0 แถว:
    `q "SELECT sum((xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I WHERE tenant_id = %s', table_name, {D}), false, true, '')))[1]::text::int) FROM information_schema.columns WHERE table_schema='public' AND column_name='tenant_id'"` → `0`
  - `q "SELECT deleted_at IS NOT NULL, deleted_name, active, suspended_reason, code FROM dt_companies WHERE code='DELME'"` → `t | <ชื่อบริษัท DELME> | f | deletion | DELME`
  - `q "SELECT count(*) FROM dt_password_reset_tokens WHERE company_id={D}"` → 0; ใบแจ้งหนี้ของ DELME (ถ้ามี) ยังอยู่
  - ข้อมูลบริษัทอื่น (SOMJAI / ITMART / NOVAT) จำนวนแถวเท่าก่อน purge (นับด้วย query เดียวกันก่อน / หลัง)

#### P8.4 หลังลบ · จอ

- **จอ**:
  - dang login → "รหัสบริษัท ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง" (เหมือนบริษัทที่ไม่มี)
  - สมัครใหม่ด้วยรหัส `DELME` → "รหัสบริษัทนี้ถูกใช้แล้ว" (E39 — ไม่ใช้รหัสซ้ำตลอดไป)

#### P8.5 สั่งงานกับบริษัทที่ลบแล้ว · API

- **ทำ**: `PUT …/plan`, `POST …/suspend`, `PUT …/owner-password` กับ DELME
- **ผลที่คาด**: `400` "บริษัทนี้ถูกลบข้อมูลแล้ว" ทุกตัว

### P9 — เมนูอีเมลที่ส่ง (mock เท่านั้น) · จอ · D2

- **ทำ**: เปิด `/platform/outbox`
- **จอ**: ได้ข้อความ error จาก 404 ตามที่ตกลงไว้ตอน C3 (api จริงไม่มี outbox) หน้าไม่ค้าง — บันทึกเป็นข้อสังเกตเดิม ไม่ใช่บั๊กใหม่

### P10 — การกระทำของผู้ให้บริการในประวัติของร้าน · จอ · D2

- **ทำ**: owner ITMART เปิด `/account/audit-log` ช่วง 7 วัน กรองเหตุการณ์ "เปลี่ยนแพ็กเกจ"; owner NOVAT กรอง "รับชำระค่าบริการ" / "ระงับบริษัท"
- **จอ**:
  - ผู้ทำแสดง "ผู้ให้บริการ: ผู้ดูแลแพลตฟอร์ม"
  - รายละเอียดตรงกับ P4.1 / P7.6 (เงินมีตัวคั่นหลักพัน — C3-5)
  - เห็นเฉพาะเหตุการณ์ของบริษัทตัวเอง
- **DB**: `q "SELECT tenant_id, count(*) FROM dt_audit_log WHERE actor_kind='platform' GROUP BY 1 ORDER BY 1"` → ตรงกับจำนวนการกระทำใน P4–P8 ต่อบริษัท (ของ DELME = 0 เพราะ purge แล้ว)

---

## 3. สิ่งที่เจอ

ข้อที่รู้ก่อนรัน (เจอตอนเขียนแผน — ยืนยันตอนรัน):

| #       | เรื่อง                                 | รายละเอียด                                                                                                                                           | สถานะ    |
| ------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| V2-P-01 | ไม่มีวิธีสร้าง platform admin คนแรก    | `dt_platform_admins` มีแถวเดียวจาก `db/seed/V1_1__seed_demo.sql`; production ไม่ apply seed และไม่มี endpoint / script สร้าง — ต้อง INSERT เอง (1.6) | รอยืนยัน |
| V2-P-02 | platform admin เปลี่ยนรหัสตัวเองไม่ได้ | api มีแค่ `/platform/auth/login`, `/platform/me`, `/platform/companies…`, `/platform/invoices/:id/pay` — ไม่มีเปลี่ยนรหัส / เพิ่ม admin              | รอยืนยัน |
| V2-P-03 | ไม่มีจุดดูรุ่นที่รันอยู่               | `/healthz` ของ web / api ตอบแค่ `status` — ดูรุ่นได้จาก label ของ image เท่านั้น                                                                     | รอยืนยัน |
| V2-P-04 | อีเมลตั้งรหัสผ่านไม่ส่งจริง (เดิม)     | `LoggingMailer` log ว่า "ยังไม่ส่งจริง" ไม่มีลิงก์ — owner ตั้งรหัสเองไม่ได้จนกว่าจะมีผู้ให้บริการอีเมล (ตกลงไว้ตอน C3; ทางออกตอนนี้คือ P6)          | เดิม     |
| V2-P-05 | เมนู "อีเมลที่ส่ง (mock)" → 404 (เดิม) | ตกลงไว้ตอน C3 — ดู P9                                                                                                                                | เดิม     |

ที่เจอระหว่างรัน:

| #       | case | เรื่อง                                  | สาเหตุ / ข้อเสนอ                                                                                                                               | สถานะ     |
| ------- | ---- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| V2-P-06 | 1.2  | tag `2.0.0` มีอยู่แล้ว ข้อความไม่ตรงแผน | สร้างและ push ไว้ก่อนรัน (16:12–16:22) ข้อความ "deploy" (FrontEnd, api) / "test" (web) — ชี้ commit ถูกต้อง ไม่ย้าย tag; ข้อความเป็นเรื่องเล็ก | ข้อสังเกต |
| V2-P-07 | 1.3  | an22-web ไม่มี `.nvmrc`                 | คำสั่งในแผน `nvm use` ล้มที่ an22-web (มีแค่ `engines.node >=24`) — เพิ่ม `.nvmrc` = 24 ให้เหมือนอีก 2 repo หรือแก้แผน                         | เปิด      |

## 4. สรุปผล

| หัวข้อ                | ✅  | ❌  | ⚠️  | ⏭️  |
| --------------------- | --- | --- | --- | --- |
| P0 stack              | 5   |     |     |     |
| P1 login ผู้ให้บริการ |     |     |     |     |
| P2 รายการบริษัท       | 1   |     |     |     |
| P3 รายละเอียด         |     |     |     |     |
| P4 แพ็กเกจ            |     |     |     |     |
| P5 ระงับ / เปิดใช้งาน |     |     |     |     |
| P6 รหัสผ่านเจ้าของ    |     |     |     |     |
| P7 ค่าบริการ ⏱️       |     |     |     |     |
| P8 ลบข้อมูลบริษัท ⏱️  |     |     |     |     |
| P9 – P10              |     |     |     |     |
| **รวม**               |     |     |     |     |
