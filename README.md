# 🥛 Vikas Milk Dairy — Distribution Manager (VMD)

> A production business-management platform for **Vikas Milk Dairy**: multi-brand stock receipt, cascading
> dairy and salesperson ledgers, daily dispatch and collections, printed bills, and financial reporting.

| | |
|---|---|
| **Status** | 🟢 In production |
| **Frontend** | React 19 · Vite 8 · Tailwind CSS 3 → **Vercel** |
| **Backend** | Node.js 22 · Express 5 · Prisma 7 → **Render** |
| **Database** | PostgreSQL → **Aiven** |
| **Quality gates** | ESLint · Vitest · Playwright (mocked API) · Cucumber + REST Assured (live API) · Playwright (live UI) |
| **Branching** | `feat/*` → `develop` (testing) → release PR → `main` (production) |

---

## 📑 Table of contents

1. [What the system does](#-what-the-system-does)
2. [Architecture at a glance](#-architecture-at-a-glance)
3. [Repository map](#-repository-map)
4. [Documentation library](#-documentation-library)
5. [Quick start](#-quick-start)
6. [Delivery pipeline](#-delivery-pipeline)
7. [Engineering contracts](#-engineering-contracts)
8. [Support & ownership](#-support--ownership)

---

## 🎯 What the system does

```mermaid
flowchart LR
    D[(🏭 Dairy brands<br/>Nandini · Jersey · Gowardhan)] -- stock + invoices --> VMD
    VMD -- payments + deposits --> D
    VMD{{🥛 Vikas Milk Dairy<br/>distribution business}} -- daily dispatch --> S[🛵 Salespeople]
    S -- cash collections --> VMD
    S -- deliveries --> R[🏪 Retailers / customers]
```

| Capability | Summary |
|---|---|
| 📦 **Stock receipt** | Record what each dairy brand delivered each day (per route for Nandini) |
| 📒 **Dairy ledger** | Per-brand cascading balance: opening + stock + deposit + top-up − payments = closing |
| 🚚 **Dispatch** | Stock handed to each salesperson per day, priced per salesperson, with a submit/lock lifecycle |
| 💰 **Collections** | Cash collected from salespeople feeds a second cascading ledger |
| 🧾 **Bills** | Numbered, frozen cash/credit bills generated for a salesperson and period, printed as PDF |
| 📊 **Reports** | Statements, stock summaries, dispatch sheet, deposit, outstanding, profit & loss |
| 🔐 **Governance** | Four roles, TOTP MFA, account lock-out, edit PIN, Slack audit trail for every write |

➡️ Full business description: [docs/01-product-overview.md](docs/01-product-overview.md)

---

## 🏗️ Architecture at a glance

```mermaid
flowchart TB
    subgraph Users["👥 Users"]
        A[🧑‍💼 Admin / Superadmin<br/>iPad]
        DSP[📋 Dispatcher<br/>iPad]
        SM[🛵 Salesman<br/>phone]
    end

    subgraph Vercel["☁️ Vercel"]
        SPA[⚛️ React 19 SPA<br/>client/]
    end

    subgraph Render["☁️ Render"]
        API[🟩 Express 5 REST API<br/>server/ · /api/v1]
    end

    subgraph Aiven["☁️ Aiven"]
        DB[(🐘 PostgreSQL)]
    end

    SLACK[💬 Slack webhook]

    A & DSP & SM -->|HTTPS| SPA
    SPA -->|JSON + Bearer JWT| API
    API -->|Prisma · serializable tx| DB
    API -. fire-and-forget audit cards .-> SLACK
    SPA -. crash beacon .-> API
```

➡️ Deep dive: [docs/02-system-architecture.md](docs/02-system-architecture.md)

---

## 🗂️ Repository map

```
dairy-distribution-manager-vmd/
├── 📄 README.md              ← you are here
├── 📚 docs/                  ← system-wide documentation (architecture, domain, security, delivery …)
├── 🟩 server/                ← Express API  ·  README + server/docs/
│   └── 🧪 automation/        ← Java API automation suite  ·  README + docs/
├── ⚛️ client/                ← React SPA  ·  README + client/docs/
│   └── 🎭 automation-ui/     ← Playwright UI automation suite  ·  README + docs/
├── ⚙️ .github/               ← CI/CD workflows, helper scripts, Dependabot, CODEOWNERS
├── 🐳 docker-compose.yml     ← local PostgreSQL
└── 🤖 CLAUDE.md              ← engineering contract (one per component)
```

---

## 📚 Documentation library

Documentation is layered: **system → component → module**. Start at the level you need.

```mermaid
flowchart TD
    R[📄 README.md] --> DOCS[📚 docs/]
    R --> SV[🟩 server/README.md]
    R --> CL[⚛️ client/README.md]
    SV --> SVD[server/docs/]
    SV --> API[🧪 server/automation/README.md]
    API --> APID[server/automation/docs/]
    CL --> CLD[client/docs/]
    CL --> UI[🎭 client/automation-ui/README.md]
    UI --> UID[client/automation-ui/docs/]
```

### 🌐 System level — [`docs/`](docs/README.md)

| # | Document | What you will learn |
|---|---|---|
| 01 | [🎯 Product overview](docs/01-product-overview.md) | Business context, users, capabilities, daily operating rhythm |
| 02 | [🏗️ System architecture](docs/02-system-architecture.md) | Context & container views, request lifecycle, technology choices |
| 03 | [🗃️ Domain model](docs/03-domain-model.md) | Entity-relationship diagram and the meaning of every entity |
| 04 | [🔄 Business workflows](docs/04-business-workflows.md) | Stock receipt, dispatch, collections, ledgers, bills, day finalization |
| 05 | [🔐 Security model](docs/05-security.md) | Roles, JWT, MFA, lock-out, PINs, rate limits, data protection |
| 06 | [☁️ Environments & deployment](docs/06-environments-and-deployment.md) | Hosting topology, configuration, boot, cold starts, versioning |
| 07 | [🧪 Quality & testing strategy](docs/07-quality-and-testing.md) | Test pyramid, what runs where, coverage gates |
| 08 | [🚀 CI/CD & release management](docs/08-ci-cd-and-release.md) | Pipelines, quality gates, release and hotfix flow |
| 09 | [📡 Observability & operations](docs/09-observability-and-operations.md) | Logging, Slack audit, health probes, incident runbook |
| 10 | [🤝 Contributing guide](docs/10-contributing.md) | Branching, commits, PR checklist, definition of done |
| 11 | [🧭 Architecture decisions](docs/11-architecture-decisions.md) | ADR log — why the system is built the way it is |
| 12 | [📖 Glossary](docs/12-glossary.md) | Business and technical vocabulary |
| — | [🛠️ Release pipeline setup](docs/release-pipeline.md) | One-time GitHub / Vercel / Render setup and troubleshooting |
| — | [📘 OpenAPI spec](docs/openapi.yaml) | Machine-readable API contract (linted in CI) |

### 🧩 Component level

| Component | Guide | Docs |
|---|---|---|
| 🟩 Backend API | [server/README.md](server/README.md) | [server/docs/](server/docs/) |
| ⚛️ Frontend SPA | [client/README.md](client/README.md) | [client/docs/](client/docs/) |
| 🧪 API automation | [server/automation/README.md](server/automation/README.md) | [server/automation/docs/](server/automation/docs/) |
| 🎭 UI automation | [client/automation-ui/README.md](client/automation-ui/README.md) | [client/automation-ui/docs/](client/automation-ui/docs/) |

---

## ⚡ Quick start

**Prerequisites:** Node.js 22, npm, Docker (or any PostgreSQL 16). Java 21 + Maven only for the API automation suite.

```bash
# 1️⃣  Database  →  postgresql://postgres:postgres@localhost:5434/dairy_flow
docker compose up -d

# 2️⃣  Backend  →  http://localhost:3001
cd server
npm install
cp .env.example .env          # set DATABASE_URL, JWT_SECRET, EDIT_PIN, SUPERADMIN_USERNAME/PASSWORD
npx prisma migrate deploy
npm start

# 3️⃣  Frontend →  http://localhost:5173
cd ../client
npm install
echo "VITE_API_BASE_URL=http://localhost:3001/api/v1" > .env
npm run dev

# 4️⃣  Tests
cd ../server && npm run check   # lint + timezone lint + mocked API specs
cd ../client && npm test        # Vitest + React Testing Library
```

Sign in with the superadmin credentials you set in `server/.env`, then create brands, categories, products,
routes and salespeople from the **Setup** menus.

➡️ Full setup per component: [server/README.md](server/README.md) · [client/README.md](client/README.md)

---

## 🚀 Delivery pipeline

```mermaid
flowchart LR
    F[🌿 feat/* branch] -->|PR| PC{✅ pr-checks}
    PC -->|green → auto-merge| DEV[(develop)]
    DEV -->|auto-deploy| TEST[🧪 Testing env]
    TEST --> SP[staging-pipeline<br/>API → UI automation]
    SP -->|Staging Verified| REL[📝 Release PR<br/>develop → main]
    REL -->|👤 approval + merge commit| MAIN[(main)]
    MAIN -->|auto-deploy| PROD[🏭 Production]
    PROD --> PV[production-verify<br/>read-only smoke]
    PV --> TAG[🏷️ vX.Y.Z release]
```

➡️ [docs/08-ci-cd-and-release.md](docs/08-ci-cd-and-release.md) · one-time setup: [docs/release-pipeline.md](docs/release-pipeline.md)

---

## 📐 Engineering contracts

Every component has a `CLAUDE.md` file with **binding** rules for humans and AI assistants alike. Documentation
explains; the contracts decide.

| Contract | Scope |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Whole system — route map, ledger rules, Slack catalogue, change checklist |
| [server/CLAUDE.md](server/CLAUDE.md) | Backend structure, errors, authorization, migrations, security |
| [client/CLAUDE.md](client/CLAUDE.md) | Frontend structure, data access, routing, loaders |
| [server/automation/CLAUDE.md](server/automation/CLAUDE.md) | API automation rules and tags |
| [client/automation-ui/CLAUDE.md](client/automation-ui/CLAUDE.md) | UI automation rules and devices |

**The five rules that matter most**

1. 🔁 Ledger balances are never written directly — always through `server/services/balanceService.js`.
2. 🕰️ Business dates are **IST** — use the `dateUtils` helpers on both tiers, never a bare `new Date()`.
3. 🧱 Routes are thin, controllers use `asyncHandler` + `AppError`, inputs are validated with Zod.
4. 💬 Every write emits a fire-and-forget Slack card.
5. 🧪 Every change ships with tests at the right layer (see [docs/07](docs/07-quality-and-testing.md)).

---

## 🛟 Support & ownership

| Topic | Where |
|---|---|
| Code owner | `.github/CODEOWNERS` (requested on every PR) |
| Production incidents | [docs/09-observability-and-operations.md](docs/09-observability-and-operations.md) |
| Pipeline problems | [docs/release-pipeline.md § Troubleshooting](docs/release-pipeline.md#troubleshooting) |
| Dependency updates | Dependabot (weekly, grouped minor/patch) → `develop` |
