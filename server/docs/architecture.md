# 🏗️ Server Architecture

[⬅️ Server README](../README.md) · [System architecture](../../docs/02-system-architecture.md)

---

## 1. 🧅 Layered design

```mermaid
flowchart TB
    subgraph L1["🌐 Transport — app.js"]
        MW[helmet → CORS → morgan → rate limits → cookie-parser → express.json 10 kb]
    end
    subgraph L2["🔑 Access — middleware/auth.js"]
        AUTH[authenticate] --> GUARDS[requireAdmin · requireSuperAdmin · requireAdminOrDispatcher]
    end
    subgraph L3["📍 Routing — routes/*.js"]
        R[path + method + guard + controller ref — no logic]
    end
    subgraph L4["🧠 Application — controllers/"]
        C[validate → authorize → orchestrate → respond → notify]
    end
    subgraph L5["⚙️ Domain — services/"]
        S[balanceService · paymentLedger · depositRules · stockGuard ·<br/>dispatchDayFinalization · mfaService · accountLockService]
    end
    subgraph L6["🧰 Shared — utils/"]
        U[validate · AppError · authz · actor · slack · dateUtils ·<br/>productLayout · billFormat · pagination · mfaCrypto · dbUrl · version]
    end
    subgraph L7["🗄️ Persistence — lib/prisma.js"]
        P[(Prisma singleton → PostgreSQL)]
    end
    L1 --> L2 --> L3 --> L4
    L4 --> L5 --> L7
    L4 --> L6
    L4 --> L7
```

| Layer | May depend on | Must not |
|---|---|---|
| routes | middleware, controllers | contain logic, call Prisma |
| controllers | services, utils, `lib/prisma` | `try/catch`, `throw new Error`, `console.*` |
| services | utils, `lib/prisma` (or a passed `tx`) | read `req`/`res` |
| utils | `config/env`, other utils | depend on controllers |

## 2. 🛡️ Middleware order (`app.js`)

| # | Middleware | Scope | Purpose |
|:-:|---|---|---|
| 1 | `trust proxy = 1` | app | Correct `req.ip` behind Render |
| 2 | `helmet()` | all | Security headers |
| 3 | `cors()` | all | Allow-list from `CLIENT_ORIGIN`, credentials on |
| 4 | `morgan('combined')` → Winston `http` | all | Access log |
| 5 | Global limiter | `/api` | 5 000 / 15 min |
| 6 | Login limiter | `/api/v1/auth/login` | `LOGIN_RATE_LIMIT_MAX` / hour |
| 7 | `cookieParser()` | all | Used only by the crash beacon for attribution |
| 8 | `express.json({ limit: '10kb' })` | all | Body size cap |
| 9 | `GET /`, `/health`, `/health/ready` | public | Liveness, readiness, build identity |
| 10 | `/api/v1/auth`, `/api/v1/errors/client` | public | Sign-in steps, crash beacon |
| 11 | `authenticate` | `/api/v1/*` | Everything below needs a JWT |
| 12 | Mounted routers (+ guards, bulk limiter) | per resource | See [api-reference.md](api-reference.md) |
| 13 | Global error handler | last | Prisma codes, `AppError`, 500 + Slack |

## 3. 🚦 Boot sequence (`index.js`)

```mermaid
flowchart TD
    A[require dotenv] --> B[require app.js → config/env.js<br/>Zod validates · freezes · fails closed in prod]
    B --> C[app.listen PORT]
    C --> D[runMigrations: npx prisma migrate deploy]
    D -- error --> X[💬 SERVER_BOOT_FAILED · exit 1]
    D --> E[seedFoundationData]
    E -- error --> X
    E --> F[💬 SERVER_STARTED with build label]
    F --> G[register SIGTERM/SIGINT → SERVER_SHUTDOWN]
    H[uncaughtException / unhandledRejection] --> Y[💬 PROCESS_CRASH · exit]
```

`resolveFailedMigrations()` exists in `index.js` as a manual recovery helper (marks half-applied migrations as rolled
back) but is intentionally **not** wired into boot.

## 4. 🧩 Module map

```mermaid
flowchart LR
    subgraph Controllers
        SR[stockReceipts] --> BS
        DP[dairyPayments] --> PL
        DT[dairyDepositTopUps]
        DI[dispatches/*] --> BS
        DI --> DF
        SPY[salespersonPayments] --> PL
        SPE[salespeople] --> BS
        RP[reports/*] --> DR
        RP --> LY
        BL[bills] --> BF
        AU[auth] --> MF
        AU --> AL
        AD[adminUsers] --> MF
        PR[products · salespersonPrices · salespersonProducts] --> LY
    end
    subgraph Services
        BS[balanceService] --> DR[depositRules]
        PL[paymentLedger] --> BS
        DF[dispatchDayFinalization]
        MF[mfaService] --> MC[utils/mfaCrypto]
        AL[accountLockService]
        SG[stockGuard · unwired]
    end
    subgraph Utils
        LY[productLayout]
        BF[billFormat] --> LY
    end
```

## 5. 🔁 Request flow (example: save stock receipts)

```mermaid
sequenceDiagram
    autonumber
    participant R as routes/stockReceipts.js
    participant C as stockReceipts.controller
    participant V as utils/validate
    participant P as Prisma (tx)
    participant B as balanceService
    participant S as utils/slack
    R->>C: requireAdmin → bulkCreate (asyncHandler)
    C->>V: validate(schemas.bulkStockReceipt)
    V-->>C: data | null (400 already sent)
    C->>P: $transaction(Serializable)
    P->>P: upsert rows (productId, date, routeId)
    P->>B: recalculateDairyBalance(brandId, date, tx)
    B->>P: cascade forward
    P-->>C: commit
    C-)S: void notifySlack(STOCK_RECEIPT_SAVED)
    C-->>R: 200 { success:true, data }
```

## 6. 📦 Response envelope

```jsonc
// success
{ "success": true, "data": { /* resource or list */ } }
// paginated list (opt-in ?page=&limit=)
{ "success": true, "data": { "items": [], "pagination": { "total": 0, "page": 1, "limit": 20, "pages": 0, "hasMore": false } } }
// failure (global handler)
{ "success": false, "error": "Human-readable message", "code": "DUPLICATE" }
```

## 7. 🗃️ Controllers split by concern

| Barrel | Sub-modules | Responsibility |
|---|---|---|
| `dispatches.controller.js` | `read`, `write`, `lockLifecycle`, `dayFinalization`, `_shared` | Entries, pricing, locking, finalization |
| `reports.controller.js` | `dailyDispatch`, `dairyStatement`, `salespersonStatement`, `stockSummary`, `depositSummary`, `outstanding`, `profitLoss`, `_shared` | Read models |

Split a controller this way when it grows past ~500 lines; keep the barrel so routes do not change.
