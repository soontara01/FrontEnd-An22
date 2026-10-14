# งานที่ต้องทำก่อนเริ่ม SaaS (`docs/saas-plan.md`)

ที่มา: ผลทดสอบ R1–R7 ใน `docs/test-before-saas.md` (ตาราง "บั๊ก / ข้อสังเกตที่พบ" B1–B24) · สรุปเมื่อ 2026-10-14

วิธีใช้: copy กล่อง prompt ของแต่ละข้อไปสั่งทีละข้อ ตามลำดับ
ทุก prompt สั่งให้ทำตาม `CLAUDE.md`, รัน build + test + lint และอัปเดตสถานะบั๊กใน `docs/test-before-saas.md` แล้ว

| ลำดับ | ข้อ                                               | บั๊ก                         | ระดับ                |
| ----- | ------------------------------------------------- | ---------------------------- | -------------------- |
| 0     | ตารางสิทธิ์ admin / staff (ตัดสินใจก่อน)          | B2 + R7                      | ต้องทำก่อนเริ่ม      |
| 1     | ตรวจสิทธิ์ที่ server (mock) ตามตารางข้อ 0         | B2 + R7                      | ต้องทำก่อนเริ่ม      |
| 2     | token ไม่รู้จัก → 401 + spec ของ errorInterceptor | B3                           | ต้องทำก่อนเริ่ม      |
| 3     | ข้อความเงินออกไม่บอกยอดคาด (blind count)          | B19                          | ต้องทำก่อนเริ่ม      |
| 4     | ปิดกะเมื่อยอดคาดติดลบจากการคืนเงิน                | B23                          | ต้องทำก่อนเริ่ม      |
| 5     | ร้านไม่จด VAT ต้องไม่คิด VAT                      | B20                          | ต้องทำก่อนเริ่ม      |
| 6     | บรรทัดบิลไม่มี `freeOfPromotionId`                | B24                          | พร้อม SaaS ขั้นที่ 1 |
| 7     | error 400 ไม่ลง console                           | B13                          | พร้อม SaaS ขั้นที่ 1 |
| 8     | พิมพ์วันที่ใน datepicker ได้ปีผิด                 | B8                           | ควรแก้เร็ว           |
| 9     | บัตรสต็อก: ยอดยกมานับเป็นรับเข้า + ประวัติ serial | B17, B18                     | ก่อน SaaS ขั้นที่ 3  |
| 10    | ฟอร์มไม่หาย / ข้อความ error ตรงเหตุ               | B22, B1, B14, B21            | ควรแก้เร็ว           |
| —     | ข้อสังเกต UX ที่เก็บไว้ทีหลัง                     | B4, B6, B7, B9–B12, B15, B16 | ไม่ต้องทำก่อน SaaS   |

ไม่ต้องแก้แยก: **B5** (e-mail ซ้ำ) — D4 เปลี่ยนเป็น `username` ไม่ซ้ำภายในบริษัท ให้ใส่กฎห้ามซ้ำตอนทำ SaaS ขั้นที่ 1

---

## 0. ตารางสิทธิ์ admin / staff (ตัดสินใจก่อน ยังไม่แก้โค้ด)

ทำไม: SaaS เพิ่ม owner / admin / user + สิทธิ์รายสาขา (`saas-plan.md` หัวข้อ 6) ต่อจากกฎ "admin only" เดิม
แต่ตอนนี้กฎเดิมยังไม่ครบ — staff แก้ผู้ใช้ (ตั้ง role admin ได้), ข้อมูลหลัก, SKU, ราคา, โปรได้ทั้งหมด

