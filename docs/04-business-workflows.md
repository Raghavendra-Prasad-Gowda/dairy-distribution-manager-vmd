# 🔄 04 · Business Workflows

[⬅️ Domain model](03-domain-model.md) · [Docs index](README.md) · [Next: Security model ➡️](05-security.md)

---

Each workflow lists the **actors**, the **flow**, the **rules** and the **code** that implements it.

| # | Workflow |
|---|---|
| 1 | [📦 Stock receipt](#1-stock-receipt) |
| 2 | [📒 The cascading ledgers](#2-the-cascading-ledgers) |
| 3 | [🏷️ Salesperson pricing & product access](#3-salesperson-pricing--product-access) |
| 4 | [🚚 Daily dispatch (stock entry)](#4-daily-dispatch-stock-entry) |
| 5 | [🔒 Dispatch lock lifecycle](#5-dispatch-lock-lifecycle) |
| 6 | [✅ Day finalization](#6-day-finalization) |
| 7 | [💰 Payments, collections & top-ups](#7-payments-collections--top-ups) |
| 8 | [🧾 Bills](#8-bills) |
| 9 | [🔑 Protected actions (PIN)](#9-protected-actions-pin) |
| 10 | [📊 Reporting](#10-reporting) |

---

## 1. Stock receipt

**Actor:** admin · **Screen:** `/dairy/stock/:brandName` · **API:** `POST /stock-receipts/bulk`

```mermaid
flowchart TD
    A[🧑‍💼 Open brand tab + date] --> B{Brand uses routes?}
    B -- Nandini --> C[Enter quantities per route]
    B -- Jersey / Gowardhan --> D[Enter quantities, routeId = 0]
    C & D --> E[Save]
    E --> F[✅ Zod: date ≤ tomorrow IST]
    F --> G[🔁 Serializable tx]
    G --> H[Upsert receipt rows<br/>productId · date · routeId]
    H --> I[recalculateDairyBalance brand, date, tx]
    I --> J[Commit]
    J --> K[💬 STOCK_RECEIPT_SAVED]
```

| Rule | Detail |
|---|---|
| Dates | Up to **tomorrow** (IST) — trucks for tomorrow can be pre-entered |
| Price | `unitPrice` stored on each row (cost price at entry time) so history never changes |
| Visibility | Only products with `showInStockReceipt=true` appear |
| Rate limit | 30 bulk writes / minute |

## 2. The cascading ledgers

Both ledgers have one row per entity per day that had activity. A row's **opening** is the previous row's
**closing**, so a change to an old day ripples forward.

```mermaid
flowchart LR
    subgraph D1["Day 1"]
        O1[Opening 0] --> C1[Closing 1 000]
    end
    subgraph D2["Day 2 ✏️ edited"]
        O2[Opening 1 000] --> C2[Closing 1 500 → 1 800]
    end
    subgraph D3["Day 3"]
        O3[Opening 1 500 → 1 800] --> C3[Closing 900 → 1 200]
    end
    subgraph D4["Day 4"]
        O4[Opening 900 → 1 200] --> C4[Closing …]
    end
    C1 --> O2
    C2 -. cascade .-> O3
    C3 -. cascade .-> O4
```

| Ledger | Formula | Inputs per day |
|---|---|---|
| 🏭 Dairy (per brand) | `closing = opening + stockValue + depositValue + topUpAmount − amountPaid` | receipts × price, crate deposit, dairy top-ups, dairy payments |
| 🛵 Salesperson | `closing = opening + stockGiven + topUpAmount − amountPaid` | dispatch totals, salesperson top-ups, collections |

**What triggers a recalculation**

| Event | Call |
|---|---|
| Stock receipt saved | `recalculateDairyBalance(brandId, date)` |
| Dairy payment / top-up created, updated, deleted | `recalculateDairyBalance` (old **and** new date if the date changed) |
| Dispatch saved, cleared, deleted, opened for entry | `recalculateSalespersonBalance(salespersonId, date)` |
| Collection / top-up created, updated, deleted | `recalculateSalespersonBalance` (old and new date) |
| Ledger reset (superadmin) | **Deletes** every dispatch, collection and balance row of the selected salespeople in one transaction — irreversible |

**Deposit rule** — a receipt line adds deposit only when *all* are true:

```mermaid
flowchart LR
    A{Brand depositEnabled<br/>and depositPerLitre > 0?} -->|yes| B{Product depositEnabled?}
    B -->|yes| C{unitType ml/gram<br/>and containerType = crate<br/>and unitSize set?}
    C -->|yes| D{Category depositEnabled?}
    D -->|yes| E[💰 deposit = qty × unitSize/1000 × depositPerLitre<br/>rounded to paise]
    A & B & C & D -->|no| F[No deposit]
```

Code: `server/services/balanceService.js`, `server/services/depositRules.js`, `server/services/paymentLedger.js`.

## 3. Salesperson pricing & product access

```mermaid
flowchart TD
    P[Product] --> Q{SalespersonProduct row<br/>for this salesperson?}
    Q -- yes --> R[use its isEnabled]
    Q -- no --> S[use product.salespersonEnabled]
    R & S --> T{enabled?}
    T -- no --> X[🚫 hidden / rejected]
    T -- yes --> U{SalespersonPrice with<br/>effectiveFrom ≤ dispatch date?}
    U -- yes --> V[latest such price]
    U -- no --> W[product.salespersonDefaultPrice]
```

| Operation | Who | API |
|---|---|---|
| Edit one salesperson's prices (effective today or later) | admin | `POST /salespeople/:id/prices/bulk` |
| Copy prices from another salesperson | admin | `POST /salespeople/:id/prices/copy-from/:sourceId` |
| Bulk update across salespeople | admin | `POST /salespeople/bulk-update` |
| Toggle global access | admin | `PATCH /products/salesperson-global` |
| Per-salesperson exceptions | admin | `POST /salespeople/:id/products/bulk`, `/salespeople/products/bulk-update` |

> ⚠️ Use `??`, never `&&`, when resolving access — `&&` would make exceptions for globally-disabled products impossible.

## 4. Daily dispatch (stock entry)

**Actors:** salesman (own phone) or admin · **API:** `POST /dispatches`

```mermaid
sequenceDiagram
    autonumber
    actor SM as 🛵 Salesman
    participant UI as StockEntry
    participant API as POST /dispatches
    participant DB as PostgreSQL
    SM->>UI: quantities for today
    UI->>API: { salespersonId, dispatchDate, items[] }
    API->>API: role ≠ dispatcher · salesman = own id only
    API->>API: locked? (submitted or past day, not admin-unlocked)
    API->>DB: resolve enabled products + prices on that date
    Note over API: Prices from the request are ignored —<br/>unitPrice is re-derived server-side
    API->>DB: tx: upsert dispatch + items, totalAmount
    API->>DB: recalculateSalespersonBalance(tx)
    API-->>UI: saved dispatch
    API-)API: 💬 DISPATCH_SAVED
```

| Rule | Detail |
|---|---|
| Empty `items` | Clears the draft (deletes the dispatch) |
| Dates | Up to tomorrow (IST) |
| Stock availability | **Not enforced** — owner decision 2026-08-16. `stockGuard.validateDispatchStock` exists, unwired |
| Dispatcher | Read-only on entries (cannot create/delete) |

## 5. Dispatch lock lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft: first save
    Draft --> Draft: salesman edits
    Draft --> Submitted: PATCH submit
    Submitted --> AdminUnlocked: PATCH unlock (admin, or dispatcher today)
    AdminUnlocked --> Draft: salesman edits again
    AdminUnlocked --> Submitted: PATCH lock / submit
    Draft --> PastDay: midnight IST
    PastDay --> AdminUnlocked: admin unlock / open-for-entry
    Submitted --> [*]
```

**Effective lock** = `(isSubmitted OR date < today) AND NOT isAdminUnlocked`.

| Actor | Can lock/unlock |
|---|---|
| Admin / superadmin | Any date |
| Dispatcher | Only **today**, and only until today is finalized |
| Salesman | Submit own entry only |

`POST /dispatches/open-for-entry` (admin) creates or unlocks an entry for a salesperson/date even when none exists.

## 6. Day finalization

```mermaid
flowchart TD
    Q{Is the date before today IST?} -- yes --> F[✅ Finalized automatically<br/>no row needed]
    Q -- no --> R{DispatchDayFinalization row for today?}
    R -- yes --> F2[✅ Finalized]
    R -- no --> O[🟡 Open]
    O -->|dispatcher: POST /dispatches/finalize-day| F2
    F2 -->|admin: DELETE /dispatches/finalize-day| O
```

After finalization dispatchers can no longer lock/unlock; admins still can. Events: `DISPATCH_DAY_FINALIZED`,
`DISPATCH_DAY_UNFINALIZED`. Code: `services/dispatchDayFinalization.js`, `controllers/dispatches/dayFinalization.js`.

## 7. Payments, collections & top-ups

```mermaid
flowchart LR
    subgraph Dairy["🏭 Dairy payments"]
        DP[POST /dairy-payments] --> DR[recalculateDairyBalance]
        DT[POST /dairy-payments/bulk-topup<br/>superadmin] --> DR
        DD[POST /dairy-deposit-topups/bulk<br/>superadmin] --> DREP[Deposit report]
    end
    subgraph Sales["🛵 Collections"]
        SP[POST /salesperson-payments] --> SR[recalculateSalespersonBalance]
        ST[POST /salesperson-payments/bulk-topup] --> SR
        RS[POST /salespeople/reset-ledger<br/>superadmin] --> WIPE[🧨 wipe dispatches,<br/>collections, balances]
    end
```

| Kind | `isTopUp` | Ledger effect | Typical use |
|---|---|---|---|
| Payment / collection | `false` | ➖ subtracts | Real money moved today |
| Top-up | `true` | ➕ adds | Dues that existed before the app (opening balance) |

Changing a payment's **date** recalculates both the old and the new date (`paymentLedger.cascadeAroundDateChange`).

## 8. Bills

**Actor:** admin · **Screen:** Reports → Salespeople → Bills tab · **Print:** `/print/bill?id=`

```mermaid
sequenceDiagram
    autonumber
    actor A as 🧑‍💼 Admin
    participant UI as SalespersonStatement (Bills tab)
    participant API as /bills
    participant DB as PostgreSQL
    A->>UI: choose salesperson + period
    UI->>API: GET /bills/preview?salespersonId&from&to
    API->>DB: dispatches in period → brand → product lines
    API-->>UI: preview (not saved)
    A->>UI: Generate (optional M/s name, PO no.)
    UI->>API: POST /bills
    API->>DB: Serializable tx: next billNumber<br/>(last + 1, or bill_number_start)
    API->>DB: insert Bill with frozen lines JSON
    API-->>UI: 201 bill
    UI->>UI: window.open /print/bill?id → jsPDF
```

| Rule | Detail |
|---|---|
| Nothing dispatched | 400 — nothing to bill |
| Frozen | Reprints show exactly what was issued, even if dispatches are later edited |
| Party | `partyName` defaults to the salesperson's name |
| Cancel | `DELETE /bills/:id` (`BILL_DELETED`) |
| Lines | Brand → individual products, ordered by the canonical layout (`utils/billFormat.js`) |

## 9. Protected actions (PIN)

```mermaid
flowchart LR
    U[🧑‍💼 Admin action needing PIN] --> M[PinModal]
    M -->|POST /pin/verify| V{bcrypt match<br/>AppSettings.edit_pin}
    V -- yes --> OK[✅ action proceeds]
    V -- no --> NO[❌ 400 Incorrect PIN<br/>💬 PIN_FAILED]
    PL[📈 Profit & loss report] -->|if pl_pin_enabled| M2[PinModal → /pin/verify-pl]
```

PINs are rotated by the superadmin (`PUT /pin/update`, `/pin/update-pl`); the P&L gate is toggled with
`PUT /pin/settings`. Verification is limited to 20 attempts per 15 minutes.

## 10. Reporting

| Report | Screen | API | Audience |
|---|---|---|---|
| Dairy statement | `/reports/dairy` (+ print) | `GET /reports/dairy-statement` | admin |
| Salesperson statement + bills | `/reports/salespeople` (+ print) | `GET /reports/salesperson-statement` | admin |
| Own statement | `/salesman/my-statement` (+ print) | `GET /salesperson-statement/me` | salesman |
| Stock summary | `/reports/stock` (+ print) | `GET /reports/stock-summary` | admin |
| Stock balance | `/reports/stock-balance` | `GET /stock-receipts/availability` | admin, dispatcher |
| Daily dispatch sheet | `/salesman/dispatch-sheet` | `GET /reports/daily-dispatch` | admin, dispatcher |
| Salesman day balance | `/salesman/day-balance` | `GET /salesperson-balance…` | admin |
| Deposit | `/reports/deposit` (+ print) | `GET /reports/deposit-summary` | admin |
| Outstanding | `/salesperson-outstanding` | `GET /reports/outstanding` | admin |
| Profit & loss | `/salesman/profit-loss` | `GET /reports/profit-loss` (P&L PIN) | admin |

Every report that lists products uses the canonical display order (brand → category → product → name).
