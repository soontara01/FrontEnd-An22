# C3.1 — log ระหว่างทดสอบ (ฉบับร่าง)

ใช้ส่งต่อระหว่าง session — ผลราย case จะย้ายลงตารางใน `docs/test-c3.md` ตอนจบ C3.1. ไฟล์ทดสอบ / สคริปต์สร้าง xlsx: `docs/test-data/c3/`

## บัญชีทดสอบ (stack local `an22-multi` เท่านั้น — ค่าทดสอบ ไม่ใช่รหัสจริง)

| บริษัท               | ผู้ใช้          | รหัสผ่าน         | บทบาท / สาขา                                         |
| -------------------- | --------------- | ---------------- | ---------------------------------------------------- |
| SOMJAI (S, Standard) | somjai          | `Somjai#2569`    | เจ้าของ                                              |
| SOMJAI               | manee           | `Admin#1234`     | ผู้ดูแล ทุกสาขา                                      |
| SOMJAI               | nok, jum, pim   | `Cash#1234`      | user HQ (pim ถูกล็อก login ผิด 5 ครั้งเมื่อ 26 ต.ค.) |
| ITMART (M, Standard) | wichai          | `Itmart#2569`    | เจ้าของ                                              |
| ITMART               | somsak          | `Admin#1234`     | ผู้ดูแล ทุกสาขา                                      |
| ITMART               | bnadmin         | `Admin#1234`     | ผู้ดูแล BN                                           |
| ITMART               | hq1 / bn1 / cm1 | `Cash#1234`      | user HQ / BN / CM                                    |
| ITMART               | duo             | `Cash#1234`      | user HQ + BN                                         |
| DEMO (seed)          | admin / somchai | `admin` / `1234` | เจ้าของ / user                                       |
| platform             | platform        | `platform`       | ผู้ให้บริการ                                         |

## สถานะเมื่อจบวันที่ 1 (26 ต.ค. 2569)

- stack: web `an22-web:68a45dd` (`WEB_IMAGE=an22-web:68a45dd docker compose -p an22-multi -f compose.multi.yaml --env-file .e2e/env --profile web up -d web` ใน `../an22-api`), api `5a62529` — **ห้าม reset** (ต้องเล่นข้ามวัน)
- เปิด: http://localhost:14000 (Claude in Chrome)
- S (SOMJAI): บิลวันที่ 26 — `POS-HQ-1-20261026-0001` (มีใบกำกับ `INV-HQ-20261026-0002` ผู้ซื้อ passport), `-0002` (serial R5C00000001 + ของแถม, ใบกำกับตอนขาย `INV-HQ-20261026-0001`), `-0003` (ยกเลิกแล้ว); กะ `SH-HQ-20261026-01` ปิด + อนุมัติ + ปรับปรุงแล้ว; เครื่องนี้ของ S = เครื่อง 1
- M (ITMART): บิล `POS-BN-2-20261026-0001` (BN, NA000003) กะ BN ปิดแล้ว; `POS-HQ-1-20261026-0001` (HQ, NA000001) — **กะ `SH-HQ-20261026-01` ของ hq1 เปิดค้างข้ามคืน** (ปิดวันที่ 2); เครื่องนี้ของ M = เครื่อง 1 (HQ); ใบโอน `TR-HQ-20261026-0001` รับขาดแล้ว, `-0002` ยกเลิก
- ห้องทำงาน: repo FrontEnd-An22 branch `c3/real-api` (`environment.ts` `useMock: false`)

## วันที่ 2 (27 ต.ค.) ที่เหลือ

