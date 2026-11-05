# 🏗️ Client Architecture

[⬅️ Client README](../README.md) · [System architecture](../../docs/02-system-architecture.md)

---

## 1. 🧅 Provider stack (`App.jsx`)

```mermaid
flowchart TB
    EB["🧯 ErrorBoundary<br/>catches render errors + ChunkLoadError"] --> BR["🧭 BrowserRouter"]
    BR --> AP["🔑 AuthProvider<br/>user · login · logout · 2 h timer"]
    AP --> NP["🔔 NotificationProvider<br/>notify(msg, type)"]
    NP --> AR["🗺️ AppRoutes"]
    NP --> CS["⏳ ColdStartScreen"]
```

| Order matters because… |
|---|
| `ErrorBoundary` is outermost so a crash inside any provider is still caught and reported |
| `AuthProvider` needs the router to redirect on logout/expiry |
| `NotificationProvider` sits inside auth so login errors can be shown |

## 2. 🧱 Module boundaries

```mermaid
flowchart LR
    PAGES[📄 pages/] --> COMP[🧩 components/]
    PAGES --> HOOKS[🪝 hooks/]
    PAGES --> UTILS[🧰 utils/]
    PAGES --> CTX[🔑🔔 context/]
    COMP --> UI[🎨 components/ui/]
    COMP --> UTILS
    HOOKS --> API[🔌 api/axios.js]
    HOOKS --> CTX
    CTX --> API
    API --> CSM[api/coldStart.js]
    API --> SES[utils/session.js]
```

| Folder | Owns | Must not |
|---|---|---|
| `pages/` | Screen state, layout, orchestration | Talk to `fetch` / new axios instances |
| `components/` | Reusable widgets and modals | Know about routes beyond links |
| `components/ui/` | Design-system primitives | Fetch data |
| `hooks/` | Data fetching and UI state patterns | Render UI |
| `context/` | Auth + notifications only | Become a general store |
| `api/` | HTTP, auth header, 401, cold start | Import React components |
| `utils/` | Pure helpers (dates, sort, format, PDF) | Hold state |

## 3. 🔁 Page lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant R as Router
    participant S as Suspense (PageLoader)
    participant P as Page
    participant H as useApiResource(s)
    participant A as axios
    R->>S: lazy(import('./pages/X'))
    S-->>R: BrandedLoader while chunk loads
    S->>P: mount
    P->>H: request data (url, params)
    H->>A: GET (Bearer JWT)
    A-->>H: { success, data }
    H-->>P: data · loading=false
    P->>P: user edits
    P->>A: useMutation → POST/PUT/DELETE
    A-->>P: result → optimistic update or refetch
```

## 4. 🧭 Key design decisions

| Decision | Reason | ADR |
|---|---|---|
| No Redux/Zustand | Only auth + notifications are global | [ADR-010](../../docs/11-architecture-decisions.md#adr-010--no-global-state-library-on-the-client) |
| JWT in header from `localStorage` | No CSRF surface | [ADR-005](../../docs/11-architecture-decisions.md#adr-005--jwt-in-the-authorization-header-not-a-cookie) |
| Lazy pages | Small first load on phones | — |
| 60 s request timeout + cold-start screen | Render free plan wakes slowly | — |
| IST date helpers everywhere | Device clocks/timezones vary | [ADR-004](../../docs/11-architecture-decisions.md#adr-004--india-standard-time-is-the-business-clock) |
