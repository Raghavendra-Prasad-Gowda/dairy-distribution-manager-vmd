# CLAUDE.md — Vikas Milk Dairy Distribution Manager

> Engineering contract for this codebase. All changes MUST comply with every section.

---

## 1. System Overview

**Dairy Distribution Manager (VMD)** is a production business management system for Vikas Milk Dairy. It tracks:
- Multi-brand stock receipt (Nandini, Jersey, Gowardhan) with per-route entry for Nandini
- Cascading daily balance ledger per brand (opening + stock + deposits + topUp − payments = closing)
- Salesperson dispatch and collection tracking with cascading balance ledger
- Financial reports, outstanding balances, profit & loss (behind a separate P&L PIN) and printed cash/credit bills
- Admin accounts with optional/required TOTP MFA and automatic lock-out

**Live deployment:**
- Frontend → Vercel (React 19 + Vite)
- Backend → Render (Node.js/Express 5)
- Database → Aiven (PostgreSQL via Prisma)

---

## 2. Repository Structure

Each tier owns its own tests: the API automation suite lives inside `server/`, the UI automation suite inside
`client/`. Every folder with its own rules has its own `CLAUDE.md` — read the one closest to the file you change.

```
dairy-distribution-manager-vmd/
├── CLAUDE.md                          # This file — root engineering contract
├── README.md
├── docker-compose.yml                 # Local dev Postgres
├── docs/
│   ├── release-pipeline.md            # Release flow + one-time setup checklist
│   └── openapi.yaml                   # API spec — linted by pr-checks (redocly)
├── .github/
│   ├── workflows/
│   │   ├── pr-checks.yml              # CI on every PR to develop/main
│   │   ├── auto-merge-develop.yml     # Merges a green PR into develop (opt out: `no-auto-merge` label)
│   │   ├── staging-pipeline.yml       # After merge to develop: wait deploy → API → UI → release PR
│   │   └── production-verify.yml      # After merge to main: wait deploy → smoke → tag + release
│   ├── scripts/                       # wait-for-backend.sh, wait-for-vercel.sh, Slack result cards, UI summary
│   └── dependabot.yml
│
├── server/                            # Express 5 backend (Render root directory)
│   ├── CLAUDE.md                      # Backend engineering sub-contract
│   ├── app.js                         # Middleware stack, route registration, error handler
│   ├── index.js                       # Entry point: listen → migrate → seed → ready
│   ├── controllers/                   # Business logic (one file per resource)
│   │   ├── *.controller.js            # auth, adminUsers, brands, categories, products, routes, pin, bills,
│   │   │                              # stockReceipts, dairyBalance, dairyPayments, dairyDepositTopUps,
│   │   │                              # salespeople, salespersonPrices, salespersonProducts,
│   │   │                              # salespersonBalance, salespersonPayments, salespersonStatement,
│   │   │                              # dispatches, reports
│   │   ├── dispatches/                # read, write, lockLifecycle, dayFinalization, _shared
│   │   └── reports/                   # dailyDispatch, dairyStatement, salespersonStatement, stockSummary,
│   │                                  # depositSummary, outstanding, profitLoss, _shared
│   ├── routes/                        # Thin route definitions only (clientErrors.js is the one inline handler)
│   ├── middleware/
│   │   ├── auth.js                    # JWT: authenticate, requireAdmin, requireSuperAdmin, requireAdminOrDispatcher
│   │   └── asyncHandler.js            # Async error propagation
│   ├── services/
│   │   ├── balanceService.js          # Cascading balance recalculation (serializable tx)
│   │   ├── paymentLedger.js           # Shared dairy/salesperson payment cascade + bulk validation
│   │   ├── depositRules.js            # qualifiesForDeposit, calculateLineDeposit
│   │   ├── stockGuard.js              # Dispatch stock availability check
│   │   ├── dispatchDayFinalization.js # isDayFinalizedForDispatcher (past days auto-finalized)
│   │   ├── mfaService.js              # TOTP enrolment/verification, backup codes
│   │   └── accountLockService.js      # Wrong-password / wrong-MFA lock-out
│   ├── utils/
│   │   ├── validate.js                # All Zod schemas + validate() + parseId()
│   │   ├── AppError.js                # Operational error class
│   │   ├── authz.js                   # assertRole / assertAdmin — in-controller defence in depth
│   │   ├── actor.js                   # Acting admin's username for Slack/audit
│   │   ├── slack.js                   # notifySlack, SLACK_EVENTS, buildCard, escapeSlack
│   │   ├── dateUtils.js               # getIndiaDateStr, getIndiaTomorrowStr (IST helpers)
│   │   ├── productLayout.js           # Canonical product sort (catOrder map, `::` key) — use it
│   │   ├── billFormat.js              # Bill Brand → Product aggregation + rate derivation
│   │   ├── pagination.js              # Opt-in ?page/&limit envelope
│   │   ├── mfaCrypto.js               # AES-256-GCM for TOTP secrets (key derived from JWT_SECRET)
│   │   ├── dbUrl.js                   # DATABASE_URL + CA-cert TLS handling
│   │   ├── version.js                 # Build identity for /health and Slack
│   │   └── constants.js               # JWT_EXPIRES_IN, BCRYPT_ROUNDS, MFA + lock-out constants
│   ├── config/
│   │   ├── env.js                     # Zod-validated env — the ONLY place process.env secrets are read
│   │   └── logger.js                  # Winston — use instead of console.log
│   ├── lib/prisma.js                  # Singleton Prisma client — ALWAYS import this
│   ├── prisma/
│   │   ├── schema.prisma              # Single source of truth for all DB models
│   │   ├── migrations/                # Never edit migration files manually
│   │   └── seed.js                    # Superadmin (from env) + edit PIN / P&L PIN settings only
│   ├── scripts/                       # check-timezone-safety.js (CI lint), write-version.js (build)
│   ├── tests/                         # Mocked-Prisma Playwright specs (run on every PR)
│   │   ├── helpers/                   # test-setup, create-mock-prisma, mock-cascade, ...
│   │   └── playwright/*.spec.js
│   └── automation/                    # Java 21: Cucumber + REST Assured API suite vs deployed env
│       ├── CLAUDE.md                  # API automation sub-contract
│       ├── README.md / COVERAGE.md    # How to run / mocked-spec → API-scenario map
│       ├── pom.xml
│       └── src/test/                  # features/api/*.feature + com.vmd.automation step code
│
└── client/                            # React 19 + Vite frontend (Vercel root directory)
    ├── CLAUDE.md                      # Frontend engineering sub-contract
    ├── src/
    │   ├── App.jsx                    # Route tree, lazy loading, ProtectedRoute, ErrorBoundary
    │   ├── api/axios.js               # Shared Axios instance — ALWAYS use this
    │   ├── api/coldStart.js           # Detects a sleeping Render backend → ColdStartScreen
    │   ├── context/                   # AuthContext (2h session, useAuth), NotificationContext (notify)
    │   ├── hooks/                     # useApiResource(s), useMutation, useDisclosure, useDebouncedValue, ...
    │   ├── components/                # Layout, ErrorBoundary, BrandTabs, Pagination, PinModal, BillSheet,
    │   │   │                          # BalanceLedger, PaymentForm, BulkTopUpModal, VersionTag, ...
    │   │   └── ui/                    # BrandedLoader (+ TumblerSpinner), Modal, Button, Alert, EmptyState
    │   ├── pages/
    │   │   ├── Dashboard.jsx, Login.jsx, SalespersonOutstanding.jsx
    │   │   ├── daily/StockReceipt.jsx
    │   │   ├── payments/              # DairyPayments, SalespersonCollections
    │   │   ├── reports/               # Statements, summaries, dispatch sheet, day balance, P&L,
    │   │   │                          # deposit, BillPrint and the *Print.jsx print/PDF variants
    │   │   ├── setup/                 # Products, Categories, Brands, Routes, Layout, DairySettings,
    │   │   │   │                      # SalesmanUsers, SalesmanPrices, AdminUsers (superadmin)
    │   │   │   └── salesmanPrices/    # Modals/tables used by SalesmanPricesSetup (incl. ExceptionManagerModal)
    │   │   ├── salesman/              # StockEntry, SalespersonBalance, MyStatement(+Print), ChangePassword
    │   │   └── dairy/PriceSetup.jsx   # Dairy rate master — tested but NOT routed in App.jsx yet
    │   └── utils/                     # dateUtils (IST — ALWAYS), session, productLayout, billPdf,
    │                                  # billDisplay, numberToWords, appVersion, constants
    └── automation-ui/                 # TypeScript: Playwright Test UI suite vs deployed env
        ├── CLAUDE.md                  # UI automation sub-contract
        ├── README.md
        ├── playwright.config.ts       # setup → signed-in / signed-out projects; iPad + phone screens
        ├── src/                       # env.ts, fixtures.ts, pages/ (page objects)
        └── tests/                     # *.spec.ts (+ tests/salesman/ for phone specs)
```