```text
อ่าน docs/test-before-saas.md ส่วน "จุดที่ต้องจดไว้สำหรับ SaaS" → สิทธิ์ (ผล R1 และ R7) กับ B2
และ docs/saas-plan.md หัวข้อ 6 แล้วร่าง "ตารางสิทธิ์ admin / user ก่อน SaaS" ให้ฉันตัดสินใจ:
- แถว = ทุกการกระทำในแอป (ผู้ใช้ CRUD, หมวดหมู่, ผู้จำหน่าย, ช่องทางชำระ, เครื่อง POS, SKU, ราคา, โปรโมชั่น,
  รับเข้า/ตัดออก/นำเข้า Excel, ขาย, void, ใบลดหนี้, เปลี่ยนสินค้า, ใบกำกับภายหลัง, ออกใบกำกับใหม่,
  ส่วนลดพิเศษ, เงินเข้าออก/เปิดลิ้นชัก, ปิดกะ/ปิดกะแทน/อนุมัติ/ปรับปรุงกะ, ตั้งค่าร้าน, เครื่องนี้)
- คอลัมน์ = admin / user, "ตอนนี้หน้าจอ" / "ตอนนี้ mock" (อ่านจากโค้ดจริง) / "เสนอ"
- ใส่ค่าที่เสนอพร้อมเหตุผลสั้นๆ (ร้านไอที / เครื่องใช้ไฟฟ้า แคชเชียร์กับคนคุมคลังเป็น user)
บันทึกเป็นหัวข้อใหม่ "ตารางสิทธิ์ (ก่อน SaaS)" ใน docs/saas-plan.md สถานะ "รอยืนยัน" แล้วถามฉันทีละข้อที่ต้องตัดสินใจ
ยังไม่ต้องแก้โค้ด
```

## 1. ตรวจสิทธิ์ที่ server (mock) ตามตารางข้อ 0

ทำไม: R7 พบว่า mock เช็ก admin เฉพาะเครื่อง POS และบางคำสั่งของกะ — ใบลดหนี้, ออกใบกำกับใหม่,
`PUT /settings/store`, CRUD ผู้ใช้และข้อมูลหลักกันไว้แค่ที่หน้าจอ (B2) ถ้า API จริงทำตาม mock จะเป็นช่องโหว่

```text
ทำตาราง "ตารางสิทธิ์ (ก่อน SaaS)" ที่ยืนยันแล้วใน docs/saas-plan.md ให้ครบทั้ง mock และหน้าจอ:
- mock (core/interceptors/mock-backend.interceptor.ts): ทุก endpoint ที่ตารางบอก admin only ให้ตอบ 403
  ด้วยข้อความไทย ใช้ actorIsAdmin() แบบเดียวกับ handlePosTerminals (อย่างน้อย POST /sales/:id/credit-notes,
  POST /sales/:id/tax-invoice/reissue, PUT /settings/store, และ users / master data ตามตาราง)
  — กันไม่ให้ user ตั้งตัวเองหรือคนอื่นเป็น admin และไม่ให้ลบ / ลด role admin คนสุดท้าย
- หน้าจอ: ซ่อนหรือ disable ปุ่มตามตาราง (ดูแบบที่ pos-terminal-list.ts ทำ: isAdmin computed + ข้อความ
  "เฉพาะผู้ดูแลระบบ…"), หน้าที่เปิดตรงด้วย URL ต้องไม่ให้บันทึกได้
- เพิ่ม spec ใน mock-backend.interceptor.spec.ts: user ได้ 403, admin ผ่าน ทุก endpoint ที่เปลี่ยน
- อัปเดต CLAUDE.md (กฎสิทธิ์ + "Switching to a real backend" ว่า endpoint ไหนตอบ 403)
- อัปเดต docs/test-before-saas.md: B2 สถานะ "แก้แล้ว" + วันที่ และหมายเหตุในส่วนสิทธิ์ของ R7
build + test + lint ให้ผ่าน ยังไม่ต้อง commit
```

## 2. token ไม่รู้จัก → 401 + spec ของ errorInterceptor (B3)

ทำไม: SaaS ขั้นที่ 1 จะอ่านบริษัทจาก token ถ้า mock ยังถอยไปใช้ `users[0]` (admin) เมื่อ token ผิด
จะกลายเป็นช่องโหว่ข้ามบริษัท และทางออกเมื่อ token หมดอายุ (logout) ยังไม่เคยถูกทดสอบ

