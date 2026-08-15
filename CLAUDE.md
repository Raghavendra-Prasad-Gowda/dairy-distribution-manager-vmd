# CLAUDE.md — Vikas Milk Dairy Distribution Manager

> This document is the engineering contract for this codebase.
> All code changes MUST comply with every section below.

---

## 1. System Overview

**Dairy Distribution Manager (VMD)** is a production business management system for Vikas Milk Dairy. It tracks:
- Multi-brand stock receipt (Nandini, Jersey, Gowardhan) with per-route entry for Nandini
- Cascading daily balance ledger per brand (opening + stock − payments = closing)
- Salesperson dispatch and collection tracking with cascading balance ledger
- Financial reports and outstanding balances

**Live deployment:**
- Frontend → Vercel (React 19 + Vite)
- Backend → Render (Node.js/Express 5)
- Database → Aiven (PostgreSQL)

---

## 2. Repository Structure

```
dairy-distribution-manager-vmd/
├── CLAUDE.md                          # This file — root engineering contract
├── docker-compose.yml                 # Local dev Postgres
├── .github/workflows/pr-checks.yml   # CI on every PR to main
│
├── server/                            # Express 5 backend
│   ├── CLAUDE.md                      # Backend engineering contract
│   ├── app.js                         # Middleware stack, route registration, error handler
│   ├── index.js                       # Entry point: listen → migrate → seed → ready
│   ├── controllers/                   # Business logic (one file per resource)
│   ├── routes/                        # Thin route definitions (middleware + controller refs)
│   ├── middleware/
│   │   ├── auth.js                    # JWT verification
│   │   └── asyncHandler.js            # Async error propagation
│   ├── services/
│   │   ├── balanceService.js          # Cascading balance recalculation (serializable tx)
│   │   └── stockGuard.js              # Dispatch stock availability check
│   ├── utils/
│   │   ├── validate.js                # All Zod schemas + validate() + parseId()
│   │   ├── AppError.js                # Operational error class
│   │   └── constants.js               # JWT_EXPIRES_IN, BCRYPT_ROUNDS
│   ├── lib/prisma.js                  # Singleton Prisma client — ALWAYS import this
│   ├── config/logger.js               # Winston — use instead of console.log
│   └── prisma/
│       ├── schema.prisma              # Single source of truth for all DB models
│       ├── migrations/                # Never edit migration files manually
│       └── seed.js                    # Seeds admin user only
│
└── client/                            # React 19 frontend
    ├── CLAUDE.md                      # Frontend engineering contract
    └── src/
        ├── App.jsx                    # Route tree, ProtectedRoute, ErrorBoundary
        ├── api/axios.js               # Shared Axios instance — ALWAYS use this
        ├── context/
        │   ├── AuthContext.jsx        # Auth state, 12h session, useAuth() hook
        │   └── NotificationContext.jsx
        ├── components/
        │   └── ErrorBoundary.jsx      # Catches chunk errors + unexpected crashes
        ├── pages/                     # Route-level page components
        └── utils/
            ├── dateUtils.js           # India timezone helpers — ALWAYS use these
            └── constants.js
```

---

## 3. Engineering Principles

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

## 4. Required Patterns

### Controller pattern (backend)
```js
// controllers/products.controller.js
const getAll = asyncHandler(async (req, res) => {
  const products = await prisma.product.findMany({ where: { isActive: true } });
  res.json({ success: true, data: products });
});
module.exports = { getAll };

// routes/products.js (thin)
router.get('/', controller.getAll);
```

### Route pattern (backend)
```js
// routes/products.js
const controller = require('../controllers/products.controller');
router.get('/',    controller.getAll);
router.post('/',   controller.create);
router.put('/:id', controller.update);
```

### Date handling (frontend)
```js
// ✅ CORRECT
import { getIndiaDate } from '../utils/dateUtils';
const today = getIndiaDate(); // "2026-04-30" in IST

// ❌ WRONG
const today = new Date().toISOString().slice(0, 10); // machine timezone
```

