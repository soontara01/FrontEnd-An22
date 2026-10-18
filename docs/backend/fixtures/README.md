# Golden fixtures

ตัวอย่างโจทย์พร้อมคำตอบที่ถูกของกฎคำนวณ — **สร้างจากโค้ด TypeScript ตัวจริง** (`src/app/core/models/golden/golden-fixtures.ts`)
ใช้ทดสอบว่าการ port กฎไป Java ให้ผลตรงกับหน้าบ้าน **ทุกตัวเลขและทุกข้อความ**

ห้ามแก้ไฟล์ JSON ด้วยมือ: เพิ่ม / แก้เคสใน `golden-fixtures.ts` แล้วรัน `npm run fixtures` (repo หน้าบ้าน)
spec `golden-fixtures.spec.ts` แดงทันทีถ้า JSON ไม่ตรงกับผลของโค้ดปัจจุบัน — กฎเปลี่ยน = JSON เปลี่ยนใน commit เดียวกัน = api เห็น diff

## ไฟล์

### `price-cart.json` — `priceCart()`, `cartError()`, `manualDiscountError()` (`core/models/pos-pricing.model.ts`)

```text
[{ name,
   input: { items: CartItem[], context: PricingContext, freeSerials: FreeSerial[],
            billManualDiscount: ManualDiscount | null,
            manualDiscountRule: { reason, isAdmin, maxPercent } },
   expected: { cart: PricedCart,
               cartError: string | null,                 // = 400 ตอน POST /sales
               manualDiscountError: string | null } }]  // = 400 ตอน POST /sales
```

เทียบให้ตรง **ทั้ง object** `cart` รวม `lines` (ลำดับ: บรรทัดจ่ายเงินตามตะกร้า แล้วบรรทัดของแถม), `issues` (ลำดับ + ข้อความ + `blocking`)
`context.date` ตายตัว (ไม่มี "วันนี้") — สถานะโปรคิดจากวันที่นี้

### `payment.json` — `paymentSummary()`, `paymentError()` (`core/models/pos-payment.model.ts`)

```text
[{ name,
   input: { total, payments: PaymentInput[], methods: PaymentMethod[] },
   expected: { summary: PaymentSummary, error: string | null } }]
```

## ใช้ใน repo api (JUnit 5)

```java
@TestFactory
Stream<DynamicTest> priceCartMatchesFrontEnd() throws IOException {
  var root = Path.of("../FrontEnd-An22/docs/backend/fixtures/price-cart.json");
  List<PriceCartFixture> cases = mapper.readValue(root.toFile(), new TypeReference<>() {});
  return cases.stream().map(c -> DynamicTest.dynamicTest(c.name(), () -> {
    var cart = pricing.priceCart(c.input().items(), c.input().context(),
        c.input().freeSerials(), c.input().billManualDiscount());
    assertThat(toJsonTree(cart)).isEqualTo(c.expected().get("cart"));   // ทุก field
    assertThat(pricing.cartError(cart)).isEqualTo(c.expected().cartError());
  }));
}
```

- เทียบตัวเลขแบบ **ค่าเท่ากัน** (`450` กับ `450.00` ถือว่าเท่า — ใช้ `compareTo` หรือแปลงเป็น `BigDecimal.stripTrailingZeros()`) ไม่ใช่เทียบข้อความ JSON
- ข้อความ error ต้องตรงทุกตัวอักษร รวมรูปแบบเงิน `฿1,234.5` (ตัวคั่นหลักพัน `,` ทศนิยมไม่เกิน 2 ไม่เติม 0 — `toLocaleString('en-US', { maximumFractionDigits: 2 })`)
- path `../FrontEnd-An22` = clone ทุก repo ไว้ข้างกัน (ดู `../README.md`); CI ต้อง checkout repo หน้าบ้านคู่ด้วย หรือ copy ไฟล์ตอน build
- การปัดเศษ: ดู `../domain-rules.md` "ข้อควรระวังตอน port" — มีเคสยอดติดลบ (`rounding: -0.1`) และเศษสตางค์จากการเฉลี่ยส่วนลดอยู่แล้ว

## เพิ่มเคส

ทุกครั้งที่เจอบั๊กคำนวณไม่ตรงกันระหว่างหน้าบ้าน / หลังบ้าน → เพิ่มเคสนั้นที่นี่ก่อนแก้ ไฟล์ต่อไปที่ควรมี (ตามความเสี่ยง):
`credit-note.json` (`draftCreditNote()`), `stock-card.json` (`movingAverage()` / `buildStockCard()`), `shift.json` (`expectedByMethod()` / `countCheck()`)
— เพิ่ม key ใน `buildGoldenFixtures()` + import ใน `golden-fixtures.spec.ts`
