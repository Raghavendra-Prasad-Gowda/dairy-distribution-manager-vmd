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
