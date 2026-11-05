# 🏗️ 02 · System Architecture

[⬅️ Product overview](01-product-overview.md) · [Docs index](README.md) · [Next: Domain model ➡️](03-domain-model.md)

---

This document follows the **C4 model**: system context → containers → components, then the runtime views that
matter most (request lifecycle, ledger write, authentication).

## 1. 🌍 System context (C4 level 1)

```mermaid
flowchart TB
    subgraph People
        OWN[👑 Owner<br/>superadmin]
        ADM[🧑‍💼 Office staff<br/>admin]
        DSP[📋 Dispatcher]
        SAL[🛵 Salesperson]
    end

    VMD[[🥛 VMD Distribution Manager]]

    SLACK[💬 Slack<br/>audit + alerts]
    GH[🐙 GitHub<br/>source, CI/CD]
    AUTH[📱 Authenticator app<br/>TOTP]

    OWN & ADM & DSP & SAL -->|use via browser| VMD
    VMD -->|incoming webhook| SLACK
    OWN & ADM -.->|6-digit codes| AUTH
    GH -->|auto-deploy on push| VMD
```

## 2. 📦 Containers (C4 level 2)

```mermaid
flowchart LR
    subgraph Browser["💻 Browser (iPad / phone)"]
        SPA["⚛️ Single-page app<br/>React 19 · React Router 7<br/>Tailwind · jsPDF"]
        LS[(localStorage<br/>JWT + user)]
        SPA --- LS
    end

    subgraph VercelEdge["☁️ Vercel CDN"]
        STATIC[📁 Static assets<br/>client/dist]
    end

    subgraph RenderSvc["☁️ Render web service"]
        API["🟩 REST API<br/>Express 5 · Node 22<br/>Zod · JWT · Winston"]
        PRISMA[🔷 Prisma 7 client<br/>PrismaPg adapter]
        API --- PRISMA
    end

    subgraph AivenDB["☁️ Aiven"]
        PG[(🐘 PostgreSQL<br/>21 models · Prisma migrations)]
    end

    SLACK[💬 Slack]

    STATIC -->|HTML/JS/CSS| SPA
    SPA -->|"HTTPS JSON · /api/v1 · Bearer JWT"| API
    PRISMA -->|TLS · CA-pinned when DATABASE_CA_CERT set| PG
    API -.->|POST webhook, not awaited| SLACK
```

| Container | Technology | Responsibility | Docs |
|---|---|---|---|
| ⚛️ SPA | React 19, Vite 8, React Router 7, Tailwind 3 | UI, role-based routing, print/PDF | [client/README.md](../client/README.md) |
| 🟩 REST API | Express 5, Node 22, Zod 4, jsonwebtoken, otplib | Validation, authorization, business rules, ledgers | [server/README.md](../server/README.md) |
| 🐘 Database | PostgreSQL 16 via Prisma 7 | System of record | [03-domain-model.md](03-domain-model.md) |
| 💬 Slack | Incoming webhook | Audit trail for every write, operational alerts | [09-observability-and-operations.md](09-observability-and-operations.md) |

## 3. 🧱 Components (C4 level 3)

### 3.1 Backend

```mermaid
flowchart TB
    REQ([HTTP request]) --> MW
    subgraph MW["🛡️ Middleware stack (app.js)"]
        H[helmet] --> C[CORS allow-list] --> M[morgan → Winston] --> RL[rate limiters] --> CP[cookie-parser] --> J[express.json 10 kb]
    end
    MW --> AUTHN{authenticate<br/>JWT}
    AUTHN --> GUARD[requireAdmin / requireSuperAdmin /<br/>requireAdminOrDispatcher]
    GUARD --> ROUTES[📍 routes/*.js<br/>thin]
    ROUTES --> CTRL[🧠 controllers/*<br/>validate → authorize → act]
    CTRL --> SVC[⚙️ services/<br/>balanceService · paymentLedger ·<br/>depositRules · mfaService ·<br/>accountLockService · dispatchDayFinalization]
    CTRL --> UTIL[🧰 utils/<br/>validate · productLayout · billFormat ·<br/>pagination · authz · slack]
    SVC & CTRL --> DB[(Prisma → PostgreSQL)]
    CTRL -. void .-> SLACK[💬 notifySlack]
    CTRL -- throw AppError --> ERR[🚨 global error handler]
```

➡️ [server/docs/architecture.md](../server/docs/architecture.md)

### 3.2 Frontend

```mermaid
flowchart TB
    MAIN[main.jsx] --> EB[🧯 ErrorBoundary]
    EB --> BR[BrowserRouter] --> AP[🔑 AuthProvider] --> NP[🔔 NotificationProvider]
    NP --> ROUTES[🗺️ AppRoutes<br/>role-based trees]
    NP --> CS[⏳ ColdStartScreen]
    ROUTES --> LAYOUT[🧭 Layout shell]
    ROUTES --> PRINT[🖨️ /print/* pages]
    LAYOUT --> PAGES[📄 Lazy pages]
    PAGES --> HOOKS[🪝 useApiResource · useMutation]
    HOOKS --> AX[🔌 api/axios.js<br/>JWT · 401 · cold start]
    AX --> API[(REST API)]
```