**The two automation suites are not part of the app.** They are separate projects (Maven / their own
`package.json`) that happen to live under the tier they test. They are excluded from the app's lint, tests,
coverage and build: `server/eslint.config.js` and `server/.prettierignore` ignore `automation/`;
`client/eslint.config.js`, the Vitest `exclude` in `client/vite.config.js` and `client/.vercelignore` ignore
`automation-ui/`. Keep it that way when touching those configs.

**Deploy side effect:** Render deploys from `server/` and Vercel from `client/`, so a change that only touches
`server/automation/` or `client/automation-ui/` now also triggers a (no-op) redeploy of that tier.
`.github/scripts/wait-for-backend.sh` counts any file under `server/` as a backend change and waits for that
deploy, which keeps the API suite running against the build that actually contains the change. If you ever add a
Render build filter that ignores `server/automation/**`, also exclude that path in `wait-for-backend.sh`, or the
pipeline will wait for a deploy that never comes.

---

## 3. Roles & Access

| Role | Access |
|------|--------|
| `superadmin` | Everything — including Admin Users setup, brand creation, PIN changes, P&L PIN toggle, bulk dairy/deposit top-ups, salesperson ledger reset, MFA policy and account unlock |
| `admin` | Full access except the superadmin-only items above |
| `dispatcher` | Dispatch sheet + Stock Balance report + change password |
| `salesman` | Stock entry (own), own balance/statement, change password |

Admins, superadmins and dispatchers are `AdminUser` rows; salesmen are `Salesperson` rows with a username.
Both sign in through `POST /auth/login`.

**Route guards in `App.jsx`:**
- `ProtectedRoute` — authenticated only
- `ProtectedRoute adminOnly` — admin + superadmin only
- `ProtectedRoute superAdminOnly` — superadmin only
- Dispatcher and salesman are conditionally routed to their own route trees

**API guards in `app.js` / route files:**
- All `/api/v1/*` requires `authenticate` (JWT in the `Authorization: Bearer` header — the cookie is not honoured), except `/auth/*` sign-in steps and the public `POST /errors/client` beacon
- Most admin routes: `requireAdmin` at mount; superadmin-only endpoints: `requireSuperAdmin`; dispatcher reads: `requireAdminOrDispatcher`
- Controllers re-check with `assertRole` / `assertAdmin` (`utils/authz.js`) as defence in depth
- Rate limits: global 5000 / 15 min on `/api`; login 20 / hour / IP (`LOGIN_RATE_LIMIT_MAX`); `bulkWriteLimiter` 30 / min on `/stock-receipts`, salesperson products and price bulk routes; PIN verify 20 / 15 min; MFA steps have their own limiters; client-error beacon 30 / hour (always answers 200)

**MFA and lock-out (AdminUser only):**
- TOTP MFA with 8 bcrypt-hashed backup codes (`services/mfaService.js`). The TOTP secret is AES-256-GCM encrypted with a key derived from `JWT_SECRET` (`utils/mfaCrypto.js`) — **rotating `JWT_SECRET` invalidates every enrolled authenticator**.
- A password login for an MFA account returns a 5-minute `mfaToken`; `POST /auth/mfa/verify` exchanges it (plus a code) for the session.
- A superadmin can set `mfaRequired` on an admin/superadmin (never a dispatcher); such accounts are forced through `/auth/mfa/setup-required` → `/auth/mfa/confirm-required` before a session is issued.
- 5 wrong passwords or 5 wrong MFA codes lock the account (`accountLockService.js`); the lock auto-expires after 30 minutes, or a superadmin unlocks it with `PUT /admin-users/:id/unlock`.

---

## 4. Database Models (Prisma Schema)

### Key models summary

| Model | Purpose | Key constraints |
|-------|---------|----------------|
| `Brand` | Dairy brand (Nandini, Jersey, Gowardhan) | unique `name`, `displayOrder`, `isActive`, `isArchived` (brands are archived, never deleted) |
| `Category` | Product grouping within a brand | unique `(brandId, name)`, `displayOrder` |
| `Product` | Sellable item | unique `(brandId, name)`, `category` is String (not a relation), `displayOrder` |
| `ProductCostPrice` | Effective-dated cost price history | unique `(productId, effectiveFrom)` |
| `ProductSellingPrice` | Effective-dated default selling price history | unique `(productId, effectiveFrom)` |
| `Route` | Nandini delivery route | unique `(brandId, routeNumber)`, routeId=0 = no route |
| `StockReceipt` | Daily stock received from dairy | unique `(productId, receiptDate, routeId)` |
| `DairyBalance` | Cascading ledger per brand per date | unique `(brandId, balanceDate)` |
| `DairyPayment` | Payment to dairy (`isTopUp=true` = pre-existing debt load) | |
| `DairyDepositTopUp` | Crate/container deposit ledger (separate from stock) | |
| `Salesperson` | Delivery agent | unique `username`, `passwordHash`, `displayOrder` |
| `SalespersonPrice` | Per-salesman selling price (effective-date-aware) | unique `(salespersonId, productId, effectiveFrom)` |
| `SalespersonProduct` | Per-salesman product exception (`isEnabled`) | unique `(salespersonId, productId)` |
| `StockDispatch` | Daily dispatch to salesman (`isSubmitted`, `isAdminUnlocked`) | unique `(salespersonId, dispatchDate)`, index `dispatchDate` |
| `StockDispatchItem` | Line items in a dispatch | |
| `SalespersonBalance` | Cascading ledger per salesman per date | unique `(salespersonId, balanceDate)` |
| `SalespersonPayment` | Collection from salesman (`isTopUp=true` = pre-existing debt) | |
| `AdminUser` | Admin/superadmin/dispatcher login, MFA + lock-out fields | unique `username`; roles: admin/superadmin/dispatcher |
| `DispatchDayFinalization` | Explicit finalization of a dispatch day | unique `(date)` |
| `AppSettings` | Key/value app config: `edit_pin`, `pl_pin` (bcrypt hashes), `pl_pin_enabled` | `key` is the id |
| `Bill` | Cash/credit bill issued to a salesperson | unique `billNumber`; `lines` is a frozen JSON snapshot — an array of brands, each with the individual products actually dispatched (not a generalized bucket, and not further split by category) |