- S6: ใบลดหนี้ (คืนบางรายการ / คืน serial / หักค่าธรรมเนียม) บนบิลวันที่ 26 → ใบเปลี่ยน serial (ตัวใหม่) → ยกเลิกและออกใบกำกับใหม่ (reissue — ระวัง: หน้าบิลเปิด dialog พิมพ์เองหลังออกใบ ต้องให้ผู้ใช้กดยกเลิก) → รายการขาย / ค้นหา / Excel (ดัก download ใน page) → รายงานภาษีขาย + สรุป → รายงานส่วนต่างกะ → แดชบอร์ด
- M7: รายการขาย / รายงานภาษี / กะ / audit: สาขาเดียว vs ทุกสาขา (ผู้ดูแลบริษัทเท่านั้น, bnadmin → 403), Excel มีคอลัมน์สาขา; ยกเลิก/ใบลดหนี้/ใบเปลี่ยนต้องทำที่สาขาของบิล (ลองบิล BN จาก HQ); กะ HQ ที่ค้างข้ามคืน: เตือนเปิดนาน + ปิดกะ (ยอดขายลงวันที่ 26)
- จบ: รวบผลลงตาราง `docs/test-c3.md` (ตาราง case ↔ test-final F1–F9 + ทุกหน้าใน `features/*/*.routes.ts`), แล้วรายงานผู้ใช้ก่อนทำ C3.3

## log วันที่ 1

