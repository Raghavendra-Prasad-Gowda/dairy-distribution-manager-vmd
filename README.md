# Vikas Milk Dairy — Distribution Manager (VMD)

A production business-management system for **Vikas Milk Dairy**. It tracks
multi-brand stock receipt, cascading daily balance ledgers per brand and per
salesperson, dispatch and collection, and financial reporting.

| Layer | Stack | Deployed to |
|-------|-------|-------------|
| **Frontend** | React 19 · Vite 8 · Tailwind CSS 3 | Vercel |
| **Backend** | Express 5 · Node.js 20+ | Render |
| **Database** | PostgreSQL (Prisma ORM) | Aiven |

> **New here?** Start with this page, then read the detailed guides:
> - 📖 **[Backend Developer Guide](./server/README.md)** — Express app, controllers, Prisma, balance cascade, testing
> - 📖 **[Frontend Developer Guide](./client/README.md)** — React app, hooks, components, routing, testing

---

## Table of Contents

1. [Architecture](#architecture)
2. [Getting Started](#getting-started)
3. [Roles & Access](#roles--access)
4. [Business Domain](#business-domain)
5. [Repository Structure](#repository-structure)
6. [Engineering Contracts](#engineering-contracts)
7. [Testing & CI](#testing--ci)
8. [Environment Variables](#environment-variables)
9. [Deployment](#deployment)
10. [API Reference](#api-reference)
11. [Key Design Decisions](#key-design-decisions)
12. [Contributing](#contributing)

---

## Architecture

```
┌─────────────────────┐        HTTPS         ┌──────────────────────────────┐
│   Browser (SPA)     │ ──────────────────> │     Vercel CDN               │
│   React 19 + Vite   │                      │     Static assets            │
└─────────┬───────────┘                      └──────────────────────────────┘
          │
          │  /api/v1/*
          ▼
┌──────────────────────────────┐         ┌──────────────────────────────┐
│   Express 5 REST API         │ ──────> │   PostgreSQL (Aiven)         │
│   Node.js 20+ (Render)       │  Prisma │   33 migrations              │
│                              │         │   17 models                  │
│   JWT auth (2h sessions)     │         │   Serializable transactions  │
│   Zod validation at boundary │         └──────────────────────────────┘
│   Winston logging            │
│   Slack webhook integration  │
└──────────────────────────────┘
```

### Data Flow

1. **Frontend** — Single-page React app, lazy-loaded routes, all API calls through a shared Axios instance with JWT injection
2. **Backend** — RESTful Express 5 API under `/api/v1`. Every request is validated with Zod at the route boundary. Controllers use `asyncHandler` for error propagation.
3. **Database** — PostgreSQL accessed via Prisma ORM. All multi-table operations use `$transaction()`. Balance mutations use serializable isolation.
4. **Notifications** — Every write action fires a Slack webhook card (fire-and-forget, never awaited)

### Auth Flow

```
Login → POST /auth/login → JWT (2h) → stored in localStorage
                                     → sent as Bearer token on every request
                                     → 401 response → auto-redirect to /login
                                     → 2h timer expires → auto-logout + redirect
```

---

## Getting Started

### Prerequisites

- **Node.js 20+**
- **PostgreSQL** (or use Docker — see below)

### 1. Database (Local Postgres)

```bash
docker compose up -d        # starts PostgreSQL 16 on localhost:5434
                            # db: dairy_flow, user: postgres, pass: postgres
```

### 2. Backend

```bash
cd server
npm install
cp .env.example .env        # fill in required values (see below)
npx prisma migrate deploy   # apply all migrations
npm run seed                # seed brands + initial admin user
npm start                   # http://localhost:3001
```

**Required `.env` values:** `DATABASE_URL`, `JWT_SECRET` (32+ chars), `ADMIN_PASSWORD`, `EDIT_PIN`

Health probes: `GET /health` (liveness), `GET /health/ready` (readiness — checks DB)

### 3. Frontend

```bash
cd client
npm install
# Create .env with: VITE_API_BASE_URL=http://localhost:3001/api/v1
npm run dev                 # http://localhost:5173
```

### 4. Run Tests

```bash
# Backend — Playwright API tests (mock Prisma)
cd server && npm test

# Frontend — Vitest + React Testing Library
cd client && npm test
```

📖 See the **[Backend Guide](./server/README.md)** and **[Frontend Guide](./client/README.md)** for detailed setup, architecture deep-dives, and testing patterns.

---

## Roles & Access

| Role | Access Level | Index Route |
|------|-------------|-------------|
| `superadmin` | Everything — including Admin Users setup | Dashboard |
| `admin` | Full access except Admin Users setup | Dashboard |
| `dispatcher` | Dispatch sheet + Stock Balance + change password | Dispatch Sheet |
| `salesman` | Own stock entry, own balance/statement, change password | Stock Entry |

### Route guards

**Frontend** (`App.jsx`):
- `ProtectedRoute` — any authenticated user
- `ProtectedRoute adminOnly` — admin + superadmin
- `ProtectedRoute superAdminOnly` — superadmin only
- Role-conditional route rendering (salesman/dispatcher get their own route trees)

**Backend** (`app.js`):
- `authenticate` middleware on all `/api/v1/*` routes
- `requireAdmin` on most admin routes
- `requireSuperAdmin` on admin-user management
- Rate limiters: login (20/hour), PIN (5/15min), bulk writes (30/min)

---

## Business Domain

### What the system tracks

| Domain | Description |
|--------|-------------|
| **Stock Receipt** | Daily stock received from dairy, per brand, with optional per-route entry (Nandini) |
| **Dairy Balance** | Cascading daily ledger per brand: opening + stock + deposits + topUps − payments = closing |
| **Dairy Payments** | Payments made to the dairy. `isTopUp=true` = pre-existing debt loaded into the system |
| **Dispatch** | Daily stock dispatched to each salesperson, with line items |
| **Salesperson Balance** | Cascading daily ledger per salesperson: opening + stockGiven + topUps − amountPaid = closing |
| **Salesperson Collections** | Payments collected from salespeople |
| **Deposits** | Crate/container deposit tracking (separate from stock value) |
| **Reports** | Statements, summaries, stock balance, P&L, outstanding |

### The Balance Cascade — Critical Concept

This is the most important invariant in the system. Every balance record is a **computed sum** of all transactions up to that date.

```
Dairy:       closing = opening + stockValue + depositValue + topUpAmount − amountPaid
Salesperson: closing = opening + stockGiven + topUpAmount − amountPaid
```

**Rules:**
- **Top-ups ADD** (they are pre-existing dues loaded into the app, not real payments)
- **Payments SUBTRACT**
- Any write that affects a balance → calls `recalculateDairyBalance()` or `recalculateSalespersonBalance()` from `server/services/balanceService.js`
- These cascade forward through ALL subsequent dates in a **serializable transaction**
- **Never write balance records directly** — always go through `balanceService.js`

📖 See the **[Backend Guide § Balance Cascade](./server/README.md#balance-cascade)** for implementation details and code examples.

### Product Display Order

Products follow a strict sort order everywhere they appear:

```
brand.displayOrder → category.displayOrder → product.displayOrder → product.name
```

Because `product.category` is a plain string (not a FK relation), Prisma can't sort by `category.displayOrder` in a single query. Both backend and frontend have helper functions for this — see the **[Backend Guide § Product Display Order](./server/README.md#product-display-order)** and **[Frontend Guide § Product Display Order](./client/README.md#product-display-order)**.

---

## Repository Structure

```
dairy-distribution-manager-vmd/
├── README.md                          # ← You are here (onboarding guide)
├── CLAUDE.md                          # Root engineering contract
├── docker-compose.yml                 # Local dev Postgres (port 5434)
├── .github/workflows/pr-checks.yml   # CI pipeline (8 parallel jobs)
│
├── server/                            # Express 5 backend
│   ├── README.md                      # Backend developer guide
│   ├── CLAUDE.md                      # Backend engineering contract
│   ├── app.js                         # Middleware stack, route registration, error handler
│   ├── index.js                       # Boot: listen → migrate → seed → ready
│   ├── config/
│   │   ├── env.js                     # Zod-validated config (fail-closed in production)
│   │   └── logger.js                  # Winston logger
│   ├── controllers/                   # Business logic (one file per resource, 20 controllers)
│   ├── routes/                        # Thin route definitions (path + method + controller ref)
│   ├── services/                      # Shared domain logic
│   │   ├── balanceService.js          # Cascading balance recalculation
│   │   ├── depositRules.js            # Deposit qualification and calculation
│   │   ├── stockGuard.js              # Dispatch stock availability check
│   │   └── dispatchDayFinalization.js  # Day finalization logic
│   ├── middleware/
│   │   ├── auth.js                    # JWT: authenticate, requireAdmin, requireSuperAdmin
│   │   └── asyncHandler.js            # Async error propagation
│   ├── utils/
│   │   ├── validate.js                # All Zod schemas + validate() + parseId()
│   │   ├── AppError.js                # Operational error class
│   │   ├── slack.js                   # 44 Slack event types + card builder
│   │   ├── dateUtils.js               # IST date helpers (server-side)
│   │   ├── productLayout.js           # Category order map sort
│   │   └── constants.js               # JWT_EXPIRES_IN, BCRYPT_ROUNDS
│   ├── lib/prisma.js                  # Singleton Prisma client
│   └── prisma/
│       ├── schema.prisma              # 17 models — single source of truth
│       ├── migrations/                # 33 migrations (never edit manually)
│       └── seed.js                    # Seeds brands + admin user
│
└── client/                            # React 19 frontend
    ├── README.md                      # Frontend developer guide
    ├── CLAUDE.md                      # Frontend engineering contract
    ├── vite.config.js                 # Vite + Vitest config (inline)
    ├── tailwind.config.js             # Brand color extensions
    └── src/
        ├── App.jsx                    # Route tree, lazy loading, ProtectedRoute, ErrorBoundary
        ├── api/
        │   ├── axios.js               # Shared Axios instance (JWT, session, cold-start)
        │   └── coldStart.js           # Render cold-start detection
        ├── context/
        │   ├── AuthContext.jsx        # Auth state, 2h session timer
        │   └── NotificationContext.jsx # Toast notifications
        ├── hooks/                      # 6 reusable custom hooks
        │   ├── useApiResource.js       # Declarative single-endpoint GET
        │   ├── useApiResources.js      # Declarative parallel GET
        │   ├── useMutation.js          # Async write wrapper
        │   ├── useDisclosure.js        # Modal open/close state
        │   ├── usePaymentFilters.js    # Payment list filter/search/pagination
        │   └── useDebouncedValue.js    # Debounced input
        ├── components/                 # 18 shared components + 6 UI primitives
        ├── pages/                      # 30+ feature pages (lazy-loaded)
        │   ├── daily/                  # Stock receipt
        │   ├── payments/               # Dairy payments, salesperson collections
        │   ├── reports/                # 10 report pages + print variants
        │   ├── setup/                  # 9 setup/config pages
        │   └── salesman/              # Salesman-role pages
        └── utils/
            ├── dateUtils.js            # IST-safe date helpers
            ├── constants.js            # Brands, payment modes, brand colors
            ├── productLayout.js        # Category/product sort helpers
            ├── session.js              # Session timeout helpers
            └── numberToWords.js        # Number-to-words (receipts)
```

---

## Engineering Contracts

The codebase is governed by three `CLAUDE.md` contract files:

| File | Scope | Key rules |
|------|-------|-----------|
| [`CLAUDE.md`](./CLAUDE.md) | Root | Balance cascade invariant, product display order, Slack notifications, change checklist |
| [`server/CLAUDE.md`](./server/CLAUDE.md) | Backend | Controller/route split, error handling, balance invariant, migrations, security |
| [`client/CLAUDE.md`](./client/CLAUDE.md) | Frontend | Axios usage, lazy loading, ErrorBoundary, session timeout, state management |

**Read these before contributing.** They define the patterns, anti-patterns, and invariants that every change must satisfy.

### The Change Checklist (from root CLAUDE.md)

Every code change must satisfy all four:

1. **Tests** — Backend: Playwright spec. Frontend: Vitest + RTL spec.
2. **Slack notification** — Every write action needs a `void notifySlack(SLACK_EVENTS.XXX, {...})` call.
3. **Product display order** — Any endpoint/component showing products must sort correctly.
4. **BrandedLoader** — Use `BrandedLoader` for loading states (not generic spinners).

---

## Testing & CI

### Test suites

| Suite | Runner | Location | Count |
|-------|--------|----------|-------|
| Backend API tests | Playwright | `server/tests/playwright/*.spec.js` | ~1164 tests |
| Frontend UI tests | Vitest + RTL | `client/src/**/*.test.jsx` | ~1134 tests |

```bash
# Run everything
cd server && npm test           # Backend
cd client && npm test           # Frontend

# With coverage
cd server && npm run test:coverage
cd client && npm run test:coverage

# Lint
cd server && npm run lint
cd client && npm run lint
```

### CI Pipeline (`.github/workflows/pr-checks.yml`)

Runs on every PR to `main` and push to `develop`. Eight parallel jobs:

| Job | What it checks |
|-----|---------------|
| `tz-lint` | No unsafe `new Date()` in server code |
| `server-lint` | ESLint (flat config) |
| `client-lint` | ESLint (flat config) |
| `server-tests` | Playwright API tests + coverage gate |
| `client-tests` | Vitest UI tests + coverage gate |
| `client-build` | Production build succeeds |
| `openapi-lint` | OpenAPI spec is valid |
| `audit` | Dependency vulnerability scan |

### Coverage thresholds

**Backend** (server):

| Metric | Threshold |
|--------|-----------|
| Lines | 80% |
| Branches | 75% |
| Functions | 80% |

**Frontend** (client):

| Metric | Threshold |
|--------|-----------|
| Statements | 78% |
| Branches | 68% |
| Functions | 70% |
| Lines | 80% |

📖 See the **[Backend Guide § Testing](./server/README.md#testing)** and **[Frontend Guide § Testing](./client/README.md#testing)** for setup patterns, mock strategies, and examples.

---

## Environment Variables

### Server (`server/.env`)

| Variable | Required | Purpose |
|----------|:---:|---------|
| `DATABASE_URL` | prod | Prisma connection string |
| `DIRECT_URL` | — | Direct connection for migrations |
| `DATABASE_CA_CERT` | — | Managed Postgres provider's CA cert (PEM). Pins TLS verification in production; unset falls back to unverified TLS with a boot warning — see `server/utils/dbUrl.js` |
| `JWT_SECRET` | prod | Min 32 chars (enforced at boot in production) |
| `ADMIN_PASSWORD` | prod | Initial admin password |
| `EDIT_PIN` | prod | 4–12 char PIN for protected edits |
| `CLIENT_ORIGIN` | — | Comma-separated CORS origins |
| `NODE_ENV` | — | `development` / `test` / `production` |
| `SLACK_WEBHOOK_URL` | — | Slack incoming webhook (unset = silent) |
| `APP_URL` | — | "Open App" link in Slack card footers |

In development/test, safe defaults are applied. In **production**, required secrets must be present and valid or the server refuses to boot (fail-closed via `config/env.js`).

### Client (`client/.env`)

| Variable | Required | Purpose |
|----------|:---:|---------|
| `VITE_API_BASE_URL` | Yes | Backend base URL (e.g. `http://localhost:3001/api/v1`) |

---

## Deployment

### Backend (Render)

```bash
npm run build           # prisma generate
npm run start:prod      # node index.js
```

Boot sequence: `app.listen()` → `prisma migrate deploy` → `seedFoundationData()` → ready.

Migrations run automatically on every boot. The health endpoint `/health/ready` returns 200 only after migrations and seeding complete.

### Frontend (Vercel)

```bash
npm run build           # produces dist/ with static assets
```

Vercel serves the static output with a rewrite rule routing all paths to `index.html` for client-side routing.

**Resilience features:**
- 60-second Axios timeout (vs 30s default) for Render cold starts
- `ColdStartScreen` overlay when requests take >2s after login
- `ErrorBoundary` auto-reloads on stale chunk errors (one attempt per tab)

---

## API Reference

The full `/api/v1` surface — every route, auth requirement, request/response shape — is documented as an OpenAPI 3.0 spec at [`docs/openapi.yaml`](./docs/openapi.yaml). Paste it into [editor.swagger.io](https://editor.swagger.io) for an interactive browse.

For a quick route overview, see the **[Backend Guide § Route Map](./server/README.md#route-map)**.

---

## Key Design Decisions

### Why no global state library?

React Context handles the only two cross-cutting concerns (auth, notifications). Page state is local. The app has ~30 pages that each manage their own data via `useApiResource`/`useApiResources` hooks — adding Redux would add complexity without solving a real problem.

### Why `product.category` is a string, not a FK?

Historical design decision. Categories are brand-scoped (`unique (brandId, name)`), but `product.category` stores the name directly rather than a `categoryId`. This means Prisma can't sort by `category.displayOrder` in a single query — both backend and frontend use a "catOrderMap" pattern to join and sort in JS.

### Why serializable transactions for balance?

The balance cascade recomputes every subsequent date's balance whenever any transaction changes. Without serializable isolation, concurrent writes to the same brand/salesperson could produce inconsistent cascades (write-skew). The serializable transaction guarantees correctness at the cost of serializing concurrent balance mutations.

### Why fire-and-forget Slack notifications?

Slack delivery should never block a user's API response. `void notifySlack(...)` fires the webhook and doesn't await it. If Slack is down, the operation still succeeds — the notification is best-effort.

### Why a 60-second Axios timeout?

Render's free tier puts the server to sleep after 15 minutes of inactivity. The first request after a cold period can take 30–50 seconds. The `ColdStartScreen` overlay provides user feedback during the wait.

---

## Contributing

1. Read the **[engineering contracts](#engineering-contracts)** (all three `CLAUDE.md` files)
2. Follow the **[change checklist](#the-change-checklist-from-root-claudemd)** for every PR
3. Write tests — no PRs without test coverage for new code
4. Run the full test suite before pushing:
   ```bash
   cd server && npm test
   cd client && npm test
   ```
5. The default development branch is `develop`

📖 Detailed patterns, anti-patterns, and examples are in the sub-guides:
- **[Backend Developer Guide](./server/README.md)**
- **[Frontend Developer Guide](./client/README.md)**