There is no client-error table: crash reports from `POST /errors/client` go to Slack only.

### Critical: `category` is a String on `Product`

`product.category` is a plain `String?` column — **not** a foreign key relation. Prisma cannot `ORDER BY category.displayOrder` in a single query. Sorting by category display order always requires a separate `category.findMany` and a JS sort. See Section 9 for the canonical pattern.

### Key field notes

- `Product.salespersonEnabled` — global on/off for all salespeople (default `true`)
- `Product.showInStockReceipt` — show in stock receipt entry screen
- `Product.depositEnabled` — per-product deposit flag
- `Category.depositEnabled` — per-category deposit flag
- `Brand.depositEnabled`, `Brand.depositPerLitre`, `Brand.depositCalcMethod` — deposit config
- `DairyPayment.isTopUp` — `true` = pre-existing debt added to balance, `false` = real payment subtracted
- `SalespersonPayment.isTopUp` — same semantics for salesman side
- `DispatchDayFinalization` — past dates are auto-finalized; today requires an explicit row
- `AdminUser.mfaSecret` / `mfaEnabled` / `mfaBackupCodes` / `mfaRequired`, `failedPasswordAttempts` / `failedMfaAttempts` / `lockedAt` / `lockedReason` — see Section 3
- PINs live in `AppSettings`, not env: `EDIT_PIN` only seeds `edit_pin` and `pl_pin` on the first boot; change them in the superadmin UI afterwards

---

## 5. Balance Calculation — Critical Concept

### Dairy balance formula
```
closingBalance = openingBalance + stockValue + depositValue + topUpAmount − amountPaid
```

### Salesperson balance formula
```
closingBalance = openingBalance + stockGiven + topUpAmount − amountPaid
```

**Top-ups ADD** (they are pre-existing dues loaded into the app, not payments).
**Payments SUBTRACT.**

### Rules
- Any stock receipt save, dairy payment create/update/delete → call `recalculateDairyBalance(brandId, date)`
- Any dispatch create/update/delete, salesman payment create/update/delete → call `recalculateSalespersonBalance(salespersonId, date)`
- These cascade forward through ALL subsequent dates in a **serializable transaction**
- Never write balance records directly — always go through `balanceService.js`
- When rolling into your own `$transaction`, pass `tx` to the balance function so it joins the outer transaction

```js
// Correct — standalone balance recalc
await recalculateDairyBalance(brandId, date);

// Correct — inside your own transaction
await prisma.$transaction(async (tx) => {
  await tx.stockReceipt.upsertMany(...);
  await recalculateDairyBalance(brandId, date, tx); // tx passed!
}, { isolationLevel: 'Serializable' });
```

---

## 6. Route Map

### Backend API (all under `/api/v1` unless noted)

"JWT" means any signed-in role; the controller then scopes or refuses by role (e.g. a salesman only sees their own rows).

| Route | Auth | Controller |
|-------|------|-----------|
| `GET /health`, `GET /health/ready` (no `/api/v1`) | public | `app.js` (liveness + build identity / DB readiness) |
| `POST /auth/login` | public (20/h) | auth |
| `POST /auth/mfa/verify` | public, `mfaToken` | auth |
| `POST /auth/mfa/setup-required`, `POST /auth/mfa/confirm-required` | public, `mfaToken` | auth |
| `POST /auth/logout` | JWT | auth |
| `POST /auth/change-password` | JWT | auth |
| `POST /errors/client` | public (30/h) | `routes/clientErrors.js` (Slack only) |
| `GET /brands` | admin | brands |
| `POST /brands` | superadmin | brands |
| `PUT /brands/:id`, `PATCH /brands/reorder`, `POST /brands/:id/copy-products` | admin | brands |
| `GET /categories`, `POST /categories`, `PUT /categories/:id`, `DELETE /categories/:id`, `PATCH /categories/reorder` | admin | categories |
| `GET /products`, `POST /products`, `PUT /products/:id`, `DELETE /products/:id`, `PATCH /products/reorder` | admin | products |
| `GET /products/salesperson-global`, `PATCH /products/salesperson-global` | admin | products |
| `DELETE /products/:id/salesperson-prices` | admin | products |
| `GET /routes`, `POST /routes`, `PUT /routes/:id`, `DELETE /routes/:id` | admin | routes |
| `GET /stock-receipts` | admin | stockReceipts |
| `GET /stock-receipts/availability` | admin or dispatcher | stockReceipts |
| `POST /stock-receipts/bulk` | admin + bulkLimiter | stockReceipts |
| `GET /dairy-balance`, `GET /dairy-balance/route-breakdown`, `GET /dairy-balance/:brandId` | admin | dairyBalance |
| `GET /dairy-payments`, `POST /dairy-payments`, `PUT /dairy-payments/:id`, `DELETE /dairy-payments/:id` | admin | dairyPayments |
| `POST /dairy-payments/bulk-topup` | superadmin | dairyPayments |
| `POST /dairy-deposit-topups/bulk`, `DELETE /dairy-deposit-topups/:id` | superadmin | dairyDepositTopUps |
| `GET /salespeople`, `GET /salespeople/:id`, `POST /salespeople`, `PUT /salespeople/:id`, `DELETE /salespeople/:id`, `PUT /salespeople/reorder` | admin | salespeople |
| `POST /salespeople/reset-ledger` | superadmin | salespeople |
| `GET /salespeople/:id/prices` | JWT | salespersonPrices |
| `POST /salespeople/:id/prices/bulk`, `POST /salespeople/:id/prices/copy-from/:sourceId`, `POST /salespeople/bulk-update` | admin + bulkLimiter | salespersonPrices |
| `GET /salespeople/:id/products` | admin | salespersonProducts |
| `POST /salespeople/:id/products/bulk`, `POST /salespeople/products/bulk-update` | admin + bulkLimiter | salespersonProducts |
| `GET /dispatches` | admin or salesman (own) | dispatches |
| `GET /dispatches/summary` | admin | dispatches |
| `POST /dispatches` (empty `items` = delete draft), `DELETE /dispatches/:id` | admin or salesman (own, unlocked) | dispatches |
| `POST /dispatches/open-for-entry` | admin | dispatches |
| `PATCH /dispatches/:id/submit` | admin or salesman (own) | dispatches |
| `PATCH /dispatches/:id/lock`, `PATCH /dispatches/:id/unlock` | admin, or dispatcher until the day is finalized (Section 15) | dispatches |
| `POST /dispatches/finalize-day` | dispatcher | dispatches |
| `DELETE /dispatches/finalize-day` | admin | dispatches |
| `GET /salesperson-balance`, `GET /salesperson-balance/:id`, `GET /salesperson-balance/:id/history` | JWT | salespersonBalance |
| `GET /salesperson-payments` | JWT | salespersonPayments |
| `POST /salesperson-payments`, `PUT /salesperson-payments/:id`, `DELETE /salesperson-payments/:id`, `POST /salesperson-payments/bulk-topup` | admin | salespersonPayments |
| `GET /salesperson-statement/me` | JWT (salesman) | salespersonStatement |
| `GET /reports/dairy-statement`, `/salesperson-statement`, `/stock-summary`, `/outstanding`, `/deposit-summary`, `/profit-loss` | admin | reports |
| `GET /reports/daily-dispatch` | admin or dispatcher | reports |
| `GET /bills`, `GET /bills/preview`, `GET /bills/:id`, `POST /bills`, `DELETE /bills/:id` | admin | bills |
| `POST /pin/verify`, `POST /pin/verify-pl` | admin (20 / 15 min) | pin |
| `GET /pin/settings` | admin | pin |
| `PUT /pin/update`, `PUT /pin/update-pl`, `PUT /pin/settings` | superadmin | pin |
| `GET /admin-users`, `POST /admin-users`, `PUT /admin-users/:id`, `DELETE /admin-users/:id` | superadmin | adminUsers |
| `PUT /admin-users/:id/mfa-required`, `PUT /admin-users/:id/unlock` | superadmin | adminUsers |
| `GET /admin-users/mfa/status`, `POST /admin-users/mfa/setup`, `/mfa/confirm`, `/mfa/disable` | superadmin (own account) | adminUsers |