stack: web an22-web:68a45dd, api 5a62529, reset 2026-10-26
S1.1 signup SOMJAI Starter (owner somjai, test pw in test-c3) -> dashboard, onboarding 0/5, users 1/1/1 ✅
S1.x login page shows demo hint "ทดลองใช้: DEMO admin/admin somchai/1234" in prod build -> C3-2 ⚠️
2.1a localStorage after signup: an22.branch, companyCode, pos.terminal.1 (leftover DEMO), theme only ✅; no mock request; foreign only fonts.gstatic ✅
S1.2 settings: branch footer saved (PUT /settings/branch) ✅, preview live ✅; company variance 100->50 saved ✅
S1.3 payment methods: CASH (signup default, round 0.25) + CARD 1.5% ref "เลขอนุมัติ", QR-PP (invalid "12345" -> save disabled; 0812345678 ok), TRANSFER, INST-10 min 3000 MDR3 10 months ✅ (5 methods)
S1.4 terminals: 1 POS ID E011234567001 ✅; dup 1 -> "มีเครื่อง 1 อยู่แล้ว" ✅; 2 without POS ID -> card "ยังไม่มี POS ID 1" ✅; 3rd add button disabled + tooltip Starter 2 ✅ (S4 limit)
S1.5 categories: MOB > MOB-PHN / MOB-ACC / MOB-SVC ✅; dup MOB-ACC -> "รหัสนี้มีอยู่แล้ว" ✅ (text overlaps next label = B4)
S1.6 supplier SUP-MOB: bad checksum -> "...(checksum)" ✅; valid saved, credit 30 ✅
S2.1 SKU form: CASE-IP15 (pack กล่อง×10 + barcodes, supplier main ฿42 MOQ20, min10 max50) ✅ — first try typed via triple-click didn't replace values (tool artefact; ctrl+a works) — not app bug
S2.2 PHN-A55 serial R5C len 11 warranty 12 ✅ ("สินค้าคุม Serial มีหน่วยเดียว"); SV-FILM service: reorder/pack fields hidden, unit ครั้ง, cost/ครั้ง ✅
S2.3 Excel import: 3 new (SIM-AIS EXEMPT, CASE-IP12 DISCONTINUED, CBL-USBC pack แพ็ค×5) + 2 errors "บาร์โค้ด 8850001000019 ใช้แล้วกับ CASE-IP15", "หมวดหมู่ MOB ต้องเป็นหมวดย่อยสุดที่เปิดใช้งาน" -> สำเร็จ 3 ✅; list hides discontinued by default (6 SKU card, 5 rows) ✅
S2.4 prices: CASE-IP15 199 (26–31 ต.ค.) preview 185.98+13.02 75.8% ✅; overlap 30/10 -> "ช่วงวันที่ทับกับราคา ฿199 (26 ต.ค. 2569 – 31 ต.ค. 2569)…" save disabled ✅; future 189 from 1/11 "รอเริ่ม" ✅ (typed พ.ศ. d/m/yyyy); A55 14990, FILM 150, SIM 49 (ยกเว้น VAT 18.4%), CBL 199; cards 5/0/1/1 ✅
S2.5 promos: PRO-ACC10 item 10% category อุปกรณ์เสริม (preview 3 SKU) ✅; PRO-BILL10K bill ≥10,000 −300 stackable ✅; PRO-A55-GIFT free CASE-IP15+SV-FILM per A55 (cost/set 75, margin 17.4%) ✅; edit started promo -> only end date/enabled/note + banner ✅
S2.6 /sku/labels: barcode stickers CASE×3 + CBL pack×2; shelf labels pack ฿995 (=199×5) with pack barcode 8850001000064 ✅
S3.1 inventory HQ: 4 SKU (service + discontinued hidden) ✅; receive CASE 3 กล่อง × ฿400 -> 30 ชิ้น avg 40 (default cost = main supplier ฿42) ✅
S3.2 serial receive: ABC123 "ต้องขึ้นต้นด้วย R5C", short length, dup "ซ้ำในรายการ" ✅; 5 serials @11,500 ✅
S3.3 receive-import Excel: CBL 4 แพ็ค @275 -> 20 เส้น @55, SIM 50 @38, 2 serials @11,400; errors R5C00000001 "มีอยู่ในคลังแล้ว", CASE-IP12 "สถานะ SKU ห้ามรับเข้า", SV-FILM "สินค้าบริการไม่มีสต็อก รับเข้าไม่ได้" ✅; A55 7 avg 11,471.43 ✅
S3.4 stock out CASE 2 damaged @40 -> 28 = 2 กล่อง 8 ชิ้น ✅; stock card month: ยกมา 0, +30 1,200, −2 80, คงเหลือ 28/1,120 ✅ (typed note didn't land — tool; code appends note)
S3.5 serial remove R5C00000007 damaged + note; serial history shows status/cost/note ✅; serial labels 7/7 (before remove) ✅; branch-stock page HQ only ✅
S3.6 reorder: empty first ✅; CBL min 25/max 48 + supplier -> suggest 30 เส้น = 6 แพ็ค ฿1,800 ✅
S4.1 users: nok, jum (user HQ), manee (admin ทุกสาขา) ✅; role list has no owner ✅; "NOK" -> "ชื่อผู้ใช้นี้มีอยู่แล้ว" ✅; pim = 5th (name stayed "นก ซ้ำ" — tool typing) ; add-user button disabled at 5/5 ✅
S4.2 menu access default user = แดชบอร์ด/ขายหน้าร้าน/การขาย/ตั้งค่า, users+account "admin เท่านั้น"; + คลังสินค้า saved ✅
S4.3 branch add disabled tooltip "แพ็กเกจ Starter ใช้สาขาได้ 1 สาขา — เปลี่ยนแพ็กเกจได้ที่เมนูบัญชีบริษัท" ✅; subscription Starter trial ถึง 9 พ.ย. 2569, 1/1 5/5 2/2 -> Standard confirm -> 1/3 5/20 2/10 ✅
S5.0 owner sets เครื่องนี้ = 1 -> localStorage an22.pos.terminal.2 = 1 ✅; logout -> fetch /api/me 401 ✅ (2.1); login page prefills username "admin" (C3-2 too)
S5.1 nok login: sidenav แดชบอร์ด/ขายหน้าร้าน/การขาย/คลังสินค้า/ตั้งค่า ✅; open shift dialog auto, -5 -> "เงินทอนตั้งต้นต้องไม่ติดลบ" ✅; count by denominations 1000×1+100×9+20×5 = 2,000 -> SH-HQ-20261026-01 ✅
S5.2 bill1: CASE box barcode (กล่อง 10 ฐาน) + CBL + SIM (exempt) + SV-FILM, PRO-ACC10 −10% -> 2,164.20, VAT 138.70 (exempt excluded) ✅; hold -> server dt_held_bills (encrypted bytea), localStorage none, reload -> recall same total ✅; held menu item text cut "฿2,164.2" + horizontal scrollbar (C3-3 ⚠️ UI)
S5.3 pay: card w/o ref -> "กรุณากรอกเลขอนุมัติ"; full card no -> "ห้ามกรอกเลขบัตรเต็ม — กรอกเฉพาะเลขอนุมัติหรือเลขบัตร 4 หลักท้าย" ✅; card 1000 + cash default 1,164.25 (rounded), 1,200 -> ปัดเศษ 0.05 ทอน 35.75 -> POS-HQ-1-20261026-0001 ✅ drawer chip
S5.4 bill2: A55 serial picker (removed serial not listed) R5C00000001 + free CASE+FILM (0.00) + PRO-BILL10K −300 -> 14,690, VAT 961.03 ✅; manual 10% -> "เกินเพดาน 5% ที่พนักงานให้ได้ — ให้ผู้ดูแลระบบทำรายการ" ✅; 5% −734.50 reason ต่อรองราคา -> 13,955.50 ✅; buyer dialog (tax ID, head office) ✅; QR 20000 -> "ยอดชำระที่ไม่ใช่เงินสดเกินยอดบิล (ทอนได้เฉพาะเงินสด)" ✅; QR 5000 + INST-10 8,955.50 ref -> POS-HQ-1-20261026-0002 + INV-HQ-20261026-0001, no drawer ✅
S5.5 bill3: CBL 179.10 cash default 179 (−0.10), 200 -> ทอน 21 -> -0003 ✅; receipt (print stage) POS ID E011234567001, ปัดเศษ, footer ✅
S5.6 cash out 9,999 -> "เงินสดในลิ้นชักไม่พอ" (no expected amount for user, B19), dialog keeps values ✅; 500 safe drop ✅; drawer open reason required -> saved ✅; X report 3 bills 16,298.80, discounts 1,278.20, −500, drawer 1, no per-method expected for user ✅
S5.7 lock: jum -> "ปลดล็อกได้เฉพาะ นก ขายดี หรือผู้ดูแลระบบ" ✅; reload stays locked (server) ✅; nok unlock ✅
S5.8 sales list (nok): 3 bills ฿16,299, cash net 1,343.25, no profit card ✅; bill page no cost (user) + receipt copy ✅
S5.9 void bill3 as nok: approver jum -> "ผู้อนุมัติต้องเป็นผู้ดูแลระบบ" dialog keeps values (F-B4 fix) ✅; manee -> ยกเลิก (โดย นก · อนุมัติโดย มานี), receipt copy "ยกเลิกแล้ว" ✅; dialog says "คืนเงินลูกค้า 179.10" though cash taken 179.00 (F-B3 open)
S5.10 close shift blind: checklist only; cash 2,600 vs expected 2,664.25 (= 2000+1164.25+179−179−500 ✅) −64.25; recount once (clears all inputs, no 2nd recount) ✅; reason required; > limit 50 -> "รอผู้ดูแลระบบอนุมัติ" ✅; Z report preview ✅ (void line −179.10 vs cash 179 — F-B3)
S5.11 manee /sales/shifts: pending filter 1, variance per cashier ✅; approve ✅; adjustment +60 cash นับผิด -> −64.25 → −4.25, Z copy shows approval + adjustments ✅
S5.12 later tax invoice bill1 passport TEST12345 -> issue -> page navigates to bill ?printInv=1 and opens the browser print dialog (by design) — blocks automation
NOTE: I once called POST /api/auth/logout via fetch instead of UI (deviation)
S5.12 (cont) after cancelling print: INV-HQ-20261026-0002 (passport TEST12345, dated sale day, issued 13:32), receipt copy refers to it, A4 original/copy with "ออกแทนใบกำกับภาษีอย่างย่อ…" ✅; admin sees cost/profit on bill (COGS 523, GP 1,502.50) ✅
M1.1 signup ITMART: bad checksum -> "เลขประจำตัวผู้เสียภาษีต้องเป็น 13 หลักที่ถูกต้อง" ✅; code SOMJAI -> "รหัสบริษัทนี้ถูกใช้แล้ว" ✅; ITMART Pro -> dashboard 0/5 ✅ (owner wichai)
M1.2 branches BN 00001, CM dup 00001 -> "เลขที่สาขานี้มีอยู่แล้ว" -> 00002 ✅; toolbar becomes branch menu ✅; CM off -> list ปิดใช้งาน, on again ✅
M1.3 terminals 1 HQ, 2 BN, 3 CM with POS IDs (branch select in dialog) ✅ — numbers continue company-wide
M2 users: somsak (admin ทุกสาขา), bnadmin (admin BN), hq1/bn1/cm1 (user), duo (HQ+BN) ✅
M3.1 categories IT > IT-NB / IT-ACC; Excel import NB-ASUS14 (serial NA len 8), MS-LOGI, KB-LOGI ✅; prices 22,990 / 390 / 450 ✅
M3.2 HQ receive MS 30 @240, KB 20 @290, NB NA000001-04 @17,800; switch to BN (toolbar reload) -> BN stock 0, reorder levels 0 (per branch) ✅; BN MS 10 @260; NB NA000005-06 @18,200; NA000001 -> server "รับเข้าไม่ได้ — NA000001: อยู่ในคลังสาขา HQ" ✅ (client accepted it — server-only check, fine)
M3.3 branch-stock MS: HQ 30 @240 / BN 10 @260 / CM 0, NB HQ 4 @17,800 / BN 2 @18,200 ✅; stock card ?branch=4 from BN shows HQ card ✅; BN reorder min 15 -> suggest 20 (max 0 -> 30) ✅
M4 promos (owner): PRO-BN-MS MS 10% BN only (preview margin with BN avg) ✅; PRO-KB-ALL KB 10% all branches ✅; bnadmin: BN promo page no edit/disable + note "โปรที่จำกัดสาขาสร้าง / แก้ได้เฉพาะผู้ดูแลระบบระดับบริษัท" ✅; new promo form branch field disabled "จำกัดสาขาได้เฉพาะผู้ดูแลระบบระดับบริษัท" ✅
M5 transfers: HQ->BN MS 40 -> "MS-LOGI มีสต็อกไม่พอ (คงเหลือ 30 ชิ้น)" ✅; serial needs pick ✅; TR-HQ-20261026-0001 MS 6 @240 + NA000003/04 @17,800 ✅; HQ->CM KB 3 TR-HQ-20261026-0002 cancel with reason -> ยกเลิก ✅; bnadmin receive 5/6 + 1/2 serial -> reason required -> "รับแล้ว" ขาด 1 / ขาด 1 ✅; BN stock card: +10@260, โอนเข้า +6@240 avg 252.50, ตัดออก −1 @252.50 note TR + reason -> 15 / 3,787.50 ✅
M2.1 bnadmin login -> BN auto (device had HQ), toolbar not a menu ✅; users list: only BN users editable (hq1/cm1/duo/somsak/owner disabled) ✅; stock-card ?branch=4 -> "ไม่มีสิทธิ์ดูบัตรสต็อกของสาขานี้" + back to inventory ✅; dashboard user stats show company-wide 7/7/3 (⚠️ minor: branch admin sees whole-company user counts)
M2.2 bnadmin settings: "เครื่องนี้" lists only BN terminal 2; company part read-only "เฉพาะผู้ดูแลระบบระดับบริษัทแก้ไขได้" ✅; duo login (device BN) -> BN, branch menu HQ/BN only ✅; cm1 login -> CM auto; POS banner "เครื่อง 2 เป็นเครื่องของสาขาอื่น…" + toast names BN ✅; duo login with device CM -> /auth/select-branch (HQ, BN) ✅
M6.1 duo @BN: shift SH-BN-20261026-01; serial picker only BN serials (03/05/06); typing NA000001 -> "ไม่พบ NA000001 ในคลังสาขานี้ของ NB-ASUS14" ✅; MS gets PRO-BN-MS ✅; KB at BN 0 stock -> "KB-LOGI สต็อกไม่พอ (คงเหลือ 0 ชิ้น)" blocks pay ✅; POS-BN-2-20261026-0001 23,341 ✅; close shift 24,341 = 0 variance ✅
M6.2 owner switch HQ: settings shows "เครื่อง 2 เป็นเครื่องของสาขา BN…" -> set terminal 1 ✅; onboarding card gone after 5 steps ✅; hq1 shift SH-HQ-20261026-01 (left OPEN overnight), serials HQ 01/02 only ✅; MS no BN promo at HQ, KB PRO-KB-ALL ✅ -> POS-HQ-1-20261026-0001 (M) 23,785 ✅
M6.x ⏭️ simultaneous shifts in several branches in one browser: one session cookie + one device terminal per company (localStorage pos.terminal.<company>) — needs separate browser profiles; done sequentially instead
M8.1 platform login (page shows "(ทดลอง: platform / platform)" -> C3-2) ✅; company list DEMO/SOMJAI/ITMART with plan/status/counts ✅; DEMO "ใบถัดไป 31 ธ.ค. 10542" (seed 9999-12-31 sentinel shown as BE year) -> C3-4 ⚠️ low
M8.2 company detail (link click by tool didn't navigate; URL /platform/companies/3 ok); suspend needs reason + confirm -> "ระงับ: ผู้ให้บริการระงับ" ✅; shop session -> logged out (GET /me 401) ✅
X.1 login ITMART wrong pw -> "รหัสบริษัท ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง"; correct pw while suspended -> "บริษัทนี้ถูกผู้ให้บริการระงับการใช้งาน — เจ้าของบริษัทติดต่อผู้ให้บริการ"; code NOPE -> same generic message (E3) ✅
M8.3 reactivate ✅; outbox menu -> snackbar "ไม่มี endpoint GET /platform/outbox" (404 as agreed) ✅; console no errors
S1.7 forgot password SOMJAI + owner email -> generic answer "ถ้ารหัสบริษัทและอีเมลตรงกับเจ้าของบริษัท ระบบจะส่งลิงก์…(ใช้ได้ภายใน 1 ชั่วโมง)" ✅; opening link ⏭️ (mail deferred)
S7.1 dashboard S owner: onboarding card gone (5/5) ✅; staffSeeCost on -> nok sees cost/value in inventory (no stock-out buttons) ✅, stock math CASE 17 / CBL 19 / SIM 49 / A55 5 ✅; off again ✅
S7.2 audit log 33 events (signup, settings, terminals, prices, promos, stock out, serial out, users, menu access, plan, discount, void+approver, shift approve/adjust, logins) ✅; ?action=sale_void -> 1 ✅; user filter manee -> 3 (?user=8) ✅; C3-5 ⚠️ low: "฿1490" no separator, "สาขา 3" (id) instead of HQ, company settings detail doesn't mention staff-see-cost change
S7.3 ownership: button only for users with e-mail; wrong pw -> "รหัสผ่านไม่ถูกต้อง"; -> manee owner / somjai admin ✅; manee transfers back ✅
S7.4 deletion request (reason, type SOMJAI, password, confirm) -> "…จะถูกลบได้ตั้งแต่วันที่ 25 พ.ย. 2569", /sales redirects to /account/data ✅; cancel -> dashboard ✅ (staff login during deletion not tried)
PENDING today: export JSON / Excel downloads (need user OK), M8 downgrade, C3.2 checks. TOMORROW (27 ต.ค.): S6, M7, close M HQ shift left open (SH-HQ-20261026-01 ITMART)
--- 26 ต.ค. evening (after tool quota reset)
S7.5 export JSON (download intercepted in page): somjai-data-20261026-1701.json 70 KB, schemaVersion/exportedAt/company/data, 37 collections, no "passw", no bcrypt hash, no JWT ✅
S2.7 SKU Excel export (intercepted): sku-HQ-20261026-1702.xlsx 9 KB xlsx mime ✅ (exceljs chunk same-origin)
2.1 curl: login Set-Cookie an22.sid HttpOnly; SameSite=Lax (no Secure: COOKIE_SECURE=false local) 12h; body keys billing/branches/canSeeCost/company/user — no token ✅; logout -> /api/me 401 ✅; XSRF-TOKEN cookie readable by JS (by design) ✅
2.2 POST /api/auth/login without X-XSRF-TOKEN -> 403 "คำขอไม่ถูกต้อง กรุณาโหลดหน้าใหม่"; forged header -> 403 ✅
2.4 CSP header default-src 'self' … connect-src 'self', fonts only googleapis/gstatic ✅; console: no CSP violation / no errors across pos, sales, shifts, tax-report(+summary), transfers, master-data, menu-access, subscription, sku import, platform, 404 ✅; foreign requests only fonts.gstatic ✅
2.5 web restart (memory sessions dropped) -> next click 401 -> back to login, BUT snackbar "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" is lost by the full reload in auth.logout() -> C3-6 ⚠️ (suggest /auth/login?expired=1 shown on login page)
2.6 lb alternates 172.20.0.4/.5 3:3 ✅; docker restart api1 while browsing 5 menus -> no error, no 5xx in web/lb log, session kept ✅
2.7 api: 6th wrong login for pim -> "พยายามบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่"; other user (somjai) still logs in (per-user) ✅; web: 20 login attempts / 15 min per IP -> 429 same Thai text, RateLimit-Policy 20;w=900, Retry-After ✅ shown on login page ✅; C3-7 ⚠️ medium: limit counts successful logins too and is per IP — a shop with many staff behind one public IP (and our test itself) hits it quickly; suggest count failures only / per IP+username
2.8 logs web/api1/api2/lb: no test passwords, Bearer, JWT, XSRF value, buyer tax ID / passport / name / address, PromptPay number ✅ (only hit: api access log requestBody {"password":"***"} masked) — web & api1 logs before their restart not available
2.9 DEMO somchai: GET /api/products cost/avgCost/suppliers[].cost all null ✅; sales list no profit card ✅
X.2 DEMO old SO- bills (sold_at Sep–Oct): list 1 ก.ย.–26 ต.ค. shows 7 SO bills, bill page "คำสั่งขายก่อนมีระบบขายหน้าร้าน — ไม่มีรายการสินค้า" ✅; note: `/sales?all=1` no longer supported (ignored -> today) but CLAUDE.md still says `?all=1` -> C3-8 doc ⚠️ low; API refuses ranges > 366 days ("ช่วงวันที่ต้องไม่เกิน 366 วัน")
2.10 timings (small data): page DCL < 100 ms, each /api call 40–95 ms ✅
M8.4 ITMART owner: -> Starter dialog warns over limits; after: 3/1 7/5 3/2 red "ใช้เกินแพ็กเกจอยู่ … ของเดิมใช้ต่อได้ แต่เพิ่มใหม่ไม่ได้", add-user tooltip ✅; -> Standard: add branch disabled "แพ็กเกจ Standard ใช้สาขาได้ 3 สาขา" ✅
NOTE: web IP limiter currently exhausted (~9 min) — wait before next logins

## log วันที่ 2 (27 ต.ค. 2569)

- S6.1 bill 0002 next day: void button gone, "ยกเลิกได้เฉพาะบิลของวันนี้ บิลข้ามวันต้องออกใบลดหนี้" + ออกใบลดหนี้ button ✅
- S6.2 exchange (owner) A55 R5C00000001 → R5C00000002, old unit damaged, reason chip -> EX-HQ-20261027-0001, warranty to 26 ต.ค. 2570 (from sale day), bill line "SN R5C00000002 (เปลี่ยนจาก R5C00000001)" ✅; page auto-opened print dialog (?printEx=1, user cancelled); toggle wording: off = "ชำรุด ตัดออก", on = "สภาพดี กลับเข้าคลัง" (a little confusing)
- S6.3 owner opened shift SH-HQ-20261027-01 (float default 2,000 = left in drawer) ✅
- S6.4 credit note bill 0002: current serial R5C00000002 offered ✅; return phone only -> kept free goods deducted at list price −199 / −150 -> refund 13,606.50, VAT 890.15 ✅; default refund = bill's methods QR 5,000 + INST 8,606.50 (+ ref) -> CN-HQ-20261027-0001 quoting INV-HQ-20261026-0001 ✅ (window.print stubbed in page — no dialog)
- S6.5 reissue INV for bill 0002 (wrong buyer name) -> INV-HQ-20261026-0003 (sale day) replaces 0001 "ยกเลิกเมื่อ 27 ต.ค. … ชื่อผู้ซื้อผิด · แทนด้วย 0003"; CN shows "INV-HQ-20261026-0001 ยกเลิกแล้ว แทนด้วย INV-HQ-20261026-0003" ✅
- S6.6 credit note bill 0001 partial (CBL 1) cash 179.10 -> CN-HQ-20261027-0002 ✅; cash refund not rounded (F-B3 confirmed on real api)
- S6.7 sales list 26–27 ต.ค.: 2 paid ฿16,120, GP ฿1,646, CN 2 ใบ ฿13,786, void ฿179, per method net of refunds (INST 349, cash 985.15), badges "คืนบางส่วน / เปลี่ยนสินค้า" ✅; search R5C00000001 finds bill, **R5C00000002 (serial after exchange) finds nothing** -> C3-9; Excel (intercepted) sales-HQ-20261027-1027.xlsx 13.7 KB ✅
- S6.8 tax report ต.ค. HQ: abbreviated per day + POS ID (1 ใบ, ยกเลิก 1, ไม่รวมเต็มรูป 1), INV-0001 cancelled = 0, INV-0003 replacement 13,955.50, INV-0002 (issued later) reference "ไม่นับซ้ำ", CN-0001 −13,606.50 / CN-0002 −179.10 with buyers; total 2,334.10 ✅; note "ออกใบเมื่อ 2026-10-26" raw ISO date (C3-10 low); summary page label + HQ + total ✅
- S6.9 shifts list: SH-HQ-20261027-01 open, SH-HQ-20261026-01 −4.25 "เดิม −64.25 · ปรับปรุงแล้ว", variance per cashier ✅
- S6.10 close SH-HQ-20261027-01 (owner): QR −5,000 / INST −8,606.50 accepted (S9) ✅; cash expected 1,820.90 counted 1,820.75 (no 10-satang coin) −0.15 -> "อื่น ๆ" needs detail ✅; Z "คืนเงิน 2 ใบ −13,785.60" ✅ — F-B3 visible on screen
- M7.1 owner @HQ POS: overnight shift banner "เปิดนานเกิน 12 ชม. — ลืมปิดกะหรือไม่?", owner can't sell "กะนี้เป็นของ แอน… ต้องปิดกะนั้นก่อนจึงจะขายได้" ✅
- M7.2 /sales?branch=all: 2 bills, branch column HQ/BN ✅; Excel (intercepted, unzipped in page) sales-all-20261027-1030.xlsx sheets บิล/รายการสินค้า/การชำระเงิน/ใบลดหนี้ with "สาขา" column ✅
- M7.3 BN bill opened at HQ: no void/CN/exchange buttons, "บิลนี้ขายที่สาขา BN — ยกเลิก / คืน / เปลี่ยนสินค้าได้ที่สาขานั้น", receipt copy prints BN address + POS ID ✅
- M7.4 tax summary ต.ค.: HQ 23,785 / BN 23,341 / CM 0 / total 47,126 + label ✅; tax report branch=5 (BN) heading สาขา 00001 ✅; shifts ?branch=all with branch column + "เปิดค้าง" badge ✅
- M7.5 owner "ปิดกะแทน" SH-HQ-20261026-01 from /sales/shifts/3 -> /pos/shift-close?shift=3 "ปิดกะแทนเจ้าของกะ" blind count 24,785 = 0 -> Z "ปิดแทนโดย วิชัย ไอที", opened 26 ต.ค. ✅
- M7.6 audit ?branch=5: BN events (terminal, branch) ✅ — transfer receive/shortfall not audited (by design: only transfer_cancel)
- M7.7 bnadmin: /sales?branch=all -> 403 "ดูทุกสาขาได้เฉพาะผู้ดูแลระบบระดับบริษัท", no branch picker ✅; /sales/tax-report/summary -> back to own BN report ✅; month field shows "October 2026" (English, ค.ศ.) -> C3-11 low
- M7.8 dashboard: shows user counts only (no sales figures) — "แดชบอร์ดต่อสาขา" in the plan has nothing branch-specific to check ⏭️
- routes: bnadmin users/14/edit saved name ✅; suppliers/new SUP-IT -> suppliers/6/edit opened ✅; /auth/reset-password?token=<fake> (logged out) -> "ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง หมดอายุ หรือใช้ไปแล้ว — ขอลิงก์ใหม่" ✅ (logged in -> guestGuard to dashboard) — every path in features/_/_.routes.ts opened at least once
