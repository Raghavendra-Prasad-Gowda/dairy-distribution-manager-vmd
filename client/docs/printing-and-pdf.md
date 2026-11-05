# 🖨️ Printing & PDF

[⬅️ Client README](../README.md)

---

## 1. 🧭 Print route pattern

```mermaid
sequenceDiagram
    autonumber
    actor A as Admin
    participant R as Report page
    participant W as New tab /print/...
    participant API as API
    A->>R: click Print
    R->>W: window.open('/print/x?from=…&to=…', '_blank')
    W->>API: GET report (same token from localStorage)
    API-->>W: data
    W->>W: render print layout (no Layout shell)
    W->>W: window.print() (auto or button)
```

| Print page | Opened from | Params |
|---|---|---|
| `/print/stock-summary` | Stock summary | `from, to, brandId?, routeId?` |
| `/print/deposit` | Deposit report | `brandId, from, to` |
| `/print/dairy-statement` | Dairy statement | `brandId, from, to` |
| `/print/salesperson-statement` | Salesperson statement | `salespersonId, from, to, type` |
| `/print/bill` | Bills tab | `id` |
| `/print/salesman-my-statement` | My statement | `from, to, type` (`balance` or `dispatch`) |

Controls carry `.no-print`; pages are laid out for A4 portrait.

## 2. 🧾 Bill PDF (`utils/billPdf.js`)

```mermaid
flowchart TD
    B[bill JSON from GET /bills/:id] --> D[buildBillDoc with jsPDF<br/>vector text + tables, A4]
    D --> R[renderBillPdf → Blob]
    R --> S{navigator.canShare files?}
    S -- yes --> SH[📤 native share sheet<br/>bill-NUMBER.pdf + caption]
    S -- no --> DL[⬇️ download PDF]
    DL --> WA[open wa.me with caption<br/>notify: attach the PDF]
```

| Helper | Purpose |
|---|---|
| `renderBillPdf(bill)` | Build the PDF blob |
| `shareBillPdf({ bill, pdfPromise, notify })` | Share or download + WhatsApp fallback; pre-render with `pdfPromise` so iOS keeps the user-gesture permission |
| `utils/billDisplay.js` | `DAIRY` header details, `formatAmount`, `formatRate`, `formatQty` |
| `utils/numberToWords.js` | Amount in words (Indian numbering) |
| `components/BillSheet.jsx` | On-screen bill with the same layout |

Bills are frozen on the server, so a reprint always matches the original.
