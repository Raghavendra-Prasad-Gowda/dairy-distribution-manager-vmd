# Client — Engineering Contract

Frontend sub-contract. The root `CLAUDE.md` still applies in full (frontend route map, BrandedLoader, product
display order, Vitest patterns, change checklist); this file adds the client-only rules. The UI automation suite in
`automation-ui/` has its own contract: `automation-ui/CLAUDE.md`.


Detailed documentation: `README.md` and `docs/` (architecture, routing, data layer, components, pages catalogue,
printing, testing, build, coding standards). Keep them in sync with behaviour changes.

## Structure

```
client/
├── src/
│   ├── api/
│   │   ├── axios.js        # Configured axios instance (baseURL, 60s timeout, interceptors)
│   │   └── coldStart.js    # Tracks slow requests → "server is waking up" screen
│   ├── components/
│   │   ├── Layout.jsx          # App shell with sidebar navigation (hamburger below `lg`)
│   │   ├── ErrorBoundary.jsx   # Catches ChunkLoadError + unexpected render errors, reports to /errors/client
│   │   ├── ColdStartScreen.jsx # Shown while Render's free tier wakes up
│   │   ├── VersionTag.jsx      # Build tag + commit (sidebar footer, login page)
│   │   ├── PinModal.jsx        # Edit-PIN / P&L-PIN prompt before protected actions
│   │   ├── BillSheet.jsx, BalanceLedger.jsx, BalanceSummaryCard.jsx, PaymentForm.jsx, BulkTopUpModal.jsx,
│   │   │   ResetLedgerModal.jsx, ConfirmationModal.jsx, DateSelector.jsx, BrandTabs.jsx, Pagination.jsx, ...
│   │   └── ui/                 # BrandedLoader (+ TumblerSpinner), Modal, Button, Alert, EmptyState, LoadingOverlay
│   ├── context/
│   │   ├── AuthContext.jsx     # JWT auth state, session timeout (2h), useAuth()
│   │   └── NotificationContext.jsx  # useNotification() → notify(msg, type)
│   ├── hooks/
│   │   ├── useApiResource.js / useApiResources.js  # declarative GET(s) with loading/error/refetch
│   │   ├── useMutation.js      # write with loading + error toast, resolves { ok, result | error }
│   │   ├── usePaymentFilters.js, useDisclosure.js, useDebouncedValue.js
│   ├── pages/
│   │   ├── Dashboard.jsx, Login.jsx (incl. MFA steps), SalespersonOutstanding.jsx
│   │   ├── daily/              # StockReceipt
│   │   ├── payments/           # DairyPayments, SalespersonCollections
│   │   ├── reports/            # DairyStatement, SalespersonStatement (incl. Bills tab), StockSummary,
│   │   │                       # StockBalanceSummary, DailyDispatchSummary, SalesmanDayBalance,
│   │   │                       # SalesmanProfitLoss, DepositReport, DairyReports, BillPrint, *Print.jsx
│   │   ├── setup/              # ProductsSetup, CategorySetup, BrandsSetup, RouteSetup, LayoutSettings,
│   │   │   │                   # DairySettings, SalesmanUsersSetup, SalesmanPricesSetup, AdminUsersSetup
│   │   │   └── salesmanPrices/ # SalesmanPricesSetup pieces (ExceptionManagerModal, PriceTable, modals, ...)
│   │   ├── salesman/           # StockEntry, SalespersonBalance, MyStatement(+Print), ChangePassword
│   │   └── dairy/PriceSetup.jsx  # rate master — has tests but is not routed in App.jsx
│   ├── utils/                  # dateUtils (IST), session, productLayout, billPdf, billDisplay,
│   │                           # numberToWords, salespersonProductStatement, appVersion, constants
│   ├── test/setup.js           # Vitest + RTL setup
│   ├── App.jsx                 # Routes, lazy loading, ErrorBoundary wrapper
│   └── main.jsx
├── vite.config.js              # Build identity defines + Vitest config (coverage gate, excludes automation-ui/)
├── eslint.config.js            # ignores dist, coverage, automation-ui
├── vercel.json                 # SPA rewrite to index.html
├── .vercelignore               # keeps automation-ui/ out of the Vercel upload
└── automation-ui/              # Playwright UI suite vs the deployed app — NOT part of the client app
```

## Principles

### All API Calls via Axios Instance
- Import from `src/api/axios.js` — never construct raw `fetch` or `axios.create()` inline.
- The instance has `baseURL` (`VITE_API_BASE_URL`), `timeout: 60000` (Render cold start), auth-header injection,
  cold-start tracking, and 401 handling (logout + redirect, except for "what you typed is wrong" 401s such as a
  wrong PIN, wrong password or expired `mfaToken`).