### API calls (frontend)
```js
// ✅ CORRECT — uses auth interceptors
import api from '../api/axios';
const res = await api.get('/brands');

// ❌ WRONG — bypasses JWT
import axios from 'axios';
```

---

## 5. What NOT to Do

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

---

## 6. Balance Calculation — Critical Concept

Every stock receipt save, payment create/update/delete triggers `recalculateDairyBalance()` or `recalculateSalespersonBalance()`. These cascade forward through all subsequent dates in a **serializable transaction** to ensure correct propagation of retroactive changes.

Formula: `closingBalance = openingBalance + stockValue − amountPaid`

Never bypass `balanceService` to write balance records directly.

---

## 7. Local Development

```bash
# Backend
cd server && npm install
cp .env.example .env   # fill DATABASE_URL, JWT_SECRET, ADMIN_PASSWORD, EDIT_PIN
npx prisma migrate deploy
npm start              # http://localhost:3001

# Frontend
cd client && npm install
# .env: VITE_API_BASE_URL=http://localhost:3001/api/v1
npm run dev            # http://localhost:5173
```

---

## 8. Environment Variables

### Server
| Variable | Required | Purpose |
|----------|:---:|---------|
| `DATABASE_URL` | Yes | Prisma connection string |
| `DIRECT_URL` | Yes | Direct connection for migrations |
| `JWT_SECRET` | Yes | Min 32 chars |
| `ADMIN_PASSWORD` | Yes | Initial admin password |
| `EDIT_PIN` | Yes | 6-digit PIN for protected edits |
| `CLIENT_ORIGIN` | Yes | Comma-separated CORS origins |
| `NODE_ENV` | Yes | `development` or `production` |

### Client
| Variable | Required | Purpose |
|----------|:---:|---------|
| `VITE_API_BASE_URL` | Yes | Backend base URL |

---

## 9. Git Standards

- **Never force-push `main`**
- Feature branches: `feat/<description>`
- Bug fixes: `fix/<description>`
- Commit messages: imperative mood, present tense, max 72 chars
- PRs to `main` run CI automatically (`.github/workflows/pr-checks.yml`)

---

## 10. Change Checklist — Rules for Every Code Change

Every feature addition, bug fix, or refactor MUST satisfy all four rules below before being committed. These are not optional.

---

### 10.1 Tests are mandatory

Every change ships with tests. No exceptions.

**Backend — Playwright integration tests** (`server/tests/playwright/<resource>.spec.js`):
- New endpoint → new `test.describe` block covering auth, validation, and the happy path
- Bug fix → add a test that would have caught the bug (pin the broken behavior, show the fix)
- New Prisma call added to an existing handler → add `test.beforeEach` mock for that call inside the affected `test.describe` so existing tests don't get unexpected 500s

**Frontend — Vitest + React Testing Library** (`client/src/pages/**/*.test.jsx`):
- New UI behaviour → new `it()` case in the matching test file
- New component → matching `*.test.jsx` file
- Bug fix → a test reproducing the broken render, proving the fix

**Run before committing:**
```bash
# Backend
cd server && npx playwright test

# Frontend
cd client && npx vitest run
```

---

### 10.2 Slack notifications for every write action

Every endpoint that creates, updates, or deletes business data MUST fire a Slack notification. Read-only (GET) endpoints are excluded.

**Pattern:**
```js
// Always fire non-blocking (void, never await).
void notifySlack(SLACK_EVENTS.DISPATCH_SAVED, {
  salespersonName: sp.name,
  date:            data.dispatchDate,
  totalAmount:     grandTotal,
  by:              actingUsername,
});
```

**Adding a new event:**
1. Add the key to `SLACK_EVENTS` in `server/utils/slack.js`
2. Add a color entry in `EVENT_COLOR` (GREEN = create, AMBER = update, RED = delete)
3. Add a card-builder case in the `buildCard()` switch to define the Slack message fields