```text
แก้ B3 ใน docs/test-before-saas.md:
- mock-backend.interceptor.ts requestUser(): token ที่ไม่มี / ไม่รู้จัก / ผู้ใช้ถูกปิดใช้งาน ต้องไม่ fallback
  เป็น users[0] — ทุก endpoint ยกเว้น POST /auth/login ตอบ 401 (POST /auth/verify ยังตอบ 400 ตาม CLAUDE.md)
- ตรวจว่า errorInterceptor logout เมื่อได้ 401 และไม่ logout เมื่อ /auth/verify ตอบ 400 (หน้าปลดล็อก POS)
- เพิ่ม core/interceptors/error.interceptor.spec.ts (snackbar เมื่อ 4xx/5xx, logout เมื่อ 401 —
  stub DOCUMENT ตาม Gotchas ใน CLAUDE.md) และ spec ใน mock ว่า token ผิดได้ 401
- ทดสอบบนหน้าจอ: แก้ an22.token ใน localStorage เป็นค่ามั่ว แล้ว reload หน้าใดก็ได้ → ต้องกลับหน้า login
- อัปเดต B3 เป็น "แก้แล้ว" + วันที่, และ CLAUDE.md ถ้ากฎ mock เปลี่ยน
build + test + lint ให้ผ่าน ยังไม่ต้อง commit
```

## 3. ข้อความเงินออกไม่บอกยอดคาด (B19)

ทำไม: staff ลองนำเงินออกยอดสูงแล้วรู้ยอดเงินสดที่ระบบคาด ทำให้การนับปิดกะแบบ blind ไม่มีความหมาย

```text
แก้ B19 ใน docs/test-before-saas.md:
- core/models/shift.model.ts cashMovementError(): ข้อความ "เงินสดในลิ้นชักไม่พอ (คาดว่ามี … บาท)" ต้องไม่บอกยอด
  กับ user — เพิ่ม option isAdmin (admin เห็นยอดได้, user เห็นแค่ "เงินสดในลิ้นชักไม่พอ") หรือไม่บอกยอดกับทุกคน
  เลือกแบบที่สอดคล้องกับกฎ "non-admins never get lines while the shift is open" ใน CLAUDE.md แล้วบอกฉันว่าเลือกอะไร
- ส่ง isAdmin เข้าไปทั้งใน POS (dialog นำเงินเข้า / ออก) และ mock
- dialog นำเงินเข้า / ออก (features/pos): เมื่อ server ปฏิเสธ ห้ามปิด dialog — แสดง error ใน dialog และเก็บค่าที่กรอกไว้
- spec: shift.model.spec.ts (ข้อความ user ไม่มีตัวเลข) + mock spec
- อัปเดต B19 เป็น "แก้แล้ว" + วันที่ และ CLAUDE.md ถ้ากฎเปลี่ยน
build + test + lint ให้ผ่าน ยังไม่ต้อง commit
```

## 4. ปิดกะเมื่อยอดคาดติดลบจากการคืนเงิน (B23)

ทำไม: กะที่คืนเงินผ่านบัตร / QR (ใบลดหนี้, void บิลที่ขายในกะอื่น) ยอดคาดของช่องทางนั้นติดลบ
แต่ช่องนับไม่รับค่าลบ → นับ 0 แล้วเกิดส่วนต่างหลอก ต้องใส่สาเหตุและขออนุมัติทุกครั้ง

```text
แก้ B23 ใน docs/test-before-saas.md (ตัวอย่างจริง: SH-20261014-06 ใน mock db — บัตร ควรมี −24,160 นับได้ 0):
ก่อนแก้ เสนอทางเลือกให้ฉันเลือก 1 แบบ พร้อมผลกระทบต่อ X / Z report, varianceReport และนักบัญชี เช่น
  (ก) ยอมให้นับค่าลบ สำหรับช่องทางที่ยอดคาดติดลบ
  (ข) แยก "รับเข้า" กับ "คืนเงิน" ต่อช่องทาง: นับ / ยืนยันเฉพาะยอดรับเข้า ส่วนคืนเงินแสดงเป็นรายการตรวจ (confirm)
  (ค) ช่องทางที่ไม่ใช่เงินสดและไม่มีรับเข้าในกะ ไม่ต้องนับ แสดงยอดคืนให้ตรวจอย่างเดียว
หลังฉันเลือก: แก้ expectedByMethod / countInputsError / countCheck / closeShiftError ใน core/models/shift.model.ts
(กฎเดียวทั้งหน้าจอ /pos/shift-close และ mock), X / Z report (ShiftSlip) และ spec ทั้ง model + mock
ห้ามแก้กะที่ปิดแล้วใน mock db; อัปเดต docs/shift-plan.md (ข้อตัดสินใจใหม่), CLAUDE.md ส่วน POS shifts,
และ B23 เป็น "แก้แล้ว" + วันที่
build + test + lint ให้ผ่าน ยังไม่ต้อง commit
```

