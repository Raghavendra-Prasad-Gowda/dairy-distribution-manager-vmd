# 📖 12 · Glossary

[⬅️ Architecture decisions](11-architecture-decisions.md) · [Docs index](README.md)

---

## 🥛 Business terms

| Term | Meaning |
|---|---|
| **Brand** | A dairy supplier (Nandini, Jersey, Gowardhan). Each has its own ledger |
| **Category** | Product group within a brand (Milk, Curd, Ghee …); drives display order and deposit eligibility |
| **Route** | A numbered Nandini delivery route; stock receipts can be split per route |
| **Stock receipt** | Quantity of a product delivered by the dairy on a day |
| **Dispatch / stock entry** | Stock handed to one salesperson for one day |
| **Dispatch sheet** | The daily grid of every salesperson's entries (dispatcher's main screen) |
| **Collection** | Cash received from a salesperson |
| **Top-up** | A pre-existing due loaded into the app; **adds** to the balance |
| **Deposit** | Per-litre charge on crate products, added to the dairy ledger |
| **Deposit top-up** | Opening crate-deposit balance for a brand |
| **Opening / closing balance** | Amount owed at the start / end of a day |
| **Cascade** | Recalculating every later day after a change |
| **Bill** | Numbered cash/credit bill for a salesperson and period (the printed pad) |
| **M/s (party name)** | The name printed on a bill; defaults to the salesperson |
| **Outstanding** | What each salesperson currently owes |
| **P&L** | Profit & loss: selling price to salespeople vs cost from the dairy |
| **Finalization** | Closing the day for dispatcher changes |
| **Exception** | Per-salesperson override that enables/disables a product |
| **Layout order** | Brand → category → product display order used everywhere |

## 🛠️ Technical terms

| Term | Meaning |
|---|---|
| **IST** | India Standard Time (UTC+05:30) — the business clock |
| **JWT** | Signed session token, 2-hour lifetime |
| **mfaToken** | Short-lived (5 min) token between password and MFA steps |
| **TOTP** | Time-based one-time password from an authenticator app |
| **Edit PIN / P&L PIN** | Shared secrets that confirm sensitive actions / open P&L |
| **AppError** | Operational error class with an HTTP status |
| **asyncHandler** | Wrapper that forwards async errors to the global handler |
| **Serializable** | Strictest PostgreSQL isolation level, used for ledger writes |
| **Cold start** | Render waking a sleeping instance (30–60 s) |
| **Staging Verified** | Commit status set when API + UI automation pass on testing |
| **Release PR** | The `develop → main` PR opened by the staging pipeline |
| **`@smoke`** | Read-only API scenarios safe to run against production |
| **`@known-defect`** | Scenario describing correct behaviour the API lacks today |
| **`@shared-state`** | Scenario that changes state other users share (run on demand) |
| **E2E-…** | Prefix for every record created by automation |
| **Page object** | Class that owns a screen's selectors in the UI suite |
| **ADR** | Architecture Decision Record ([11](11-architecture-decisions.md)) |