**Do NOT:**
- `await notifySlack(...)` — Slack must never slow down the API response
- Skip the Slack call on error paths — fire it on success only (after the DB write succeeds)
- Reuse an existing event for a semantically different action — add a new event key instead

---

### 10.3 Product display order must follow dairy layout settings

Any list of products — in API responses, rendered tables, dropdowns, or expandable sections — MUST be ordered:

> **brand.displayOrder → category.displayOrder → product.displayOrder → product.name**

**Why JS sort is required:** `category` is a plain string column on the `product` table (not a Prisma relation), so Prisma cannot sort by `category.displayOrder` in a single query. Always fetch `category` rows and sort in application code.

**Canonical backend pattern:**
```js
const [products, categories] = await Promise.all([
  prisma.product.findMany({
    orderBy: [{ brand: { displayOrder: 'asc' } }, { displayOrder: 'asc' }, { name: 'asc' }],
  }),
  prisma.category.findMany({ select: { brandId: true, name: true, displayOrder: true } }),
]);

// Build lookup: "brandId::categoryName" → displayOrder
const catOrder = new Map(categories.map(c => [`${c.brandId}::${c.name}`, c.displayOrder]));

products.sort((a, b) =>
  (a.brand.displayOrder  - b.brand.displayOrder) ||
  ((catOrder.get(`${a.brandId}::${a.category}`) ?? 999) -
   (catOrder.get(`${b.brandId}::${b.category}`) ?? 999)) ||
  (a.displayOrder - b.displayOrder) ||
  a.name.localeCompare(b.name)
);
```

**API responses** that expose a product list MUST include `categoryDisplayOrder` (computed from the catOrder map) so the frontend can re-sort or group without an extra round-trip.

**Frontend pattern** — when the API already returns `categoryDisplayOrder`:
```js
products.sort((a, b) =>
  (a.brandDisplayOrder      - b.brandDisplayOrder)      ||
  (a.categoryDisplayOrder   - b.categoryDisplayOrder)   ||
  (a.displayOrder           - b.displayOrder)           ||
  a.productName.localeCompare(b.productName)
);
```

**When grouping into sections** (brand header → category sub-header → product rows), always sort the section arrays — never rely on insertion order or `Object.entries()` key order.

---

### 10.4 Use BrandedLoader for all loading states

The app's branded tumbler spinner is `client/src/components/ui/BrandedLoader.jsx`. Use it for every loading state the user sees while waiting. **Do not** hand-roll a spinner with `animate-spin` or any other ad-hoc approach.

**Import:**
```jsx
import BrandedLoader from '../../components/ui/BrandedLoader';
```

**When to use which mode:**

| Situation | Usage |
|---|---|
| Page-level data load (content area is empty) | `<BrandedLoader />` |
| Save / submit in progress (page stays visible) | `<BrandedLoader overlay label="Saving…" />` |
| Full-screen gate (app booting, auth loading) | `<BrandedLoader overlay tone="brand" />` |
| Modal action in progress | `<BrandedLoader overlay tone="transparent" label="Processing…" />` |
| Section reload inside a loaded page | `<BrandedLoader size="sm" inlinePadY="py-8" />` |

**Do NOT use `BrandedLoader` for:**
- Tiny in-button loading indicators — use `<Loader2 className="animate-spin" />` from `lucide-react` instead
- Skeleton screens — keep those as-is where they already exist

**Props reference:**

| Prop | Default | Purpose |
|---|---|---|
| `overlay` | `false` | Fixed full-screen overlay with backdrop |
| `open` | `true` | When `false` on an overlay, renders nothing (use for conditional overlay) |
| `label` | `"Loading…"` | Status text shown below the mark (uppercased automatically) |
| `hideBrand` | `false` | Suppress "Vikas Milk Dairy" wordmark |
| `size` | `"md"` | `"sm"` / `"md"` / `"lg"` |
| `tone` | `"card"` | Overlay background: `"card"` (white card), `"brand"` (green), `"transparent"` (dim blur) |
| `lively` | `false` | Adds sonar-ping ring for high-urgency states |