## 5. ร้านไม่จด VAT ต้องไม่คิด VAT (B20)

ทำไม: ตอนปิด VAT ตะกร้ายังแสดง "VAT ที่รวมอยู่", บิลเก็บ `vat` และถูกนับในรายงานภาษีขาย
SaaS ขั้นที่ 2 จะแยก `StoreInfo` เป็น `CompanyInfo` + `BranchInfo` จึงควรให้กฎ VAT ถูกก่อนย้าย

```text
แก้ B20 ใน docs/test-before-saas.md:
- กำหนดกฎ: ร้าน vatRegistered = false → ทุกบิลที่ขายตอนนั้น vat = 0 ทั้งบิลและทุกบรรทัด (ราคายังเป็นราคาขาย
  ไม่แยก VAT) — ทำใน priceCart() (core/models/pos-pricing.model.ts) โดยรับสถานะ VAT ของร้าน
  ใช้ทั้ง POS และ mock POST /sales (server re-price) ห้ามคำนวณซ้ำที่อื่น
- POS: ซ่อนบรรทัด "VAT ที่รวมอยู่" เมื่อไม่จด VAT (features/pos/pages/pos-page/pos-page.html ประมาณบรรทัด 374)
- รายงานภาษีขาย (features/sales/data/sales-tax-report.ts): ไม่นับบิลที่ vat = 0 เพราะร้านไม่จด VAT ตอนขาย
  (ตัดสินใจกับฉันว่าจะแสดงเป็นบรรทัดอ้างอิงหรือไม่แสดงเลย)
- ใบลดหนี้ / เปลี่ยนสินค้าของบิลแบบนี้ต้องไม่สร้าง VAT ติดลบ
- บิลเก่าใน mock db (POS1-20261014-0007) ไม่ต้อง migrate ถ้าไม่จำเป็น — บอกฉันว่ากระทบอะไร
- spec: pos-pricing.model.spec.ts, sales-tax-report spec, mock spec
- อัปเดต B20 เป็น "แก้แล้ว" + วันที่ และ CLAUDE.md ส่วน Receipts / Sales tax report ถ้ากฎเปลี่ยน
build + test + lint ให้ผ่าน ยังไม่ต้อง commit
```

## 6. บรรทัดบิลไม่มี `freeOfPromotionId` (B24) — พร้อม SaaS ขั้นที่ 1

ทำไม: ทุกที่เช็ก `freeOfPromotionId !== null` ถ้า backend จริงตัด null ออกจาก JSON ทุกบรรทัดจะเป็นของแถม
และใบลดหนี้คำนวณผิด (`credit-note.model.ts` บรรทัด ~208)

```text
แก้ B24 ใน docs/test-before-saas.md:
- เพิ่ม normalize ตอนอ่าน Sale (เช่น normalizeSale() ใน core/models/sale.model.ts) เติม default ให้ field ที่เพิ่มภายหลัง
  ของ Sale และ SaleLine (freeOfPromotionId: null, promotionIds: [], manualDiscount: 0, listPrice = unitPrice,
  returnStatus, exchangeNos ฯลฯ — ไล่จาก interface จริง) แล้วเรียกที่ API service ของ sales / pos
  และใน mock ตอนอ่าน (แบบ PRODUCT_DEFAULTS)
- และ/หรือเปลี่ยนการเช็ก `!== null` เป็น `!= null` ทุกที่ (grep freeOfPromotionId) — เลือกแบบที่ปลอดภัยกว่าแล้วบอกเหตุผล
- ไล่ field ใหม่ของโมเดลอื่นที่มีปัญหาแบบเดียวกัน (CreditNote, Exchange, Shift, TaxInvoice) แล้วรายงานให้ฉัน
- spec: บิลที่ไม่มี freeOfPromotionId ไม่เป็นของแถม ทั้งหน้าบิล และ draftCreditNote()
- ทดสอบซ้ำ 13.3 ใน docs/test-before-saas.md (สำรอง an22.mock.db ก่อน ลบ field แล้ว reload หน้าบิล / ใบลดหนี้ แล้วคืนค่า)
- อัปเดต B24 เป็น "แก้แล้ว" + วันที่ และ CLAUDE.md ส่วน mock defaults
build + test + lint ให้ผ่าน ยังไม่ต้อง commit
```

