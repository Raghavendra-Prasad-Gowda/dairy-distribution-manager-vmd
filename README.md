# Vikas Milk Dairy — Distribution Manager (VMD)

A production business-management system for Vikas Milk Dairy. It tracks multi-brand
stock receipt, cascading daily balance ledgers per brand and per salesperson,
dispatch and collection, and financial reporting.

- **Frontend** — React 19 + Vite, deployed to Vercel
- **Backend** — Node.js / Express 5, deployed to Render
- **Database** — PostgreSQL (Aiven) via Prisma

> Engineering conventions are the contract in [`CLAUDE.md`](./CLAUDE.md) (root),
> [`server/CLAUDE.md`](./server/CLAUDE.md) and [`client/CLAUDE.md`](./client/CLAUDE.md).
> Read those before contributing — they define the balance-cascade invariant,
> the error-handling pattern, the product-layout sort, and more.

---

## Architecture at a glance

```
client/  React 19 SPA        →  Vercel
server/  Express 5 REST API  →  Render        (all routes under /api/v1)
         Prisma ORM          →  PostgreSQL (Aiven)
```

- **Auth**: JWT (httpOnly cookie + bearer), 2-hour sessions. Roles:
  `superadmin`, `admin`, `dispatcher`, `salesman`.
- **Money core**: every ledger write goes through `server/services/balanceService.js`,
  which recomputes and cascades balances forward inside a **serializable** transaction.
  Never write balance rows directly.
- **Config**: all server secrets/tunables are read through `server/config/env.js`,
  which validates the environment with Zod at boot and **fails closed in production**.

---

## Prerequisites

- Node.js 20+
- A PostgreSQL database (or use the bundled `docker-compose.yml` for local Postgres)

---

## Local development

### 1. Database (optional local Postgres)

```bash
docker compose up -d        # starts Postgres on localhost:5432 (db: dairy_flow)
```

### 2. Backend

```bash
cd server
npm install
cp .env.example .env        # fill DATABASE_URL, JWT_SECRET (32+ chars), ADMIN_PASSWORD, EDIT_PIN
npx prisma migrate deploy   # apply migrations
npm run seed                # seed brands + initial admin user
npm start                   # http://localhost:3001
```

Health probes: `GET /health` (liveness), `GET /health/ready` (readiness — checks DB).

### 3. Frontend

```bash
cd client
npm install
# .env: VITE_API_BASE_URL=http://localhost:3001/api/v1
npm run dev                 # http://localhost:5173
```

---

## Environment variables

### Server (`server/.env`)

| Variable | Required | Purpose |
|----------|:---:|---------|
| `DATABASE_URL` | prod | Prisma connection string |
| `DIRECT_URL` | – | Direct connection for migrations |
| `JWT_SECRET` | prod | Min 32 chars (enforced at boot in production) |
| `ADMIN_PASSWORD` | prod | Initial admin password |
| `EDIT_PIN` | prod | 4–12 char PIN for protected edits (no default in production) |
| `CLIENT_ORIGIN` | – | Comma-separated CORS origins |
| `NODE_ENV` | – | `development` / `test` / `production` |
| `SLACK_WEBHOOK_URL` | – | Slack incoming webhook (unset = silent) |
| `APP_URL` | – | "Open App" link in Slack card footers |

In development/test, safe defaults are applied. In **production** the required
secrets above must be present and valid or the server refuses to boot.

### Client (`client/.env`)

| Variable | Required | Purpose |
|----------|:---:|---------|
| `VITE_API_BASE_URL` | Yes | Backend base URL (e.g. `http://localhost:3001/api/v1`) |

---

## API reference

The full `/api/v1` surface — every route, auth requirement, request/response shape
— is documented as an OpenAPI 3.0 spec at [`docs/openapi.yaml`](./docs/openapi.yaml).
Paste it into [editor.swagger.io](https://editor.swagger.io) or open it in any
OpenAPI-aware tool for an interactive browse.

---

## Testing & quality

```bash
# Backend — Playwright API tests against mock Prisma
cd server && npm test          # or: npm run check  (lint + tz-lint + tests)
npm run lint                   # ESLint (flat config)
npm run format                 # Prettier write

# Frontend — Vitest + React Testing Library
cd client && npm test
npm run lint                   # ESLint
npm run build                  # production build
```

CI (`.github/workflows/pr-checks.yml`) runs on every PR to `main`:
timezone-safety lint, server ESLint, client ESLint, server API tests + coverage
gate, client UI tests + coverage gate, a client production build, an OpenAPI
spec lint, and a dependency vulnerability scan.

---

## Project layout

```
server/
  app.js            middleware stack, route registration, global error handler
  index.js          boot: listen → migrate → seed
  config/env.js     validated, frozen environment config (fail-closed in prod)
  controllers/      one file per resource — all handler logic
  routes/           thin routers (path + method + controller ref only)
  services/         balanceService, depositRules, stockGuard, dispatchDayFinalization
  utils/            validate (Zod), AppError, slack, dateUtils, actor, authz, productLayout
  prisma/           schema.prisma, migrations, seed.js
  tests/playwright/ API tests

client/
  src/
    api/axios.js    shared Axios instance (JWT interceptors) — always use this
    context/        AuthContext, NotificationContext
    components/     Layout, ErrorBoundary, shared UI kit
    pages/          feature pages (daily, payments, reports, setup, salesman)
    utils/          dateUtils (IST-safe), constants
```

---

## Deployment

- **Backend (Render)**: `npm run build` (prisma generate) then `npm run start:prod`;
  `prisma migrate deploy` runs on boot.
- **Frontend (Vercel)**: `npm run build` → static output.

See the docs on Claude Code on the web for how the remote execution
environment is configured: https://code.claude.com/docs/en/claude-code-on-the-web
