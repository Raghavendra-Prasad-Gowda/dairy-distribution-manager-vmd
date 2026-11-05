# 🟩 VMD Server — REST API

> Express 5 + Prisma 7 backend for the Vikas Milk Dairy Distribution Manager. Owns validation, authorization,
> business rules and the two cascading ledgers. Deployed to **Render** from this folder.

[⬅️ Repository README](../README.md) · [System docs](../docs/README.md) · [Engineering contract](CLAUDE.md)

| | |
|---|---|
| **Runtime** | Node.js 22 · Express 5 (CommonJS) |
| **Data** | PostgreSQL via Prisma 7 + `@prisma/adapter-pg` |
| **Security** | JWT (2 h) · bcrypt · TOTP MFA (otplib) · helmet · express-rate-limit |
| **Validation** | Zod 4 schemas in `utils/validate.js` |
| **Observability** | Winston + morgan · Slack webhook cards · `/health`, `/health/ready` |
| **Tests** | Playwright (mocked Prisma, c8) here · Java API suite in [`automation/`](automation/README.md) |
| **Base URL** | `/api/v1` |

---

## 🧭 At a glance

```mermaid
flowchart LR
    C([⚛️ SPA / API client]) -->|HTTPS · Bearer JWT| MW[🛡️ Middleware<br/>helmet · CORS · limits · JSON]
    MW --> AU[🔑 authenticate + guards]
    AU --> RT[📍 routes/]
    RT --> CT[🧠 controllers/]
    CT --> SV[⚙️ services/]
    CT --> UT[🧰 utils/]
    SV & CT --> PR[(🔷 Prisma → 🐘 PostgreSQL)]
    CT -. void .-> SL[💬 Slack]
    CT -- AppError --> EH[🚨 global error handler]
```

## ⚡ Quick start

```bash
docker compose up -d                  # from repo root → Postgres on :5434
cd server
npm install                           # also runs prisma generate
cp .env.example .env                  # DATABASE_URL=postgresql://postgres:postgres@localhost:5434/dairy_flow
npx prisma migrate deploy
npm start                             # http://localhost:3001  ·  GET /health
```

| Script | Purpose |
|---|---|
| `npm start` / `npm run start:prod` | Start the API (`node index.js`) |
| `npm run build` | `prisma generate` + write `version.json` |
| `npm test` | Mocked Playwright API specs |
| `npm run test:coverage` | Same, under the c8 coverage gate |
| `npm run lint` · `npm run lint:tz` | ESLint · timezone-safety lint |
| `npm run check` | lint + timezone lint + tests (run before pushing) |
| `npm run format` / `format:check` | Prettier |
| `npm run seed` | Run foundation seed manually |
| `npm run deploy` | `prisma migrate deploy` |

## 🗂️ Folder layout

```
server/
├── app.js · index.js          # app wiring · boot sequence
├── config/                    # env.js (Zod) · logger.js (Winston)
├── middleware/                # auth.js · asyncHandler.js
├── routes/                    # thin routers (one per resource)
├── controllers/               # handlers; dispatches/ and reports/ split by concern
├── services/                  # ledgers, payments, deposits, MFA, lock-out, finalization
├── utils/                     # validation, errors, authz, Slack, dates, layout, bills, pagination …
├── lib/prisma.js              # Prisma singleton
├── prisma/                    # schema.prisma · migrations/ · seed.js
├── scripts/                   # timezone lint · version writer
├── tests/                     # mocked-Prisma Playwright specs + helpers
├── automation/                # 🧪 Java API automation suite (separate Maven project)
└── docs/                      # 📚 this component's documentation
```

## 📚 Documentation

| Document | Contents |
|---|---|
| [🏗️ Architecture](docs/architecture.md) | Layers, middleware order, boot, module dependencies, request flow |
| [📍 API reference](docs/api-reference.md) | Every endpoint, auth, envelope, error codes, pagination |
| [🗃️ Data model & migrations](docs/data-model-and-migrations.md) | Tables, indexes, Prisma 7 setup, migration workflow, seeding |
| [📒 Ledger engine](docs/ledger-engine.md) | Balance formulas, cascade algorithm, deposits, payment date changes |
| [🚚 Dispatch engine](docs/dispatch-engine.md) | Pricing, access resolution, locking, finalization, bills |
| [🔐 Auth & security](docs/auth-and-security.md) | JWT, guards, MFA, lock-out, PINs, rate limits, env safety |
| [💬 Notifications & logging](docs/notifications-and-logging.md) | Slack events, card builder, Winston, health probes |
| [🧪 Testing](docs/testing.md) | Mocked-Prisma specs, helpers, coverage, relation to the API suite |
| [📐 Coding standards](docs/coding-standards.md) | Patterns, anti-patterns, review checklist |
| [🛟 Operations runbook](docs/operations-runbook.md) | Deploy, configure, diagnose, recover |
| [🧪 API automation suite](automation/README.md) | Live black-box API tests against the deployed backend |

## 📐 Non-negotiables

1. 🔁 Ledger rows only via `services/balanceService.js` — pass `tx` inside your own transaction.
2. 🧱 Thin routes · `asyncHandler` · `AppError` · `validate()` + early `return`.
3. 🔐 Guard at the route **and** `assertRole` in the controller; salesmen only see their own data.
4. 🕰️ IST dates via `utils/dateUtils.js`; never `lte: new Date()` in a Prisma filter.
5. 💬 `void notifySlack(...)` on every write.
6. 🧾 Never `new PrismaClient()`, `console.log`, or `process.env` secrets outside `config/env.js`.

Full rules: [CLAUDE.md](CLAUDE.md) · [root CLAUDE.md](../CLAUDE.md)
