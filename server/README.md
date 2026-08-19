# Server — Backend Developer Guide

> **Express 5 · Prisma ORM · PostgreSQL · Node.js 20+**
>
> ← Back to [project root](../README.md) · See also: [Frontend guide](../client/README.md)

---

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Boot Sequence](#boot-sequence)
- [Middleware Stack](#middleware-stack)
- [Directory Layout](#directory-layout)
- [Controllers & Routes](#controllers--routes)
- [Database Schema](#database-schema)
- [Balance Cascade — The Core Invariant](#balance-cascade--the-core-invariant)
- [Services](#services)
- [Validation](#validation)
- [Error Handling](#error-handling)
- [Authentication & Authorization](#authentication--authorization)
- [Rate Limiting](#rate-limiting)
- [Slack Notifications](#slack-notifications)
- [Logging](#logging)
- [Environment Configuration](#environment-configuration)
- [Testing](#testing)
- [API Reference](#api-reference)
- [Key Patterns & Anti-Patterns](#key-patterns--anti-patterns)

---

## Quick Start

```bash
# 1. Start a local Postgres (optional — uses docker-compose.yml in project root)
docker compose up -d       # Postgres on localhost:5434, db: dairy_flow

# 2. Install & configure
cd server
npm install
cp .env.example .env       # fill in DATABASE_URL, JWT_SECRET (32+ chars),
                           # ADMIN_PASSWORD, EDIT_PIN

# 3. Apply migrations and seed
npx prisma migrate deploy
npm run seed               # upserts the superadmin from SUPERADMIN_USERNAME/PASSWORD

# 4. Run
npm start                  # http://localhost:3001
```

Health probes:
- `GET /health` — liveness (process uptime)
- `GET /health/ready` — readiness (executes `SELECT 1` against the database)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Express 5 Application                                              │
│                                                                     │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐   ┌────────────┐  │
│  │  Helmet   │──▶│   CORS   │──▶│  Rate Limits │──▶│ Body Parse │  │
│  └──────────┘   └──────────┘   └──────────────┘   └────────────┘  │
│                                                         │          │
│  ┌──────────────────────────────────────────────────────▼────────┐ │
│  │                      Route Layer                              │ │
│  │                                                               │ │
│  │   /api/v1/auth (public)                                       │ │
│  │   /api/v1/* (authenticate middleware)                         │ │
│  │     ├── shared routes (admin + salesman)                      │ │
│  │     ├── requireAdmin routes                                   │ │
│  │     └── requireSuperAdmin routes                              │ │
│  └──────────────────────────────────────────────────────┬────────┘ │
│                                                         │          │
│  ┌──────────────────────────────────────────────────────▼────────┐ │
│  │                  Controller Layer                             │ │
│  │                                                               │ │
│  │   validate() ──▶ business logic ──▶ Prisma queries            │ │
│  │                                  ──▶ balanceService cascade   │ │
│  │                                  ──▶ void notifySlack(...)    │ │
│  └──────────────────────────────────────────────────────┬────────┘ │
│                                                         │          │
│  ┌──────────────────────────────────────────────────────▼────────┐ │
│  │                Global Error Handler                           │ │
│  │                                                               │ │
│  │   P2002 → 400 DUPLICATE    │ AppError → statusCode + message  │ │
│  │   P2025 → 404 NOT_FOUND    │ Unknown  → 500 + Slack alert    │ │
│  │   P2003 → 400 FK_CONSTRAINT│                                  │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
    ┌──────────┐
    │ Postgres │  (Prisma ORM — Serializable transactions for balance writes)
    └──────────┘
```

---

## Boot Sequence

Defined in `index.js`:

```
1. dotenv.config()                    Load .env
2. require('./config/env')            Zod-validate all env vars (fails closed in prod)
3. app.listen(PORT)                   HTTP server starts immediately (no DB wait)
4. runMigrations()                    npx prisma migrate deploy
5. seedFoundationData()              Upsert superadmin from env vars
6. notifySlack(SERVER_STARTED)       Fire-and-forget Slack card
7. Register SIGTERM/SIGINT handlers  Graceful shutdown with Slack notification
```

If migrations or seeding fail, the process logs the error, notifies Slack (`SERVER_BOOT_FAILED`), and exits with code 1. Process-level guards (`uncaughtException`, `unhandledRejection`) also notify Slack before crashing.

---

## Middleware Stack

Applied in this exact order in `app.js`:

| Order | Middleware | Scope | Purpose |
|:-----:|-----------|-------|---------|
| 1 | `helmet()` | All | Security headers |
| 2 | `cors()` | All | Dynamic origin check against `env.allowedOrigins` |
| 3 | `morgan('combined')` | All | HTTP logging piped through Winston |
| 4 | Global rate limiter | `/api` | 5,000 req / 15 min |
| 5 | Login rate limiter | `/api/v1/auth/login` | 20 req / hour |
| 6 | Bulk write limiter | Per-route | 30 req / min (stock receipts, salesperson products) |
| 7 | `cookieParser()` | All | Cookie parsing for JWT extraction |
| 8 | `express.json({ limit: '10kb' })` | All | Body parsing with strict size limit |

---

## Directory Layout

```
server/
├── index.js                    # Entry point: listen → migrate → seed → ready
├── app.js                      # Middleware stack, route registration, error handler
│
├── config/
│   ├── env.js                  # Zod-validated env config (fail-closed in production)
│   └── logger.js               # Winston logger (JSON in prod, colorized in dev)
│
├── controllers/                # Business logic — one file per resource
│   ├── auth.controller.js
│   ├── brands.controller.js
│   ├── categories.controller.js
│   ├── products.controller.js
│   ├── stockReceipts.controller.js
│   ├── dairyBalance.controller.js
│   ├── dairyPayments.controller.js
│   ├── dairyDepositTopUps.controller.js
│   ├── dispatches.controller.js        # Barrel → dispatches/{read,write,lockLifecycle,dayFinalization}
│   ├── dispatches/
│   │   ├── _shared.js
│   │   ├── read.js
│   │   ├── write.js
│   │   ├── lockLifecycle.js
│   │   └── dayFinalization.js
│   ├── salespeople.controller.js
│   ├── salespersonPrices.controller.js
│   ├── salespersonProducts.controller.js
│   ├── salespersonBalance.controller.js
│   ├── salespersonPayments.controller.js
│   ├── salespersonStatement.controller.js
│   ├── reports.controller.js           # Barrel → reports/{dailyDispatch,dairyStatement,...}
│   ├── reports/
│   │   ├── _shared.js
│   │   ├── dailyDispatch.js
│   │   ├── dairyStatement.js
│   │   ├── depositSummary.js
│   │   ├── outstanding.js
│   │   ├── profitLoss.js
│   │   ├── salespersonStatement.js
│   │   └── stockSummary.js
│   ├── routes.controller.js
│   ├── pin.controller.js
│   └── adminUsers.controller.js
│
├── routes/                     # Thin route definitions — path + method + controller ref
│   ├── auth.js
│   ├── brands.js
│   ├── categories.js
│   ├── products.js
│   ├── stockReceipts.js
│   ├── dairyBalance.js
│   ├── dairyPayments.js
│   ├── dairyDepositTopUps.js
│   ├── dispatches.js
│   ├── salespeople.js
│   ├── salespersonPrices.js
│   ├── salespersonProducts.js
│   ├── salespersonBalance.js
│   ├── salespersonPayments.js
│   ├── salespersonStatement.js
│   ├── reports.js
│   ├── pin.js
│   ├── routes.js
│   ├── clientErrors.js
│   └── adminUsers.js
│
├── services/                   # Domain logic shared across controllers
│   ├── balanceService.js       # Cascading balance recalculation (serializable tx)
│   ├── depositRules.js         # qualifiesForDeposit, calculateLineDeposit
│   ├── stockGuard.js           # Dispatch stock availability check
│   ├── dispatchDayFinalization.js  # isDayFinalizedForDispatcher
│   └── paymentLedger.js        # cascadeAroundDateChange, validateBulkEntities
│
├── middleware/
│   ├── auth.js                 # JWT: authenticate, requireAdmin, requireSuperAdmin
│   └── asyncHandler.js         # Async error propagation to global handler
│
├── utils/
│   ├── validate.js             # All Zod schemas + validate() + parseId()
│   ├── AppError.js             # Operational error class (isOperational = true)
│   ├── slack.js                # notifySlack, SLACK_EVENTS, buildCard (44 events)
│   ├── dateUtils.js            # getIndiaDateStr, getIndiaTomorrowStr (IST)
│   ├── constants.js            # BCRYPT_ROUNDS: 10, JWT_EXPIRES_IN: 7200
│   ├── actor.js                # getActingUsername for audit attribution
│   ├── authz.js                # assertRole, assertAdmin (defense-in-depth)
│   ├── pagination.js           # getPaginationParams, buildPaginationMeta
│   └── productLayout.js        # Product display-order sorting helpers
│
├── lib/
│   └── prisma.js               # Singleton PrismaClient (dev: query+error+warn logs)
│
├── prisma/
│   ├── schema.prisma           # Single source of truth — 17 models
│   ├── seed.js                 # Upserts superadmin only
│   └── migrations/             # 33 migration files — never edit manually
│
└── tests/
    ├── helpers/
    │   ├── test-setup.js       # setupSuite(), token helpers, mock Prisma wiring
    │   ├── create-mock-prisma.js  # Full mock of all 17 Prisma models
    │   ├── create-test-server.js  # Fresh Express server per suite
    │   ├── mock-cascade.js
    │   └── mock-fn.js
    └── playwright/             # 40+ API spec files
        ├── auth.spec.js
        ├── brands.spec.js
        ├── dispatches.spec.js
        ├── ... (40 spec files)
        └── validate.spec.js
```

---

## Controllers & Routes

### The Pattern

**Route file** — thin, no logic:

```js
// routes/products.js
const router = require('express').Router();
const controller = require('../controllers/products.controller');

router.get('/',    controller.getAll);
router.post('/',   controller.create);
router.put('/:id', controller.update);

module.exports = router;
```

**Controller** — all business logic:

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
  if (!data) return;  // 400 already sent by validate()

  const product = await prisma.product.create({ data });
  void notifySlack(SLACK_EVENTS.PRODUCT_CREATED, { name: product.name });
  res.status(201).json({ success: true, data: product });
});

module.exports = { getAll, create };
```

### Complete Route Map

All routes are mounted under `/api/v1`. See [API Reference](#api-reference) for the full OpenAPI spec.

| Prefix | Auth | Controller |
|--------|------|-----------|
| `/auth/login`, `/auth/logout`, `/auth/change-password` | Public / JWT | `auth` |
| `/brands` | JWT / admin | `brands` |
| `/categories` | JWT / admin | `categories` |
| `/products` | admin | `products` |
| `/stock-receipts` | JWT + bulk limiter | `stockReceipts` |
| `/dairy-balance` | admin | `dairyBalance` |
| `/dairy-payments` | admin | `dairyPayments` |
| `/dairy-deposit-topups` | admin | `dairyDepositTopUps` |
| `/salespeople` | admin | `salespeople` |
| `/salespeople/:id/prices` | JWT | `salespersonPrices` |
| `/salespeople/:id/products` | admin + bulk limiter | `salespersonProducts` |
| `/dispatches` | JWT | `dispatches` |
| `/salesperson-balance` | JWT | `salespersonBalance` |
| `/salesperson-payments` | admin | `salespersonPayments` |
| `/salesperson-statement` | JWT | `salespersonStatement` |
| `/reports/*` | JWT (per-route gating) | `reports` |
| `/pin/verify` | admin | `pin` |
| `/routes` | admin | `routes` |
| `/admin-users` | superadmin | `adminUsers` |

---

## Database Schema

17 models defined in `prisma/schema.prisma`. Key models:

### Core Business Models

| Model | Purpose | Unique Constraint |
|-------|---------|-------------------|
| `Brand` | Dairy brand (Nandini, Jersey, Gowardhan) | `name` |
| `Category` | Product grouping within a brand | `(brandId, name)` |
| `Product` | Sellable item | `(brandId, name)` |
| `Route` | Nandini delivery route | `(brandId, routeNumber)` |

### Stock & Dispatch

| Model | Purpose | Unique Constraint |
|-------|---------|-------------------|
| `StockReceipt` | Daily stock received from dairy | `(productId, receiptDate, routeId)` |
| `StockDispatch` | Daily dispatch to a salesperson | `(salespersonId, dispatchDate)` |
| `StockDispatchItem` | Line items in a dispatch | — |
| `DispatchDayFinalization` | Explicit finalization of a dispatch day | `date` |

### Ledger Models

| Model | Purpose | Unique Constraint |
|-------|---------|-------------------|
| `DairyBalance` | Cascading ledger per brand per date | `(brandId, balanceDate)` |
| `DairyPayment` | Payment to dairy (or top-up if `isTopUp=true`) | — |
| `DairyDepositTopUp` | Crate/container deposit ledger | — |
| `SalespersonBalance` | Cascading ledger per salesperson per date | `(salespersonId, balanceDate)` |
| `SalespersonPayment` | Collection from salesperson | — |

### People & Pricing

| Model | Purpose | Unique Constraint |
|-------|---------|-------------------|
| `Salesperson` | Delivery agent | `username` |
| `SalespersonPrice` | Per-salesman per-product selling price | `(salespersonId, productId, effectiveFrom)` |
| `SalespersonProduct` | Per-salesman product exception (override) | `(salespersonId, productId)` |
| `AdminUser` | Admin/superadmin/dispatcher login | `username` |

### Important Field Notes

- **`Product.category`** is a plain `String?` — **not** a foreign key. Sorting by category display order always requires a separate `category.findMany()` + JS sort (see [Product Display Order](#product-display-order) in the root `CLAUDE.md`).
- **`isTopUp`** on `DairyPayment` and `SalespersonPayment`: `true` = pre-existing debt loaded into the app (ADDs to balance), `false` = real payment (SUBTRACTs from balance).
- All monetary fields use `@db.Decimal(10, 2)`; prices use `@db.Decimal(10, 4)`.
- All date-only fields use `@db.Date`.

---

## Balance Cascade — The Core Invariant

This is the most critical concept in the system. **Every ledger record is a computed sum**, not a raw INSERT.

### Dairy Balance Formula

```
closingBalance = openingBalance + stockValue + depositValue + topUpAmount − amountPaid
```

### Salesperson Balance Formula

```
closingBalance = openingBalance + stockGiven + topUpAmount − amountPaid
```

### Rules

1. **Never write balance records directly.** Always call `recalculateDairyBalance(brandId, date)` or `recalculateSalespersonBalance(salespersonId, date)` from `services/balanceService.js`.
2. These functions cascade forward through **all subsequent dates** for the entity.
3. They run in a **serializable transaction** to prevent write-skew.
4. When you're inside your own `$transaction`, pass `tx` so the balance recomputation joins the outer transaction:

```js
// ✅ Standalone balance recalc
await recalculateDairyBalance(brandId, date);

// ✅ Inside your own transaction — pass tx!
await prisma.$transaction(async (tx) => {
  await tx.stockReceipt.upsertMany(...);
  await recalculateDairyBalance(brandId, date, tx);
}, { isolationLevel: 'Serializable' });

// ❌ WRONG — global prisma inside a transaction
await prisma.$transaction(async (tx) => {
  await tx.stockReceipt.upsertMany(...);
  await recalculateDairyBalance(brandId, date);  // uses global prisma, outside tx!
});
```

### What Triggers Recalculation

| Action | Recalculates |
|--------|-------------|
| Stock receipt save | `recalculateDairyBalance(brandId, date)` |
| Dairy payment create/update/delete | `recalculateDairyBalance(brandId, date)` |
| Dispatch create/update/delete | `recalculateSalespersonBalance(salespersonId, date)` |
| Salesperson payment create/update/delete | `recalculateSalespersonBalance(salespersonId, date)` |

---

## Services

| Service | File | Purpose |
|---------|------|---------|
| **Balance Service** | `services/balanceService.js` | Cascading balance recalculation for both dairy and salesperson ledgers. The core invariant. |
| **Deposit Rules** | `services/depositRules.js` | `qualifiesForDeposit()` checks brand/product/category eligibility. `calculateLineDeposit()` computes the per-line deposit amount. |
| **Stock Guard** | `services/stockGuard.js` | `validateDispatchStock()` checks that dispatch quantities don't exceed received stock for the date. |
| **Dispatch Day Finalization** | `services/dispatchDayFinalization.js` | `isDayFinalizedForDispatcher()` — past dates are auto-finalized; today requires an explicit `DispatchDayFinalization` row. |
| **Payment Ledger** | `services/paymentLedger.js` | `cascadeAroundDateChange()` handles balance recalculation when a payment's date changes. `validateBulkEntities()` validates bulk top-up inputs. |

---

## Validation

All Zod schemas are centralized in `utils/validate.js`.

### Usage in Controllers

```js
const data = validate(schemas.createProduct, req, res);
if (!data) return;  // 400 already sent — MUST return immediately
```

### Route Parameter Parsing

```js
const id = parseId(req.params.id, 'Product ID');
// Throws AppError(400) if not a positive integer
```

### Key Schema Constraints

| Schema | Rules |
|--------|-------|
| `createProduct` | `unitType` ∈ `{ml, gram, piece}`, `effectiveFrom` ≥ today (IST) |
| `bulkStockReceipt` | `date` ≤ tomorrow (IST) |
| `createDispatch` | `dispatchDate` ≤ tomorrow (IST), empty `items` = delete draft |
| `bulkSalespersonPrices` | `effectiveFrom` ≥ today (IST) |
| `createAdminUser` | `role` ∈ `{admin, superadmin, dispatcher}` |

### Date Validation

- `todayOrLaterDateString()` — refines that a date string ≥ `getIndiaDateStr()`
- `notBeyondTomorrowDateString()` — refines that a date string ≤ `getIndiaTomorrowStr()`
- All dates are validated in IST (Asia/Kolkata), not UTC.

---

## Error Handling

### AppError

```js
const AppError = require('../utils/AppError');

// Operational error — reaches client with this message + status
throw new AppError('Product not found', 404);
throw new AppError('Insufficient stock', 400);
```

### asyncHandler

Every controller handler **must** be wrapped in `asyncHandler`:

```js
const getAll = asyncHandler(async (req, res) => {
  // If this throws, asyncHandler catches it and passes to next(err)
});
```

### Global Error Handler

The final middleware in `app.js` handles all errors:

| Error Type | HTTP Status | Response Code |
|-----------|:-----------:|:-------------:|
| Prisma `P2002` (unique violation) | 400 | `DUPLICATE` |
| Prisma `P2025` (not found) | 404 | `NOT_FOUND` |
| Prisma `P2003` (FK constraint) | 400 | `FK_CONSTRAINT` |
| `AppError` (`isOperational`) | `err.statusCode` | — |
| Everything else | 500 | — + Slack alert |

In production, stack traces are never leaked. In development, they appear in the response.

### What NOT to Do

```js
// ❌ WRONG — try/catch in controllers
const create = asyncHandler(async (req, res) => {
  try {
    const product = await prisma.product.create({ data });
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    res.status(500).json({ error: err.message });  // bypasses global handler
  }
});

// ❌ WRONG — throw generic Error
throw new Error('Something broke');  // isOperational is false → 500 with no context

// ✅ CORRECT
throw new AppError('Something broke', 400);  // isOperational = true
```

---

## Authentication & Authorization

### JWT Flow

1. `POST /api/v1/auth/login` returns `{ accessToken }` + sets `httpOnly` cookie
2. Client stores token and attaches it as `Authorization: Bearer <token>`
3. `authenticate` middleware extracts token (cookie → header → `x-access-token`) and verifies
4. Sets `req.user = { id, role, salespersonId, adminUserId }` on success

Token expiry: **2 hours** (`JWT_EXPIRES_IN: 7200` seconds).

### Roles

| Role | Access Level |
|------|-------------|
| `superadmin` | Everything, including admin user management |
| `admin` | Full access except admin user management |
| `dispatcher` | Dispatch sheet, stock balance report, change password |
| `salesman` | Own stock entry, own balance/statement, change password |

### Middleware Guards

```js
// Route-level guards (thin, applied in app.js)
authenticate          // All /api/v1/* routes
requireAdmin          // admin + superadmin
requireSuperAdmin     // superadmin only
requireAdminOrDispatcher  // admin + superadmin + dispatcher

// Controller-level defense-in-depth (belt-and-suspenders)
const { assertAdmin } = require('../utils/authz');
assertAdmin(req);     // Throws AppError(403) if not admin/superadmin
```

---

## Rate Limiting

| Scope | Window | Max Requests | Applied To |
|-------|--------|:------------:|-----------|
| Global API | 15 min | 5,000 | All `/api` paths |
| Login | 1 hour | 20 | `/api/v1/auth/login` |
| PIN verification | 15 min | 5 | `/api/v1/pin/verify` |
| Bulk writes | 1 min | 30 | Stock receipts, salesperson products |

---

## Slack Notifications

Every write operation fires a Slack notification card. The call is **fire-and-forget** — never `await` it.

```js
// ✅ Correct — non-blocking
void notifySlack(SLACK_EVENTS.PRODUCT_CREATED, {
  name: product.name,
  brandName: brand.name,
});

// ❌ Wrong — blocks the response
await notifySlack(...);
```

**Auto-enrichment:** Pass `brandId` or `salespersonId` and the notification system automatically fetches the name — no need to look it up yourself.

**44 event types** organized by domain: System, Auth, Stock Receipts, Dairy Payments, Dispatch, Salesperson Payments, Bulk/Ledger, Setup (Salespeople, Pricing, Products, Categories, Routes, Brands), and Superadmin. See `SLACK_EVENTS` in `utils/slack.js` for the complete catalogue.

### Adding a New Event

1. Add a key to `SLACK_EVENTS` in `utils/slack.js`
2. Add a color to `EVENT_COLOR` (GREEN = create, AMBER = update, RED = delete)
3. Add a `case` to `buildCard()` using the Block Kit helpers
4. Fire with `void notifySlack(SLACK_EVENTS.YOUR_EVENT, { ...data })`

---

## Logging

Use Winston (`config/logger.js`) — **never `console.log`**.

```js
const logger = require('./config/logger');

logger.info('Server started', { port: 3001 });
logger.error('Migration failed', { message: err.message });
logger.debug('Query result', { count: rows.length });
```

| Environment | Level | Format | Transports |
|------------|-------|--------|-----------|
| Production | `info` | JSON with timestamps | Console + `logs/error.log` + `logs/combined.log` |
| Development | `debug` | Colorized simple | Console + `logs/error.log` + `logs/combined.log` |

File rotation: 5 MB max per file, 5 files retained.

---

## Environment Configuration

All config is read through `config/env.js` — **never read `process.env` directly**.

```js
const env = require('./config/env');
// env.JWT_SECRET, env.isProd, env.allowedOrigins, etc.
```

The config is Zod-validated at boot and `Object.freeze()`-ed. In production, missing or weak secrets cause the server to **refuse to boot** (fail closed).

| Variable | Required (prod) | Purpose |
|----------|:---:|---------|
| `DATABASE_URL` | ✅ | Prisma connection string |
| `DIRECT_URL` | — | Direct connection for migrations |
| `JWT_SECRET` | ✅ | Min 32 chars (enforced) |
| `ADMIN_PASSWORD` | ✅ | Initial admin login password |
| `EDIT_PIN` | ✅ | 4–12 char PIN for protected edits |
| `CLIENT_ORIGIN` | — | Comma-separated CORS origins |
| `NODE_ENV` | — | `development` / `test` / `production` |
| `SUPERADMIN_USERNAME` | — | Auto-provisioned superadmin username |
| `SUPERADMIN_PASSWORD` | — | Auto-provisioned superadmin password |
| `SLACK_WEBHOOK_URL` | — | Slack incoming webhook (unset = silent) |
| `APP_URL` | — | "Open App" link in Slack footers |

---

## Testing

### Stack

- **Playwright** for API tests (HTTP-level, not browser)
- **c8** for code coverage
- **Mock Prisma** — full mock of all 17 models, reset between tests

### Running Tests

```bash
npm test                     # Run all Playwright API tests
npm run test:coverage        # With c8 coverage report
npm run check                # lint + timezone-lint + tests
```

### Coverage Thresholds

| Metric | Minimum |
|--------|:-------:|
| Statements | 90% |
| Branches | 75% |
| Functions | 85% |
| Lines | 90% |

### Test Setup

Every spec file uses the shared setup:

```js
const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');
const { test, ctx, makeAuthToken, makeSuperAdminToken } = setupSuite();
```

`setupSuite()` creates a fresh Express server with mock Prisma injected. Mocks are reset before each test.

### Token Helpers

```js
makeAuthToken()           // admin JWT
makeSuperAdminToken()     // superadmin JWT
makeSalesmanToken(id?)    // salesman JWT
makeDispatcherToken()     // dispatcher JWT
makeExpiredToken()        // expired JWT (for 401 tests)
```

### Minimum Test Coverage Per Endpoint

Every new endpoint must have tests for:
- `403` — no token (unauthenticated)
- `401` — bad/expired token
- `400` — invalid input / bad ID
- `403` — wrong role (e.g., salesman hitting admin-only)
- `200/201` — happy path
- Business logic paths (defaults, cascades, edge cases)

### Example

```js
test('returns 200 with products', async ({ request }) => {
  ctx.mockPrisma.product.findMany.mockResolvedValue([
    { id: 1, name: 'Toned Milk', brandId: 1 },
  ]);
  const res = await request.get('/api/v1/products', {
    headers: { Authorization: `Bearer ${makeAuthToken()}` },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(body.data).toHaveLength(1);
});
```

---

## API Reference

The full API surface is documented as an **OpenAPI 3.0 spec** at [`docs/openapi.yaml`](../docs/openapi.yaml).

Open it in [Swagger Editor](https://editor.swagger.io) or any OpenAPI-aware tool for interactive browsing.

---

## Key Patterns & Anti-Patterns

### ✅ Do

- Wrap every handler in `asyncHandler`
- Use `validate(schemas.xxx, req, res)` at the boundary, `return` if null
- Use `AppError(message, statusCode)` for operational errors
- Use `void notifySlack(...)` for write actions
- Import Prisma from `lib/prisma.js` (singleton)
- Read env from `config/env.js` (Zod-validated)
- Use Winston logger (`config/logger.js`)
- Pass `tx` when calling balance service inside a transaction
- Use `getIndiaDateStr()` for IST-aware dates

### ❌ Don't

- `try/catch` in controllers — let asyncHandler propagate
- `throw new Error()` — use `AppError`
- `new PrismaClient()` anywhere — leaks connections
- `console.log` — use the Winston logger
- `await notifySlack(...)` — fire-and-forget only
- `process.env.SECRET` — read through `config/env.js`
- Edit migration files after they've been applied
- Write balance records directly — use `balanceService`
- Put business logic in route files