➡️ [client/docs/architecture.md](../client/docs/architecture.md)

## 4. 🔁 Runtime views

### 4.1 Request lifecycle (authenticated write)

```mermaid
sequenceDiagram
    autonumber
    participant UI as ⚛️ SPA
    participant AX as 🔌 axios
    participant API as 🟩 Express
    participant V as ✅ Zod validate
    participant C as 🧠 Controller
    participant DB as 🐘 PostgreSQL
    participant S as 💬 Slack

    UI->>AX: mutate(payload)
    AX->>API: POST /api/v1/... + Bearer JWT
    API->>API: helmet · CORS · rate limit · JSON parse
    API->>API: authenticate → req.user
    API->>API: requireAdmin (mount guard)
    API->>C: route handler (asyncHandler)
    C->>V: validate(schemas.x, req, res)
    alt invalid
        V-->>UI: 400 { success:false, error }
    end
    C->>C: assertRole / ownership check
    C->>DB: $transaction (Serializable)
    DB-->>C: rows
    C-)S: void notifySlack(EVENT, data)
    C-->>UI: 200/201 { success:true, data }
    Note over C,API: Any thrown error → global handler<br/>(AppError → status · Prisma code → 400/404 · else 500 + Slack)
```

### 4.2 Ledger write with cascade

```mermaid
sequenceDiagram
    autonumber
    participant C as Controller
    participant TX as Serializable tx
    participant BS as balanceService
    participant DB as PostgreSQL

    C->>TX: begin
    TX->>DB: upsert stock receipts / dispatch / payment
    TX->>BS: recalculate*Balance(id, date, tx)
    BS->>DB: compute day D from (D−1 closing + day's movements)
    BS->>DB: upsert balance(D)
    loop every later balance date
        BS->>DB: recompute + upsert balance(D+n)
    end
    TX->>DB: commit
    Note over TX,DB: Concurrent writers on the same ledger serialize —<br/>a conflict aborts and the request fails cleanly
```

➡️ [04-business-workflows.md § Ledgers](04-business-workflows.md#2-the-cascading-ledgers)

### 4.3 Authentication

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant UI as SPA
    participant API as /auth
    U->>UI: username + password
    UI->>API: POST /auth/login
    alt admin with MFA enabled
        API-->>UI: { mfaVerifyRequired, mfaToken (5 min) }
        U->>UI: 6-digit TOTP or backup code
        UI->>API: POST /auth/mfa/verify
    else MFA required but not enrolled
        API-->>UI: { mfaSetupRequired, mfaToken }
        UI->>API: POST /auth/mfa/setup-required → QR
        UI->>API: POST /auth/mfa/confirm-required
    end
    API-->>UI: { accessToken (JWT 2 h), role, ... }
    UI->>UI: localStorage + 2 h session timer
```

➡️ [05-security.md](05-security.md)

## 5. 🧰 Technology stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| UI framework | React | 19 | Team familiarity, ecosystem, concurrent rendering |
| Build | Vite | 8 | Fast dev server, simple config, code-splitting |
| Routing | React Router | 7 | Nested role-based route trees |
| Styling | Tailwind CSS (+ clsx, tailwind-merge) | 3 | Utility-first, no CSS drift |
| PDF | jsPDF | 4 | Vector bill PDFs in the browser |
| API | Express | 5 | Minimal, native async error support |
| Validation | Zod | 4 | One schema = parse + type + message |
| ORM | Prisma (+ `@prisma/adapter-pg`) | 7 | Typed queries, migrations, transactions |
| Auth | jsonwebtoken, bcrypt, otplib, qrcode | — | JWT sessions, hashed secrets, TOTP MFA |
| Logging | Winston + morgan | 3 | Structured JSON in production |
| Hosting | Vercel · Render · Aiven | — | Managed, auto-deploy from Git |
| Tests | Vitest + RTL · Playwright · Cucumber + REST Assured | — | One tool per layer (see [07](07-quality-and-testing.md)) |

## 6. 🧭 Architectural principles

| Principle | How it is applied |
|---|---|
| **Thin edges, rich core** | Routes only wire; controllers orchestrate; services own shared domain logic |
| **Fail fast** | Zod at the boundary, env validated at boot, production refuses to start without secrets |
| **Single source of truth** | Ledger formula in `balanceService`, deposit rule in `depositRules`, sort in `productLayout` |
| **Consistency over throughput** | Serializable transactions for every ledger mutation |
| **Server is the authority** | Prices, permissions, locks and dates are decided server-side |
| **Observable by default** | Every write produces an audit card; every crash produces an alert |
| **Stateless API** | JWT in a header; any instance can serve any request |

➡️ Rationale for each decision: [11-architecture-decisions.md](11-architecture-decisions.md)