`docs/openapi.yaml` describes the same API and is linted on every PR — update it when you add or change an endpoint.

### Frontend routes (from `App.jsx`)

**Admin/superadmin:**
- `/` → Dashboard
- `/dairy/stock/:brandName` → StockReceipt
- `/dairy/payments` → DairyPayments
- `/dairy/setup` → DairySettings
- `/dairy/setup/categories` → CategorySetup
- `/dairy/setup/products` → ProductsSetup
- `/dairy/setup/layout` → LayoutSettings
- `/dairy/setup/routes` → RouteSetup
- `/dairy/setup/brands` → BrandsSetup
- `/salesman/payments` → SalespersonCollections
- `/salesman/setup/users` → SalesmanUsersSetup
- `/salesman/setup/prices` → SalesmanPricesSetup
- `/dairy/reports` → DairyReports
- `/reports/dairy` → DairyStatement
- `/reports/salespeople` → SalespersonStatement (includes a "Bills" tab — generate/reprint/delete the printed
  cash/credit bill for the sidebar-selected salesperson over the page's own date range, plus their bill history)
- `/salesman/dispatch-sheet` → DailyDispatchSummary
- `/salesman/day-balance` → SalesmanDayBalance
- `/salesman/profit-loss` → SalesmanProfitLoss
- `/reports/stock` → StockSummary
- `/reports/stock-balance` → StockBalanceSummary
- `/reports/deposit` → DepositReport
- `/salesperson-outstanding` → SalespersonOutstanding
- `/admin/users` → AdminUsersSetup (superadmin only)

**Dispatcher:**
- `/salesman/dispatch-sheet` → DailyDispatchSummary
- `/reports/stock-balance` → StockBalanceSummary
- `/dispatcher/change-password` → ChangePassword

**Salesman:**
- `/` → StockEntry
- `/salesman/stock-entry` → StockEntry
- `/salesman/balance` → SalespersonBalance
- `/salesman/my-statement` → MyStatement
- `/salesman/change-password` → ChangePassword

**Print routes (no Layout shell):**
- `/print/stock-summary`, `/print/deposit`, `/print/dairy-statement`, `/print/salesperson-statement`, `/print/bill` (admin only)
- `/print/salesman-my-statement` (any authenticated)

---

## 7. Engineering Principles

### Required patterns

**Controller pattern (backend)**
```js
// controllers/products.controller.js
const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');

const getAll = asyncHandler(async (req, res) => {
  const products = await prisma.product.findMany({ where: { isActive: true } });
  res.json({ success: true, data: products });
});

const create = asyncHandler(async (req, res) => {
  const data = validate(schemas.createProduct, req, res);
  if (!data) return;                              // ← always return after failed validate
  const product = await prisma.product.create({ data });
  void notifySlack(SLACK_EVENTS.PRODUCT_CREATED, { name: product.name }); // fire-and-forget
  res.status(201).json({ success: true, data: product });
});

module.exports = { getAll, create };
```

**Route pattern (backend — thin, no logic)**
```js
// routes/products.js
const router = require('express').Router();
const controller = require('../controllers/products.controller');
router.get('/',    controller.getAll);
router.post('/',   controller.create);
router.put('/:id', controller.update);
module.exports = router;
```

**Date handling (frontend)**
```js
// ✅ CORRECT
import { getIndiaDate, formatDateDisplay, formatCurrency } from '../utils/dateUtils';
const today = getIndiaDate(); // "2026-04-30" in IST

// ❌ WRONG
const today = new Date().toISOString().slice(0, 10); // machine timezone
```

**API calls (frontend)**
```js
// ✅ CORRECT — uses auth interceptors
import api from '../api/axios';
const res = await api.get('/brands');

// ❌ WRONG — bypasses JWT
import axios from 'axios';
```

### Single Responsibility
- Routes define HTTP endpoints only — no business logic in route files
- Controllers handle one resource domain
- Services (`balanceService`, `stockGuard`) encapsulate domain logic shared across controllers

### Atomicity
Any operation touching more than one table MUST use `prisma.$transaction()`

### Fail Fast
Validate all inputs at the route boundary with `validate(schemas.xxx, req, res)`. If it returns null, `return` immediately.

### No Silent Failures
Never swallow errors with empty `catch` blocks. Let `asyncHandler` propagate them to the global error handler.

---

## 8. What NOT to Do

| Do NOT | Reason |
|--------|--------|
| Put business logic in route files | Routes are thin by design — belongs in controllers |
| `new PrismaClient()` anywhere | Leaks DB connections; use `lib/prisma.js` singleton |
| `new Date()` in frontend | Returns machine timezone; use `dateUtils.js` |
| Create new axios instances | Bypasses JWT interceptors; use `src/api/axios.js` |
| Try/catch in controllers | Bypasses global error handler; use `asyncHandler` |
| Throw `new Error()` in controllers | Bypasses `isOperational` check; use `AppError` |
| Edit migration files | Migrations are immutable; create a new one |
| Commit `.env` | Credentials must never be in version control |
| `console.log` in server code | Use Winston logger from `config/logger.js` |
| `prisma` inside a transaction block | Pass `tx` — the global client is outside the transaction |
| Bypass `balanceService` to write balance rows | Balance cascade is mandatory |
| Import pages eagerly in `App.jsx` | Defeats code splitting — use `lazy()` |
| Raw `fetch` in frontend | Use `src/api/axios.js` |

---

## 9. Product Display Order — Dairy Layout

**Canonical sort**: `brand.displayOrder → categoryDisplayOrder → product.displayOrder → product.name`

Because `product.category` is a plain string (not a relation), Prisma cannot sort by `category.displayOrder` in one query. Every place that renders a sorted product list MUST apply this pattern.

**On the server, use the shared helpers in `server/utils/productLayout.js`** (`buildCategoryOrderMap`, `getCategoryOrder`, `compareProductsByLayout`, key delimiter `::`) instead of re-writing the map + comparator; the client has the equivalent in `client/src/utils/productLayout.js`. The snippet below shows what they do:

**Backend — catOrder Map pattern**
```js
const [products, categories] = await Promise.all([
  prisma.product.findMany({
    where: { isActive: true },
    include: { brand: { select: { id: true, name: true, displayOrder: true } } },
    orderBy: [{ brand: { displayOrder: 'asc' } }, { displayOrder: 'asc' }, { name: 'asc' }],
  }),
  prisma.category.findMany({ select: { brandId: true, name: true, displayOrder: true } }),
]);

const catOrderMap = new Map(categories.map(c => [`${c.brandId}::${c.name}`, c.displayOrder]));

const sorted = [...products].sort((a, b) =>
  (a.brand?.displayOrder ?? 999) - (b.brand?.displayOrder ?? 999) ||
  (catOrderMap.get(`${a.brandId}::${a.category}`) ?? 999) -
    (catOrderMap.get(`${b.brandId}::${b.category}`) ?? 999) ||
  (a.displayOrder ?? 999) - (b.displayOrder ?? 999) ||
  a.name.localeCompare(b.name)
);
```

**Frontend — category group sort**
```js
const catOrderMap = new Map(categories.map(c => [c.name, c.displayOrder]));
const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
  const oa = catOrderMap.get(a) ?? 9999;
  const ob = catOrderMap.get(b) ?? 9999;
  return oa !== ob ? oa - ob : a.localeCompare(b);
});
```

**API responses that serve the Exception Manager** (SalesmanPricesSetup) must include `categoryDisplayOrder` so the client can sort. See `salespersonProducts.controller.js` for the reference implementation.

**Checklist — every place products are shown sorted:**
- `controllers/reports/` — `dailyDispatch`, `salespersonStatement`, `stockSummary`, `profitLoss`
- `salespersonProducts.controller.js` — `getProducts`; `salespersonPrices.controller.js`; `salespersonStatement.controller.js`
- `products.controller.js`, `bills.controller.js` (bill lines, via `utils/billFormat.js`)
- `ProductsSetup.jsx` — `filteredGrouped` useMemo
- Any new feature that renders a product list

---

## 10. Slack Notifications

Every **write action** must fire a Slack card. The call is fire-and-forget — never `await` it for the HTTP response.

```js
// ✅ Correct — non-blocking
void notifySlack(SLACK_EVENTS.PRODUCT_CREATED, {
  name: product.name,
  brandName: brand.name,
  costPrice: product.costPrice,
  sellingPrice: product.sellingPrice,
});

// ❌ Wrong — blocks response
await notifySlack(...);
```

### Full SLACK_EVENTS catalogue

**System:** `SERVER_STARTED`, `SERVER_SHUTDOWN`, `SERVER_BOOT_FAILED`, `SERVER_ERROR`, `PROCESS_CRASH`, `CLIENT_ERROR`

**Auth:** `LOGIN`, `LOGOUT`, `FAILED_LOGIN`, `PASSWORD_CHANGED`, `PIN_FAILED`

**PIN settings:** `PIN_UPDATED`, `PL_PIN_UPDATED`, `PIN_SETTINGS_UPDATED`

**MFA & lock-out:** `MFA_ENABLED`, `MFA_DISABLED`, `MFA_FAILED`, `MFA_REQUIRED_SET`, `MFA_REQUIRED_UNSET`, `ACCOUNT_LOCKED`, `ACCOUNT_UNLOCKED`

**Salesman self-service (info only):** `SALESPERSON_BALANCE_VIEWED`, `SALESPERSON_STATEMENT_VIEWED`

**Stock Receipts:** `STOCK_RECEIPT_SAVED`

**Dairy Payments:** `DAIRY_PAYMENT_RECORDED`, `DAIRY_PAYMENT_UPDATED`, `DAIRY_PAYMENT_DELETED`

**Dispatch:** `DISPATCH_SAVED`, `DISPATCH_DELETED`, `DISPATCH_SUBMITTED`, `DISPATCH_LOCK_CHANGED`, `DISPATCH_DAY_FINALIZED`, `DISPATCH_DAY_UNFINALIZED`

**Salesperson Payments:** `SALESPERSON_PAYMENT_RECORDED`, `SALESPERSON_PAYMENT_UPDATED`, `SALESPERSON_PAYMENT_DELETED`

**Bulk/Ledger:** `SALESPERSON_TOPUP_RECORDED`, `DAIRY_TOPUP_RECORDED`, `DAIRY_DEPOSIT_TOPUP_RECORDED`, `SALESPERSON_LEDGER_RESET`

**Setup — Salespeople:** `SALESPERSON_CREATED`, `SALESPERSON_UPDATED`

**Setup — Pricing:** `SALESPERSON_PRICES_UPDATED`, `SALESPERSON_PRICES_COPIED`, `SALESPERSON_PRICES_BULK_UPDATED`, `PRODUCT_PRICES_CLEARED`

**Setup — Products:** `PRODUCT_CREATED`, `PRODUCT_UPDATED`, `PRODUCT_DELETED`, `PRODUCT_GLOBAL_ACCESS_UPDATED`

**Setup — Categories:** `CATEGORY_CREATED`, `CATEGORY_UPDATED`, `CATEGORY_DELETED`

**Setup — Routes:** `ROUTE_CREATED`, `ROUTE_UPDATED`, `ROUTE_DELETED`

**Setup — Brands:** `BRAND_CREATED`, `BRAND_UPDATED`

**Bills:** `BILL_GENERATED`, `BILL_DELETED`

**Superadmin:** `ADMIN_USER_CREATED`, `ADMIN_USER_UPDATED`, `ADMIN_USER_DELETED`

EVENT_COLOR palette: `GREEN` (create), `AMBER` (update), `RED` (delete), plus `BLUE` and `TEAL` for informational cards.

Untrusted text in a card (the public client-error beacon, anything a user typed) must go through `escapeSlack`.

### Adding a new event
1. Add a key to `SLACK_EVENTS` in `server/utils/slack.js`
2. Add a color to `EVENT_COLOR` (GREEN=create, AMBER=update, RED=delete)
3. Add a `case` to `buildCard()` using the Block Kit helpers (`headerBlock`, `fieldsBlock`, `textBlock`, `dividerBlock`, `footerBlock`, `card`)
4. Fire with `void notifySlack(SLACK_EVENTS.YOUR_EVENT, { ...data })`

### Data enrichment
`notifySlack` auto-fetches `brandName` if you pass `brandId`, and `salespersonName` if you pass `salespersonId`. You don't need to look them up yourself when those IDs are available.

---

## 11. BrandedLoader — VMD Spinner

**Import:** `import BrandedLoader from '../../components/ui/BrandedLoader';`

**Use `BrandedLoader`** for any full-page, section, or overlay loading state.
**Use `TumblerSpinner`** (exported from `BrandedLoader.jsx`) for in-button and inline spinners — never use `Loader2` from lucide-react.

| Situation | Usage |
|-----------|-------|
| Page initial load (lazy route) | `<BrandedLoader />` (via `PageLoader` in `App.jsx`) |
| Full-page blocking wait | `<BrandedLoader overlay open={loading} label="Saving…" />` |
| Section/card loading | `<BrandedLoader size="sm" />` |
| Saving with dim backdrop | `<BrandedLoader overlay tone="transparent" open={saving} label="Saving…" />` |
| App brand screen (cold start) | `<BrandedLoader overlay tone="brand" lively />` |
| In-button / inline spinner | `<TumblerSpinner size={14} />` (named export from the same file) |

**`TumblerSpinner`** is a bare 🥛 emoji with `animate-bounce` sized to match the surrounding icon. Import it alongside `BrandedLoader`:
```js
import { TumblerSpinner } from '../../components/ui/BrandedLoader';
// usage:
{saving ? <TumblerSpinner size={14} /> : <Save size={14} />}
```

**Props reference:**

| Prop | Default | Description |
|------|---------|-------------|
| `overlay` | `false` | Fixed full-screen with backdrop |
| `open` | `true` | Controls visibility in overlay mode (noop when `!overlay`) |
| `label` | `"Loading…"` | Status text shown below the spinner |
| `hideBrand` | `false` | Hides the "Vikas Milk Dairy" title |
| `size` | `"md"` | `"sm"` / `"md"` / `"lg"` |
| `tone` | `"card"` | Overlay background: `"card"` (white card) / `"transparent"` (blur) / `"brand"` (emerald gradient) |
| `inlinePadY` | `"py-16"` | Padding in inline (non-overlay) mode |
| `lively` | `false` | Adds sonar ping ring — for cold-start screen only |

---

## 12. Testing

### Backend — Playwright API tests

**Location:** `server/tests/playwright/*.spec.js`

**Setup pattern (every spec file):**
```js
const { expect } = require('@playwright/test');
const { setupSuite, makeSalesmanToken } = require('../helpers/test-setup');
const { test, ctx, makeAuthToken, makeSuperAdminToken, makeDispatcherToken } = setupSuite();
```

**Mock Prisma — always reset between tests:**
- `setupSuite()` calls `ctx.mockPrisma.reset()` before each test automatically
- Within a `test.describe` block, if a new Prisma model is called by the handler being tested, add a `test.beforeEach` to mock it — otherwise it returns `undefined` and the handler crashes with "Cannot read properties of undefined"

```js
// ✅ Required if your handler calls category.findMany
test.beforeEach(() => {
  ctx.mockPrisma.category.findMany.mockResolvedValue([
    { brandId: 1, name: 'Milk', displayOrder: 1 },
    { brandId: 1, name: 'Curd', displayOrder: 2 },
  ]);
});
```

**Token helpers:**
- `makeAuthToken()` → admin JWT
- `makeSuperAdminToken()` → superadmin JWT
- `makeSalesmanToken(salespersonId)` → salesman JWT
- `makeDispatcherToken()` → dispatcher JWT

**Test pattern:**
```js
test('returns 200 with data', async ({ request }) => {
  ctx.mockPrisma.product.findMany.mockResolvedValue([...]);
  const res = await request.get('/api/v1/products', {
    headers: { Authorization: `Bearer ${makeAuthToken()}` },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(body.data).toHaveLength(1);
});
```

**Minimum coverage per new endpoint** (as an API scenario in `server/automation/`; use a mocked spec only for logic the
API cannot reach):
- 403 (no token)
- 401 (bad/expired token)
- 400 (invalid input / bad ID)
- 403 (wrong role, e.g. salesman hitting admin-only)
- 200/201 (happy path)
- The specific business logic path (e.g. missing field defaults, cascades)

### Backend — API automation against the deployed environment (`server/automation/`)

`server/tests/playwright` (above) proves the code with a **mocked** Prisma, and now holds only what the API suite
cannot test (unit-level logic, MFA/lock-out, rate limits, Slack cards, forged-token cases, finalisation) plus a few
mixed files; endpoint behaviour is tested in `server/automation/`. That suite proves the
**deployed backend with its real database**, and runs after every merge to `develop`
(`staging-pipeline.yml`: `@api and not @known-defect and not @shared-state`) and, read-only, after a merge to `main`
(`@api and @smoke`). Its own rules are in `server/automation/CLAUDE.md`.

- Features live in `server/automation/src/test/resources/features/api/`, grouped by area (access control, auth,
  dairy setup, salespeople/pricing, dairy ledger, dispatches, salesperson ledger, reports, bills, PIN).
- Scenarios use business language, no ids/dates/tokens; entities come from fixtures (`E2E-...` names,
  removed afterwards). Ledger scenarios use a **throwaway brand**, never a real one.
- Scenarios that create brands, admin users or dispatchers need a superadmin session
  (`E2E_SUPERADMIN_*`); without it they are skipped, or fail when `E2E_STRICT=true`.
- Unit-level specs, rate-limit exhaustion and account lock-out/full MFA intentionally stay in `server/tests`
  only; `server/automation/COVERAGE.md` maps every mocked spec file to its real-API coverage and exceptions.
- Behaviour the API gets wrong today lives in `known-defects.feature` (`@known-defect`, excluded from the gate).
- PR CI only compiles it (`mvn -B -ntp test-compile` in the `compile-automation-suite` job).

### Frontend — UI automation against the deployed environment (`client/automation-ui/`)

Playwright Test + TypeScript, real browser → real frontend → real API → real database. Runs after the API suite in
`staging-pipeline.yml`; PR CI only type-checks it (`npm run typecheck`). There is no production UI run.
Its own rules are in `client/automation-ui/CLAUDE.md`.

- Page objects in `src/pages/` hold every selector; specs in `tests/` hold behaviour.
- Admin/dispatcher specs run on iPad portrait + landscape; specs in `tests/salesman/` run on a phone.
- The `setup` project signs in once and saves `.auth/admin.json` — specs reuse it (login is limited to 20/hour).
- Anything a test creates is `E2E-...` named and removed by a fixture (e.g. `trackRoute`).

### Frontend — Vitest + React Testing Library

**Location:** `client/src/pages/**/*.test.jsx`

**Setup pattern:**
```js
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

vi.mock('../../utils/dateUtils', async () => {
  const actual = await vi.importActual('../../utils/dateUtils');
  return { ...actual, getIndiaDate: () => '2026-08-09' }; // pin today's date
});
```

**Mock API responses:**
```js
vi.mocked(api.get).mockImplementation((url) => {
  if (url.includes('/brands'))     return Promise.resolve({ data: { data: brands } });
  if (url.includes('/categories')) return Promise.resolve({ data: { data: categories } });
  if (url.includes('/products'))   return Promise.resolve({ data: { data: products } });
  return Promise.resolve({ data: { data: [] } });
});
```

**Minimum RTL coverage per new page:**
- Renders initial state correctly
- Shows empty state when no data
- Handles API errors (notify called with 'error')
- Core user interactions (click, change, submit)
- Optimistic UI updates (no extra GET calls)

---

## 13. Validation Schemas (Zod)

All schemas live in `server/utils/validate.js`. Key constraints:

| Schema | Key rules |
|--------|----------|
| `createProduct` | `unitType` enum `ml/gram/piece`, `unitSize` nullable, `containerType` nullable, `effectiveFrom` must be today (IST) or later |
| `updateProduct` | all fields optional; same date constraints |
| `bulkStockReceipt` | `date` cannot be beyond tomorrow (IST) |
| `createDispatch` | `dispatchDate` cannot be beyond tomorrow (IST); empty `items` = delete draft |
| `bulkSalespersonPrices` | `effectiveFrom` must be today or later |
| `bulkSalespersonTopUp` | `entries` array min 1 |
| `createAdminUser` | `role` enum `admin/superadmin/dispatcher` |
| `createBill` | `salespersonId`, `from`/`to` dates; optional `partyName` (≤120, defaults to salesperson name), `poNumber` (≤50) |
| `verifyPin` / `updatePin` / `updatePinSettings` | PIN accepted as string or number; P&L gate toggle |
| `login`, `verifyMfaLogin`, `confirmMfa`, `disableMfa`, `confirmRequiredMfa`, `setMfaRequired` | auth + MFA flows |
| `reportClientError` | public crash-beacon payload (`message`, `stack`, `page`, `version`) |

The file holds ~45 schemas — check it before adding a new one; reuse its `dateString` and IST date helpers.

**Usage in controllers:**
```js
const data = validate(schemas.createProduct, req, res);
if (!data) return;  // ← 400 already sent, must return immediately
```

**`parseId` for route params:**
```js
const id = parseId(req.params.id, 'Product ID'); // throws AppError(400) if not a positive int
```

---

## 14. Salesperson Product Exception Manager

The Exception Manager (`ExceptionManagerModal.jsx`, opened from `SalesmanPricesSetup.jsx`) lets admins enable/disable specific products for specific salespeople, overriding the global `product.salespersonEnabled` flag.

**Resolution logic in `controllers/dispatches/_shared.js`:**
```js
// SalespersonProduct.isEnabled ?? product.salespersonEnabled
// If there's an override row → use its isEnabled
// If no override row → fall back to global salespersonEnabled
const isEnabled = enabledMap[item.productId] ?? product.salespersonEnabled;
```

**Critical:** Use `??` (nullish coalescing), NOT `&&` (logical AND). The `&&` operator would short-circuit when `salespersonEnabled=false`, making exceptions impossible.

**API response must include `categoryDisplayOrder`** for the client-side sort to work correctly. See `salespersonProducts.controller.js`.

---

## 15. Dispatch Day Finalization

- **Past dates**: Auto-finalized by `isDayFinalizedForDispatcher()` — no `DispatchDayFinalization` row needed
- **Today**: Requires an explicit `DispatchDayFinalization` row created when the dispatcher explicitly finalizes the day (`POST /dispatches/finalize-day` — dispatcher role only)
- Logic lives in `services/dispatchDayFinalization.js` and `controllers/dispatches/dayFinalization.js` / `lockLifecycle.js`
- After finalization: Only admin/superadmin can unlock individual dispatches; dispatchers lose the unlock ability
- Reverting finalization: admin-only (`DELETE /dispatches/finalize-day`), emits `DISPATCH_DAY_UNFINALIZED` Slack event
- API scenarios for this are `@shared-state` (finalising locks everyone's entries) — they run on demand, not in the staging gate

---

## 16. Git Standards

Full flow and one-time setup: `docs/release-pipeline.md`.

```
feat/* → PR → develop → (auto-deploy testing) → API automation → UI automation
       → "Staging Verified" + auto release PR develop → main → human approval → main → (auto-deploy prod)
```

### Branches
- **`develop`** is the integration branch and the GitHub default. Never push to it directly — open a PR.
- **`main`** is production. Only the release PR (`develop → main`) or a `hotfix/*` PR lands here.
- Work on a feature branch cut from `develop`:
  - `feat/<description>`, `fix/<description>`, `hotfix/<description>` (hotfix is cut from `main`)

```bash
git fetch origin develop
git checkout -b feat/short-description origin/develop
# ...commit...
git push -u origin feat/short-description   # then open a PR into develop
```

### Commit message rules
- Imperative mood, present tense: "add", "fix", "update" — not "added", "fixed"
- Max 72 chars in the subject line
- Never force-push `develop` or `main`

### CI / pipeline
- PRs to `develop` and `main` run `pr-checks.yml`: timezone lint, server + client ESLint, server Playwright specs under `c8` coverage (70/80/85/70), client Vitest under v8 coverage (78/68/70/80), client build, OpenAPI lint, `npm audit` (server + client), and `compile-automation-suite` (`server/automation` test-compile + `client/automation-ui` typecheck). The release PR (`develop → main`) skips these jobs — develop already passed them and `Staging Verified`; hotfix PRs into `main` still run them.
- A merge to `develop` triggers `staging-pipeline.yml`. It does not deploy — Render/Vercel auto-deploy; it waits for the new commit, runs `server/automation` `@api` then `client/automation-ui` (Playwright + TypeScript), posts one Slack results card per suite, sets the `Staging Verified` commit status and opens/updates the release PR.
- `main` requires `Staging Verified` + 1 approval. Merge the release PR with a **merge commit** (not squash).
- A merge to `main` triggers `production-verify.yml` (read-only `@api and @smoke` checks from `server/automation`, then a `vX.Y.Z` tag/release). Smoke scenarios must never write to production.
- After a hotfix to `main`, open a PR `main → develop`.
- `auto-merge-develop.yml` merges a PR into `develop` once every `pr-checks` job is green (merge commit). It never touches `main`; add the `no-auto-merge` label to a PR to opt out. See `docs/release-pipeline.md` §5b.

---

## 17. Change Checklist

Every code change (new feature, bug fix, or refactor) MUST satisfy all four:

### 17.1 Tests
- **Backend change** → add/update Playwright spec in `server/tests/playwright/` for logic the API cannot reach, and an API scenario in `server/automation/` for endpoint behaviour (Section 12)
- **Frontend change** → add/update Vitest spec next to the page file
- Mock new Prisma calls with `test.beforeEach` to avoid "Cannot read properties of undefined" crashes
- Run tests before pushing: `cd server && npx playwright test` and `cd client && npm test`; if you touched an automation suite, also `cd server/automation && mvn -B -ntp test-compile` and/or `cd client/automation-ui && npm run typecheck`
- A user-facing flow that spans backend + frontend → also add an API scenario in `server/automation/` (Cucumber `@api`; `@smoke` only if read-only) and/or a UI spec in `client/automation-ui/tests/` (Playwright + TypeScript). See their `CLAUDE.md` and `README.md`
- A renamed endpoint, field or screen text → update the automation suites in the same PR; they run after merge and will turn `Staging Verified` red otherwise

### 17.2 Slack notification
- Every write action needs a Slack card
- Use `void notifySlack(SLACK_EVENTS.XXX, {...})` — never await
- If the operation doesn't have an event yet, add one to the catalogue (Section 10)
- Auto-enrichment: pass `brandId` or `salespersonId` and the name is fetched automatically

### 17.3 Product display order
- Any new endpoint that returns products must fetch `category.findMany` and apply the catOrder Map sort
- Any new frontend component that renders a product list must sort by `brand.displayOrder → categoryDisplayOrder → product.displayOrder → name`
- API responses consumed by the Exception Manager must include `categoryDisplayOrder`
- See Section 9 for the exact code patterns

### 17.4 BrandedLoader
- Use `BrandedLoader` (not a generic spinner) for page-level and section-level loading states
- Use `TumblerSpinner` (from the same file) for in-button and inline spinners — never `Loader2` from lucide-react
- See Section 11 for the props reference and usage table

---

## 18. Environment Variables

All server config is validated in `server/config/env.js` (Zod) at boot. "Prod" means the app refuses to boot in production without it.

### Server
| Variable | Required | Purpose |
|----------|:---:|---------|
| `DATABASE_URL` | Prod | Prisma connection string |
| `DIRECT_URL` | No | Direct connection for migrations (`prisma.config.ts`) |
| `DATABASE_CA_CERT` | No | Managed Postgres CA cert (PEM) — pins TLS verification in production. Unset falls back to unverified TLS with a boot-time warning. See `server/utils/dbUrl.js` |
| `JWT_SECRET` | Prod | Min 32 chars. Also derives the MFA secret encryption key — rotating it invalidates every enrolled authenticator |
| `ADMIN_PASSWORD` | Prod | Still required by `config/env.js` but no longer read by any code (legacy; the superadmin comes from the two vars below) |
| `SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD` | No | When both set, `seed.js` creates/syncs the superadmin on every boot; unset = no superadmin seeding |
| `EDIT_PIN` | No | Seeds the edit PIN and P&L PIN on the **first** boot only (falls back to `123456` — set it). Afterwards PINs are changed in the superadmin UI and stored hashed in `AppSettings` |
| `CLIENT_ORIGIN` | No | Comma-separated CORS origins (default `http://localhost:5173`) — set it in every deployed env |
| `NODE_ENV` | No | `development` (default) / `test` / `production` |
| `PORT` | No | Default `3001` |
| `LOGIN_RATE_LIMIT_MAX` | No | Login attempts per IP per hour (default `20`). Raise only on a test environment — never in production |
| `SLACK_WEBHOOK_URL` | No | Slack incoming webhook — unset = silent |
| `APP_URL` | No | Added as "Open App" link in Slack card footers |
| `APP_VERSION` | No | Overrides the build tag shown in `/health` (Section 18a) |

### Client
| Variable | Required | Purpose |
|----------|:---:|---------|
| `VITE_API_BASE_URL` | Yes | Backend base URL including `/api/v1` (default `http://localhost:3001/api/v1`) |
| `VITE_APP_VERSION` | No | Overrides the build tag shown in the UI |

### Automation suites
Read by the suites, never by the app. Full tables in `server/automation/CLAUDE.md` and `client/automation-ui/CLAUDE.md`.

| Variable | Suite | Purpose |
|----------|-------|---------|
| `API_BASE_URL` | API | Backend origin, no `/api/v1` |
| `WEB_BASE_URL` | UI | Frontend origin |
| `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD` | both | Admin **without MFA** |
| `E2E_SUPERADMIN_USERNAME` / `E2E_SUPERADMIN_PASSWORD` | API | Superadmin **without MFA** (optional) |
| `E2E_STRICT`, `EXPECTED_COMMIT` | API | Fail instead of skip / commit `/health` must report |
| `VERCEL_BYPASS_SECRET` | UI | Vercel Deployment Protection bypass |

---

## 18a. Build Version

The running build (git tag + short commit) is shown in the sidebar footer (`components/VersionTag.jsx`), on the login page, in `GET /health` (`version`, `commit`, `builtAt`), in the "Server Online" Slack card and on frontend crash cards.
- **Server:** `utils/version.js` (tag → `package.json` version if untagged) reads `server/version.json` (written by `npm run build` via `scripts/write-version.js`, gitignored), else detects live from `RENDER_GIT_COMMIT` / git. `APP_VERSION` env overrides the tag.
- **Client:** `vite.config.js` injects `__APP_VERSION__`, `__APP_COMMIT__`, `__APP_BUILT_AT__`; read them only through `utils/appVersion.js`. `VITE_APP_VERSION` overrides the tag.
- To release: create a git tag (`git tag v1.4.0 && git push origin v1.4.0`) on `main` before deploying. If a host's clone has no tags, only the commit is shown.

---

## 19. Local Development

```bash
# Backend
cd server && npm install
cp .env.example .env   # fill DATABASE_URL, JWT_SECRET, EDIT_PIN, SUPERADMIN_USERNAME/PASSWORD
npx prisma migrate deploy
npm start              # http://localhost:3001

# Frontend
cd client && npm install
# .env: VITE_API_BASE_URL=http://localhost:3001/api/v1
npm run dev            # http://localhost:5173

# Run backend tests (mocked Prisma)
cd server && npx playwright test        # npm run check = lint + timezone lint + tests

# Run frontend tests
cd client && npm test

# API automation against a running backend (Java 21 + Maven)
cd server/automation
API_BASE_URL=http://localhost:3001 E2E_ADMIN_USERNAME=... E2E_ADMIN_PASSWORD=... \
  mvn test -Dcucumber.filter.tags="@api and not @known-defect and not @shared-state"

# UI automation against a running frontend
cd client/automation-ui && npm ci && npx playwright install chromium
WEB_BASE_URL=http://localhost:5173 E2E_ADMIN_USERNAME=... E2E_ADMIN_PASSWORD=... npm test
```

---

## 20. Global Error Handler

The error handler in `app.js` (last middleware) automatically handles:
- `P2002` (Prisma unique violation) → 400 `DUPLICATE`
- `P2025` (Prisma not found) → 404 `NOT_FOUND`
- `P2003` (Prisma FK constraint) → 400 `FK_CONSTRAINT`
- `err.isOperational` (AppError) → `err.statusCode` + `err.message`
- All other errors → 500 + `void notifySlack(SERVER_ERROR, ...)`

Never try/catch in controllers — let `asyncHandler` propagate to this handler.