## 7. error 400 ไม่ลง console (B13) — พร้อม SaaS ขั้นที่ 1

ทำไม: ใช้เกณฑ์ "console สะอาด" (13.5) ทดสอบหลังทำ SaaS ไม่ได้ถ้า 400 ที่จัดการแล้วยังขึ้น `ERROR HttpErrorResponse`

```text
แก้ B13 ใน docs/test-before-saas.md:
ลบ SKU / หมวดหมู่ / SKU บริการที่ถูกปฏิเสธ 400 แล้วมี "ERROR HttpErrorResponse" ใน console ทั้งที่ errorInterceptor
แสดง snackbar แล้ว — หาสาเหตุ (subscribe ที่ไม่มี error callback / rethrow ใน store) แล้วแก้ทุกที่แบบเดียวกัน
ตามกฎ CLAUDE.md ("don't duplicate error toasts; just reset local UI state in error: callbacks")
grep หา subscribe / firstValueFrom ที่ยิงคำสั่งเปลี่ยนข้อมูลแต่ไม่มี error handler ทุก feature แล้วรายงานรายการที่แก้
ทดสอบบนหน้าจอด้วย Claude in Chrome: ลบ MS-010 (มีประวัติขาย) → snackbar ขึ้น และ console ไม่มี error
อัปเดต B13 เป็น "แก้แล้ว" + วันที่
build + test + lint ให้ผ่าน ยังไม่ต้อง commit
```

## 8. พิมพ์วันที่ใน datepicker ได้ปีผิด (B8)

ทำไม: ช่องแสดง วัน/เดือน/ปี พ.ศ. แต่พิมพ์เองถูกอ่านเป็น เดือน/วัน/ปี ค.ศ. → ได้ปี 3112 — ราคา / โปรผิดวันได้

```text
แก้ B8 ใน docs/test-before-saas.md:
datepicker ในเมนูราคา, โปรโมชั่น และบัตรสต็อก ใช้ provideNativeDateAdapter() — แสดงเป็น วัน/เดือน/ปี พ.ศ.
แต่ parse ตอนพิมพ์เป็น เดือน/วัน/ปี ค.ศ. ทำ DateAdapter (หรือ subclass NativeDateAdapter) ที่ parse / format
ตรงกัน: รับ d/m/yyyy (พ.ศ. เมื่อปี > 2400, ค.ศ. เมื่อปี < 2400) และแสดง d/m/yyyy พ.ศ.
วางไว้ใน shared/ แล้วใช้แทน provideNativeDateAdapter() ทุก route ที่ใช้ — ห้ามเพิ่มขนาด initial bundle
(เทียบ "Initial total" ก่อน/หลัง ตาม Gotchas) และห้ามใช้ new Date('YYYY-MM-DD')
spec ครอบ parse / format ทั้ง พ.ศ. / ค.ศ. / ค่าผิด
ทดสอบบนหน้าจอ: พิมพ์ 1/11/2569 ในช่วงราคา → ได้ 1 พ.ย. 2569
อัปเดต B8 เป็น "แก้แล้ว" + วันที่ และ CLAUDE.md (ประโยค "Datepickers need provideNativeDateAdapter()")
build + test + lint ให้ผ่าน ยังไม่ต้อง commit
```

## 9. บัตรสต็อก: ยอดยกมานับเป็นรับเข้า + ประวัติ serial (B17, B18) — ก่อน SaaS ขั้นที่ 3

ทำไม: ขั้นที่ 3 จะแยกบัตรสต็อก / serial / movement ตามสาขา ควรให้ตัวเลขและประวัติถูกก่อน

