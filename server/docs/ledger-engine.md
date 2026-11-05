# 📒 Ledger Engine

[⬅️ Server README](../README.md) · Business view: [docs/04-business-workflows.md § 2](../../docs/04-business-workflows.md#2-the-cascading-ledgers)

---

Code: [`services/balanceService.js`](../services/balanceService.js), [`services/depositRules.js`](../services/depositRules.js),
[`services/paymentLedger.js`](../services/paymentLedger.js).

## 1. 📐 Formulas

| Ledger | Formula |
|---|---|
| 🏭 `DairyBalance` (brand, day) | `closing = opening + stockValue + depositValue + topUpAmount − amountPaid` |
| 🛵 `SalespersonBalance` (salesperson, day) | `closing = opening + stockGiven + topUpAmount − amountPaid` |

| Component | Dairy source | Salesperson source |
|---|---|---|
| `opening` | closing of the latest earlier `DairyBalance` (or 0) | closing of the latest earlier `SalespersonBalance` (or 0) |
| stock | Σ receipts `quantity × unitPrice` for the day | Σ `StockDispatch.totalAmount` for the day |
| `depositValue` | Σ `calculateLineDeposit` for qualifying receipt lines | — |
| `topUpAmount` | Σ `DairyPayment.amount` where `isTopUp = true` | Σ `SalespersonPayment.amount` where `isTopUp = true` |
| `amountPaid` | Σ `DairyPayment.amount` where `isTopUp = false` | Σ `SalespersonPayment.amount` where `isTopUp = false` |

## 2. 🔁 Cascade algorithm

```mermaid
flowchart TD
    A["recalculate*Balance(id, date, tx?)"] --> B{tx passed?}
    B -- no --> C["prisma.$transaction(…, Serializable)"]
    B -- yes --> D[use caller's tx]
    C & D --> E["_calc(id, date): compute + upsert row for date"]
    E --> F[find all balance rows with balanceDate > date, ascending]
    F --> G{more rows?}
    G -- yes --> H["_calc(id, row.balanceDate)"] --> G
    G -- no --> I[done]
```

- `_compute*` is the **single** implementation of each formula; `compute*Balance` (read-time fallback for a day with
  no row) and the writer both use it, so they cannot drift.
- Rows are created lazily: a day gets a balance row when something is recalculated for it.

## 3. 🧷 Using it correctly

```js
// ✅ standalone
await recalculateSalespersonBalance(salespersonId, '2026-11-05');

// ✅ inside your own transaction — pass tx so it joins it
await prisma.$transaction(async (tx) => {
  await tx.salespersonPayment.create({ data });
  await recalculateSalespersonBalance(data.salespersonId, data.paymentDate, tx);
}, { isolationLevel: 'Serializable' });

// ❌ global client inside a transaction — runs outside it, can deadlock / race
await prisma.$transaction(async (tx) => {
  await tx.salespersonPayment.create({ data });
  await recalculateSalespersonBalance(data.salespersonId, data.paymentDate);
});

// ❌ never
await prisma.salespersonBalance.update({ … });
```

## 4. 📆 Changing a payment's date

```mermaid
sequenceDiagram
    autonumber
    participant C as payment controller
    participant PL as paymentLedger.cascadeAroundDateChange
    participant BS as balanceService
    C->>C: update payment (old date D1 → new date D2)
    C->>PL: (recalc, entityId, D1, D2, tx)
    PL->>BS: recalc(entityId, earlier of D1/D2, tx)
    alt date moved
        PL->>BS: recalc(entityId, later of D1/D2, tx)
    end
    Note over PL,BS: fixes both the day the payment left<br/>and the day it arrived
```

`paymentLedger.validateBulkEntities` checks that each id in a bulk top-up appears once and exists before any write.

## 5. 🪙 Deposit rule

```mermaid
flowchart LR
    Q1{brand.depositEnabled<br/>and depositPerLitre > 0} --> Q2{product.depositEnabled} --> Q3{unitType ml or gram} --> Q4{containerType = crate<br/>and unitSize} --> Q5{category.depositEnabled}
    Q5 --> Y["deposit = round2(qty × unitSize / 1000 × depositPerLitre)"]
```

`depositRules` is shared by the ledger writer and the deposit report — they must agree to the paisa.

## 6. ⚡ Performance notes

| Concern | Mitigation |
|---|---|
| Old edits recompute many days | Cascade only touches rows **after** the edited date for that one entity |
| Concurrent edits to one ledger | Serializable isolation; one transaction fails instead of corrupting |
| Date-range reports | Indexes on `(brand_id, receipt_date)`, `(salesperson_id, payment_date)`, `dispatch_date` |

## 7. 🧪 Tests

- Mocked: `tests/playwright/balanceServiceStandalone.spec.js`, `dairyBalance.spec.js`, `salespersonBalance*.spec.js`,
  `paymentLedger.spec.js`, `depositRules.spec.js` (helpers in `tests/helpers/mock-cascade.js`).
- Live: `dairy-ledger.feature`, `salesperson-ledger.feature` in [`automation/`](../automation/README.md).