- Prefer `useApiResource` / `useApiResources` for reads and `useMutation` for writes over hand-written
  `setLoading … try … catch notify … finally` blocks. They unwrap the `{ success, data }` envelope and
  guard against stale responses.

### Lazy Loading
- All page-level components lazy-loaded (`lazy(() => import(...))`).
- Wrapped in `<Suspense fallback={<PageLoader />}>` via the `S(Page)` helper in `App.jsx`.
- This keeps the initial bundle small — do not import pages eagerly.

### Error Boundary
- `ErrorBoundary` wraps the entire app in `App.jsx`.
- Handles `ChunkLoadError` (Vercel redeploy stale chunks) with auto-reload (one attempt, guarded by sessionStorage).
- Shows a friendly error UI for unexpected render errors and sends a crash report (with the build version) to `POST /errors/client`.
- Do not remove or bypass the ErrorBoundary.

### Session Timeout
- `AuthContext` clears auth state after 2 hours (`SESSION_MS = 2 * 60 * 60 * 1000` in `src/utils/session.js`).
- Must match JWT expiry on the server (`JWT_EXPIRES_IN: 7200`). If JWT expiry changes, update `SESSION_MS` too.

### Auth Transport
- The JWT is stored in `localStorage` (`src/api/axios.js` reads it and attaches `Authorization: Bearer <token>` to every request) — this is the actual, deliberate transport, not a cookie flow.
- Login also receives an httpOnly cookie, but it is a legacy/incidental artifact only — the server's `authenticate` middleware (`server/middleware/auth.js`) does not honor it. Trusting an ambient cross-site cookie for auth is a CSRF hole; only the explicit header (something a cross-site form can't attach) authenticates a request. Do not add code that relies on the cookie for auth on either side.
- MFA: when login answers with an `mfaToken` instead of a session, `Login.jsx` asks for the TOTP/backup code (or walks a required enrolment) and only then stores the token.

### Dates & Money
- Use `src/utils/dateUtils.js` (`getIndiaDate`, `formatDateDisplay`, `formatCurrency`, ...) — never `new Date()` for a business date.

### State Management
- No global state library. React context only for cross-cutting concerns (auth, notifications).
- Page-level state lives in the page component. Shared UI state passed as props.

### Forms and Inputs
- Controlled inputs. Never mutate state directly.
- Validate before API call, not after.
- Protected edits (back-dated changes, P&L report) go through `PinModal` → `POST /pin/verify` or `/pin/verify-pl`.

### Loading states
- `BrandedLoader` for page/section/overlay loading; `TumblerSpinner` for in-button/inline spinners.
  Never `Loader2` from lucide-react (root `CLAUDE.md` §11).

### Navigation
- All routes declared in `App.jsx` — nowhere else.
- Legacy URL redirects maintained via `<Navigate>` components.
- New pages: add lazy import, `<Route>` in `App.jsx`, and nav link in `Layout.jsx`.
- Print pages (`/print/*`) render without the `Layout` shell.

### Screens
- Salesmen use a phone; admins, superadmins and dispatchers use an iPad (portrait 810px is below the `lg`
  breakpoint, so it gets the hamburger menu; landscape gets the sidebar). Design and test for those widths —
  the UI automation suite runs on exactly those devices.

## Testing (this folder)

| Suite | Where | Runs | Proves |
|---|---|---|---|
| Vitest + RTL | `src/**/*.test.jsx` next to the page | every PR (`npm run test:coverage`, gate 78/68/70/80) | components with a mocked API |
| UI automation | `automation-ui/` (see `automation-ui/CLAUDE.md`) | after merge to `develop` | the deployed frontend + backend |

- Vitest ignores `automation-ui/**` (see `vite.config.js`) and ESLint ignores it — keep both exclusions.
- Changing visible text, labels, roles or routes that a UI spec relies on → update the page object in
  `automation-ui/src/pages/` in the same PR.

## What NOT to Do
- Do not import pages eagerly (defeats code splitting).
- Do not make API calls with raw `fetch` or a separate axios instance.
- Do not rely on the httpOnly cookie for auth — the server does not honor it (see Auth Transport above); always go through the `Authorization` header via `src/api/axios.js`.
- Do not add global state management (Redux, Zustand) without discussion — context has been sufficient.
- Do not remove the `ErrorBoundary` wrapper.
- Do not hardcode API base URLs — use the axios instance which reads from `VITE_API_BASE_URL`.
- Do not import anything from `automation-ui/` into `src/` (or the reverse) — they are separate projects.
