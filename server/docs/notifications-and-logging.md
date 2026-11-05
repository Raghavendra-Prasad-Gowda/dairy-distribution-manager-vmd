# 💬 Notifications & Logging

[⬅️ Server README](../README.md) · System view: [docs/09-observability-and-operations.md](../../docs/09-observability-and-operations.md)

---

## 1. 💬 Slack pipeline (`utils/slack.js`)

```mermaid
sequenceDiagram
    autonumber
    participant C as Controller
    participant N as notifySlack(event, data)
    participant E as enrichData
    participant B as buildCard
    participant S as Slack webhook
    C-)N: void notifySlack(EVENT, { …, brandId?, salespersonId? })
    Note over C: response is sent immediately
    N->>N: SLACK_WEBHOOK_URL unset? → return
    N->>E: brandId → brandName · salespersonId → salespersonName
    E->>B: Block Kit card (header · fields · text · footer with IST time + APP_URL)
    B->>S: POST (8 s timeout)
    alt failure
        N->>N: logger.warn — never throws
    end
```

| Building block | Helper |
|---|---|
| Title | `headerBlock(text)` |
| Key/value grid | `fieldsBlock([[label, value], …])` |
| Free text | `textBlock(md)` — escape user input with `escapeSlack` |
| Separator | `dividerBlock()` |
| Footer | `footerBlock()` — IST timestamp + "Open App" link |
| Wrapper | `card(event, blocks, fallbackText, colorOverride?)` |
| Formatting | `formatINR`, `formatDate`, `istNow`, `joinNames` |

### Adding an event

```mermaid
flowchart LR
    A[1 SLACK_EVENTS key] --> B[2 EVENT_COLOR<br/>GREEN create · AMBER update · RED delete]
    B --> C[3 case in buildCard]
    C --> D[4 void notifySlack in controller]
    D --> E[5 slack.spec.js card test]
    E --> F[6 catalogue in root CLAUDE.md §10]
```

### Event families

| Family | Events |
|---|---|
| 🖥️ System | `SERVER_STARTED`, `SERVER_SHUTDOWN`, `SERVER_BOOT_FAILED`, `SERVER_ERROR`, `PROCESS_CRASH`, `CLIENT_ERROR` |
| 🔑 Auth / PIN / MFA | `LOGIN`, `LOGOUT`, `FAILED_LOGIN`, `PASSWORD_CHANGED`, `PIN_FAILED`, `PIN_UPDATED`, `PL_PIN_UPDATED`, `PIN_SETTINGS_UPDATED`, `MFA_ENABLED`, `MFA_DISABLED`, `MFA_FAILED`, `MFA_REQUIRED_SET`, `MFA_REQUIRED_UNSET`, `ACCOUNT_LOCKED`, `ACCOUNT_UNLOCKED` |
| 📦 Operations | `STOCK_RECEIPT_SAVED`, `DAIRY_PAYMENT_*`, `DISPATCH_*`, `SALESPERSON_PAYMENT_*`, `*_TOPUP_RECORDED`, `SALESPERSON_LEDGER_RESET`, `BILL_*` |
| 🛠️ Setup | `SALESPERSON_*`, `SALESPERSON_PRICES_*`, `PRODUCT_*`, `CATEGORY_*`, `ROUTE_*`, `BRAND_*`, `ADMIN_USER_*` |
| 👀 Self-service | `SALESPERSON_BALANCE_VIEWED`, `SALESPERSON_STATEMENT_VIEWED` |

Exact list: `SLACK_EVENTS` in `utils/slack.js` and [CLAUDE.md § 10](../../CLAUDE.md).

## 2. 📜 Logging (`config/logger.js`)

| Setting | Production | Development |
|---|---|---|
| Level | `info` | `debug` |
| Console | JSON with timestamp | colourised simple |
| Files | `logs/error.log`, `logs/combined.log` (5 MB × 5) | same |
| HTTP access | morgan `combined` → `logger.http` | same |

```js
const logger = require('../config/logger');
logger.info('Stock receipts saved', { brandId, date, count });
logger.error('Readiness check failed', { message: err.message });
```

Rules: never `console.*` (ESLint `no-console`), never log secrets/tokens/PINs, log context as an object.

## 3. 💓 Health probes

| Probe | Checks | Use |
|---|---|---|
| `GET /health` | process alive; returns `version`, `commit`, `builtAt` | liveness, deploy verification (`wait-for-backend.sh`) |
| `GET /health/ready` | `SELECT 1` against PostgreSQL | readiness |

## 4. 🚨 Error alerting

```mermaid
flowchart LR
    T[thrown error] --> H{global handler}
    H -- Prisma P2002/P2025/P2003 --> R4[4xx, no alert]
    H -- AppError --> R5[status + message, no alert]
    H -- anything else --> R6[500 · logger.error · 💬 SERVER_ERROR]
    P[process-level crash] --> PC[💬 PROCESS_CRASH · exit]
```
