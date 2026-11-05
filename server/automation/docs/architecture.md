# 🏗️ API Automation Architecture

[⬅️ Suite README](../README.md) · [Contract](../CLAUDE.md)

---

## 1. 🧅 Layers

```mermaid
flowchart TB
    F["📝 features/api/*.feature<br/>business language · no ids/dates/tokens"]
    subgraph Glue["🧩 Glue (com.vmd.automation)"]
        ST["steps/ — CommonSteps · FixtureSteps · DairySteps · DispatchSteps ·<br/>LedgerSteps · PricingSteps · SalespersonLedgerSteps"]
        API["api/ — health + route steps"]
        FX["fixtures/Fixtures — throwaway entities + undo-actions"]
        HK["hooks/Hooks — evidence · cleanup · run teardown"]
    end
    subgraph Core["⚙️ core/ — knows nothing about VMD endpoints"]
        AC[ApiClient] --- AM[AuthManager / Role]
        AC --- RL[RateLimitRetryFilter]
        AC --- EL[ExchangeLog]
        CL[Cleanup · SalespersonCleanup] --- PH[Placeholders · Dates]
        SPL[SalespersonPool] --- JF[JwtForge]
    end
    CFG[config/TestConfig — env vars] --> Core
    TC[TestContext — per-scenario state] --- Glue
    F --> Glue --> Core --> HTTP((🌐 deployed API))
    RUN[RunCucumberTest — JUnit Platform suite] --> F
```

| Package | Responsibility | Rule |
|---|---|---|
| `features/` | What the business expects | No HTTP details beyond the call line |
| `steps/` | Map sentences to calls/assertions | Thin; delegate to fixtures/core |
| `fixtures/` | Create `E2E-…` data, register undo | Every create has an undo |
| `hooks/` | Lifecycle | Always attempt every cleanup |
| `core/` | Transport, auth, retries, evidence | Endpoint-agnostic |
| `config/` | Settings | Env vars only |

## 2. 🔁 Scenario lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant J as JUnit / Cucumber
    participant H as Hooks
    participant S as Steps
    participant F as Fixtures
    participant A as ApiClient
    participant C as Cleanup
    J->>H: @Before startScenario (fresh TestContext)
    J->>S: Given a throwaway brand "brand"
    S->>F: create E2E-brand-…
    F->>A: POST /brands (superadmin)
    F->>C: register undo (archive brand)
    J->>S: When admin calls "POST …" with: {…${brand.id}…}
    S->>A: Placeholders.resolve → request
    A-->>S: response (logged in ExchangeLog)
    J->>S: Then … assertions
    J->>H: @After attach exchanges if failed
    J->>H: @After run undo-actions newest-first (all attempted)
    J->>H: @AfterAll remove run-scoped users, return pooled salespeople
```

## 3. 🔑 Sessions per role

```mermaid
flowchart LR
    R{Role} -->|ADMIN| CFG1[E2E_ADMIN_* → login once]
    R -->|SUPERADMIN| CFG2[E2E_SUPERADMIN_* → login once<br/>or admin if it is a superadmin]
    R -->|DISPATCHER| RS1[create E2E dispatcher via API → login once]
    R -->|SALESMAN| RS2[create E2E salesman via API → login once]
    R -->|ANONYMOUS| NO[no token]
    CFG1 & CFG2 & RS1 & RS2 --> CACHE[(token cache for the run)]
    MISS[role unavailable] --> SKIP{E2E_STRICT?}
    SKIP -- false --> SK[scenario skipped]
    SKIP -- true --> FAIL[scenario fails]
```

A full run signs in about 15 times — well under the 20/hour/IP limit.

## 4. 🌐 Request pipeline

```mermaid
flowchart LR
    S[step] --> P[Placeholders<br/>alias.field · unique · today±n · repeat:n]
    P --> AC[ApiClient<br/>base URL · JSON · timeouts 30/90 s]
    AC --> RF{RateLimitRetryFilter}
    RF -- 429 & wait < 1 min --> W[wait Retry-After → retry]
    RF -- 502/503/504 on GET --> W2[wake-up retry]
    RF -- 5xx on write --> NR[never retried]
    RF --> EX[ExchangeLog — masked tokens/passwords]
    EX --> API((API))
```

## 5. 🧹 Data hygiene

| Mechanism | Purpose |
|---|---|
| `E2E-…` names (+ `${unique}`) | Identify and isolate test data |
| `Cleanup` undo stack | Delete/archive everything a scenario created, pass or fail |
| Throwaway brand per ledger scenario | Never touch real Nandini/Jersey/Gowardhan balances |
| `SalespersonPool` | Pre-created clean salespeople, ledger reset between borrowers — saves ~4 calls per scenario against the 30/min `/salespeople` limit |
| `SalespersonCleanup` | Removes pooled / throwaway salespeople at run end |
| Archive instead of delete | Brands/products have no delete API; archived rows disappear from lists |
