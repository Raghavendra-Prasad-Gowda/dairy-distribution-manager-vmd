# Client — Engineering Contract

## Structure

```
client/src/
├── api/
│   └── axios.js            # Configured axios instance (baseURL, timeout, interceptors)
├── components/
│   ├── Layout.jsx          # App shell with sidebar navigation
│   └── ErrorBoundary.jsx   # Catches ChunkLoadError + unexpected render errors
├── context/
│   ├── AuthContext.jsx     # JWT auth state, session timeout (12h)
│   └── NotificationContext.jsx
├── pages/
│   ├── Dashboard.jsx
│   ├── Login.jsx
│   ├── daily/              # StockReceipt, Dispatch
│   ├── payments/           # DairyPayments, SalespersonCollections
│   ├── reports/            # DairyStatement, SalespersonStatement, StockSummary
│   └── setup/              # ProductsSetup, CategorySetup, SalespeopleSetup, RouteSetup, LayoutSettings
└── App.jsx                 # Routes, lazy loading, ErrorBoundary wrapper
```

## Principles

### All API Calls via Axios Instance
- Import from `src/api/axios.js` — never construct raw `fetch` or `axios.create()` inline.
- The instance has `baseURL`, `timeout: 30000`, and auth-header injection via interceptor.

### Lazy Loading
- All page-level components lazy-loaded (`lazy(() => import(...))`).
- Wrapped in `<Suspense fallback={<PageLoader />}>` via the `S(Page)` helper in `App.jsx`.
- This keeps the initial bundle small — do not import pages eagerly.

### Error Boundary
- `ErrorBoundary` wraps the entire app in `App.jsx`.
- Handles `ChunkLoadError` (Vercel redeploy stale chunks) with auto-reload (one attempt, guarded by sessionStorage).
- Shows a friendly error UI for unexpected render errors.
- Do not remove or bypass the ErrorBoundary.

### Session Timeout
- `AuthContext` clears auth state after 12 hours (`SESSION_MS = 12 * 60 * 60 * 1000`).
- Must match JWT expiry on the server. If JWT expiry changes, update `SESSION_MS` too.

### State Management
- No global state library. React context only for cross-cutting concerns (auth, notifications).
- Page-level state lives in the page component. Shared UI state passed as props.

### Forms and Inputs
- Controlled inputs. Never mutate state directly.
- Validate before API call, not after.

### Navigation
- All routes declared in `App.jsx` — nowhere else.
- Legacy URL redirects maintained via `<Navigate>` components.
- New pages: add lazy import, `<Route>` in `App.jsx`, and nav link in `Layout.jsx`.

## What NOT to Do
- Do not import pages eagerly (defeats code splitting).
- Do not make API calls with raw `fetch` or a separate axios instance.
- Do not store JWT or sensitive data in `localStorage` (auth context uses memory + httpOnly cookie flow).
- Do not add global state management (Redux, Zustand) without discussion — context has been sufficient.
- Do not remove the `ErrorBoundary` wrapper.
- Do not hardcode API base URLs — use the axios instance which reads from `VITE_API_URL`.