```text
แก้ B17 และ B18 ใน docs/test-before-saas.md:
- B17: buildStockCard() (core/models/costing.model.ts) — movement type 'opening' ที่อยู่ในช่วงต้องไม่ถูกนับใน
  "รับเข้า N ชิ้น" และ "รวมในช่วง รับ +N" (แยกเป็นยอดยกมา หรือแสดงเป็นบรรทัดของตัวเอง) — ตัวอย่าง HD-100 เดือนนี้
  ตอนนี้แสดงรับ 28 ทั้งที่รับจริง 3; แก้หน้า /inventory/stock-card/:productId ให้สอดคล้อง + spec
- B18: รับ serial ที่เคยตัดออกกลับเข้าคลัง (mock: POST /products/:id/serials, หมายเหตุ 'รับคืนเข้าคลัง') ตอนนี้ทับสถานะ /
  removedAt / note เดิมของ record — ให้ประวัติ Serial เห็นว่าเคยตัดออก (เช่นเก็บ history ใน SerialNumber หรือ
  ดึงจาก StockMovement มาแสดงใน dialog ประวัติ Serial) และให้บรรทัดรับเข้าในบัตรสต็อกมีหมายเหตุเดียวกับ serial
  เสนอแบบให้ฉันเลือกก่อนแก้ ถ้าต้องเพิ่ม field ใน model ต้องเติม default ตอนอ่าน
- อัปเดต B17 / B18 เป็น "แก้แล้ว" + วันที่ และ CLAUDE.md ส่วน Inventory costing / Serial SKUs ถ้ากฎเปลี่ยน
build + test + lint ให้ผ่าน ยังไม่ต้อง commit
```

## 10. ฟอร์มไม่หาย / ข้อความ error ตรงเหตุ (B22, B1, B14, B21)

ทำไม: ไม่กระทบข้อมูล แต่พนักงานหน้าร้านเจอบ่อย — แก้รวมทีเดียว

```text
แก้ B22, B1, B14, B21 ใน docs/test-before-saas.md:
- B22 หน้าเปลี่ยนสินค้า (features/sales/pages/exchange-form): server ตอบ 400 แล้วฟอร์มรีเซ็ต — ต้องเก็บค่าที่กรอกไว้;
  และเตือนก่อนส่งถ้า serial ใหม่ไม่อยู่ใน datalist ของ serial คงคลัง
- B1 openShiftError() และ B14 dialog รับสินค้าเข้า (features/inventory/dialogs): ข้อความต้องตรงเหตุ —
  ว่าง → "กรุณากรอก…", ทศนิยมเกิน 2 ตำแหน่ง → "ทศนิยมไม่เกิน 2 ตำแหน่ง", ติดลบ → "ต้องไม่ติดลบ"
  หาข้อความ "ต้องไม่ติดลบ" / "จำนวนเงินที่ไม่ติดลบ" ทั้งโปรเจกต์แล้วแก้แบบเดียวกัน
- B21 BuyerDialog (features/pos/dialogs): passport ผิดรูปแบบให้ขึ้น error ทันทีและ disable ปุ่ม เหมือนเลขผู้เสียภาษี
- spec ของฟังก์ชัน model ที่เปลี่ยนข้อความ
- อัปเดตทั้ง 4 ข้อเป็น "แก้แล้ว" + วันที่
build + test + lint ให้ผ่าน ยังไม่ต้อง commit
```

---

## หลังทำครบ

```text
ทำครบข้อ 0–10 ใน docs/before-do-saas-plan.md แล้ว ช่วยตรวจทาน:
- รัน npm run build, npx ng test --watch=false, npx ng lint และสรุปผล
- ทดสอบซ้ำบนหน้าจอด้วย Claude in Chrome เฉพาะข้อใน docs/test-before-saas.md ที่เกี่ยวกับบั๊กที่แก้
  (9.1, 9.x ปิดกะที่มีคืนเงิน, 8.24, 10.21, 13.3, 13.5, 5.4, 7.8 และสิทธิ์ staff 13.1) ห้ามล้าง mock db
- อัปเดตผลในตาราง และสรุปว่าพร้อมเริ่ม docs/saas-plan.md ขั้นที่ 1 หรือยัง
```

ข้อสังเกตที่ไม่ต้องทำก่อน SaaS (ค่อยทำเมื่อว่าง): B4 (error ทับ label), B6 (404 ไม่ redirect — ตรงกับ CLAUDE.md), B7 (ไม่มี returnUrl),
B9 (ตัวอย่าง serial มีขีด), B10 (ข้อความ max stock / ชื่อย่อ), B11 (no_sale ขึ้น "ไม่พบสินค้า"), B12 (error ขึ้นก่อนกรอก),
B15 (บัตรสต็อกของ SKU บริการ), B16 (from > to เด้งกลับคลัง)
