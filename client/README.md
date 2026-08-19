# Client — Frontend Developer Guide

> **React 19 · Vite 8 · Tailwind CSS 3 · Vitest**
>
> ← Back to [project root](../README.md) · See also: [Backend guide](../server/README.md)

---

## Quick Start

```bash
cd client
npm install
# Create .env with: VITE_API_BASE_URL=http://localhost:3001/api/v1
npm run dev          # http://localhost:5173
```

**Available scripts:**

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Production build (static output) |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run Vitest tests (single run) |
| `npm run test:coverage` | Tests + V8 coverage report |
| `npm run lint` | ESLint (flat config) |

---

## Architecture Overview

```
                           ┌──────────────────────────────┐
  Browser                  │         Vercel CDN            │
  ───────────────────────> │   Static React 19 SPA         │
                           └──────────┬───────────────────┘
                                      │ HTTPS
                                      ▼
                           ┌──────────────────────────────┐
                           │     Express 5 REST API        │
                           │     /api/v1/*                 │
                           │     (Render)                  │
                           └──────────────────────────────┘
```

The frontend is a single-page application. All data comes from the REST API
via a single shared Axios instance. There is no server-side rendering, no
global state library, and no build-time data fetching.

**Key architectural decisions:**

- **No Redux/Zustand** — React Context for cross-cutting concerns only (auth, notifications). Page-level state stays local.
- **Lazy loading everywhere** — every page-level component is `lazy()`-imported in `App.jsx`. Initial bundle stays small.
- **IST-only dates** — all date logic goes through `utils/dateUtils.js`. Never use `new Date()` directly.
- **Single Axios instance** — `api/axios.js` handles JWT injection, session expiry detection, and cold-start tracking.

---

## Directory Layout

```
client/
├── index.html                        # Vite entry point
├── package.json                      # Dependencies and scripts
├── vite.config.js                    # Vite + Vitest config (inline)
├── tailwind.config.js                # Tailwind theme extensions (brand colors)
├── postcss.config.js                 # PostCSS → Tailwind + Autoprefixer
├── eslint.config.js                  # ESLint flat config
│
└── src/
    ├── main.jsx                      # React root mount
    ├── App.jsx                       # Route tree, lazy imports, ProtectedRoute, ErrorBoundary
    ├── index.css                     # Tailwind base + custom utilities
    │
    ├── api/
    │   ├── axios.js                  # Shared Axios instance (THE import for all API calls)
    │   └── coldStart.js              # Render cold-start detection (2s threshold pub-sub)
    │
    ├── context/
    │   ├── AuthContext.jsx            # Auth state, 2h session timer, useAuth() hook
    │   └── NotificationContext.jsx    # useNotification() → notify(msg, type)
    │
    ├── hooks/                         # Reusable custom hooks
    │   ├── useApiResource.js          # Declarative single-endpoint GET
    │   ├── useApiResources.js         # Declarative parallel GET (Promise.all)
    │   ├── useMutation.js             # Async write wrapper (loading/error/toast)
    │   ├── useDisclosure.js           # Boolean open/close for modals
    │   ├── usePaymentFilters.js       # Shared filter/search/pagination for payments
    │   └── useDebouncedValue.js       # Debounced input value
    │
    ├── components/                    # Shared UI components
    │   ├── Layout.jsx                 # App shell: sidebar nav + <Outlet/>
    │   ├── ErrorBoundary.jsx          # ChunkLoadError handler + crash reporter
    │   ├── BrandTabs.jsx              # Brand switcher tabs
    │   ├── Pagination.jsx             # Shared pagination controls
    │   ├── DateSelector.jsx           # Date picker with prev/next/today
    │   ├── ConfirmationModal.jsx      # "Are you sure?" modal
    │   ├── PaymentForm.jsx            # Shared payment create/edit form
    │   ├── BalanceLedger.jsx          # Balance history table
    │   ├── BalanceSummaryCard.jsx      # Balance overview card
    │   ├── BulkTopUpModal.jsx         # Bulk top-up entry modal
    │   ├── ResetLedgerModal.jsx       # Ledger reset confirmation
    │   ├── PinModal.jsx               # PIN verification modal
    │   ├── SaveOverlay.jsx            # "Unsaved changes" bar
    │   ├── StatusBadge.jsx            # Colored status label
    │   ├── ColdStartScreen.jsx        # "Server is waking up" overlay
    │   └── ui/                        # Low-level primitives
    │       ├── BrandedLoader.jsx      # VMD branded tumbler spinner
    │       ├── Modal.jsx              # Generic modal shell
    │       ├── Button.jsx             # Standard button
    │       ├── Alert.jsx              # Alert banner
    │       ├── EmptyState.jsx         # "No data" placeholder
    │       └── LoadingOverlay.jsx     # Dim overlay with spinner
    │
    ├── pages/                         # Feature pages (lazy-loaded)
    │   ├── Dashboard.jsx
    │   ├── Login.jsx
    │   ├── daily/
    │   │   └── StockReceipt.jsx       # Daily stock entry per brand/route
    │   ├── payments/
    │   │   ├── DairyPayments.jsx      # Dairy payment management
    │   │   └── SalespersonCollections.jsx  # Salesperson collection management
    │   ├── reports/
    │   │   ├── DairyReports.jsx       # Report hub / navigation
    │   │   ├── DairyStatement.jsx     # Dairy balance statement
    │   │   ├── SalespersonStatement.jsx  # Salesperson balance statement
    │   │   ├── StockSummary.jsx       # Stock receipt summary
    │   │   ├── DepositReport.jsx      # Deposit tracking report
    │   │   ├── DailyDispatchSummary.jsx  # Dispatch sheet
    │   │   ├── StockBalanceSummary.jsx   # Stock balance view
    │   │   ├── SalesmanDayBalance.jsx    # Salesman day-end balance
    │   │   ├── SalesmanProfitLoss.jsx    # Salesman P&L
    │   │   ├── *Print.jsx             # Print/PDF variants (no Layout shell)
    │   ├── setup/
    │   │   ├── ProductsSetup.jsx      # Product CRUD + archive
    │   │   ├── CategorySetup.jsx      # Category CRUD
    │   │   ├── SalesmanUsersSetup.jsx  # Salesperson CRUD
    │   │   ├── SalesmanPricesSetup.jsx # Pricing + Exception Manager
    │   │   ├── LayoutSettings.jsx     # Drag-and-drop product layout
    │   │   ├── RouteSetup.jsx         # Delivery route CRUD
    │   │   ├── BrandsSetup.jsx        # Brand CRUD + deposit config
    │   │   ├── DairySettings.jsx      # Dairy general settings
    │   │   └── AdminUsersSetup.jsx    # Admin user management (superadmin)
    │   ├── salesman/                  # Salesman-role pages
    │   │   ├── StockEntry.jsx         # Salesman's own stock entry
    │   │   ├── SalespersonBalance.jsx # Salesman's own balance
    │   │   ├── MyStatement.jsx        # Salesman's own statement
    │   │   ├── MyStatementPrint.jsx   # Print variant
    │   │   └── ChangePassword.jsx     # Password change (shared with dispatcher)
    │   └── SalespersonOutstanding.jsx  # Outstanding balances overview
    │
    └── utils/
        ├── dateUtils.js               # IST-safe date helpers (ALWAYS use these)
        ├── constants.js               # BRANDS, PAYMENT_MODES, BRAND_COLORS
        ├── session.js                 # SESSION_MS, expiry helpers
        ├── productLayout.js           # Category/product sort helpers
        └── numberToWords.js           # Number-to-words conversion (for receipts)
```

---

## Provider Stack

The app wraps in a specific order. Each layer depends on the one inside it:

```jsx
// App.jsx
<ErrorBoundary>                    // Catches render errors + ChunkLoadError
  <BrowserRouter>                  // React Router
    <AuthProvider>                 // JWT state, session timer
      <NotificationProvider>       // Toast notifications
        <AppRoutes />              // Route tree
        <ColdStartScreen />        // Render wake-up overlay
      </NotificationProvider>
    </AuthProvider>
  </BrowserRouter>
</ErrorBoundary>
```

**Do not reorder these.** `AuthProvider` needs `BrowserRouter` for navigation on logout. `NotificationProvider` needs to be inside `AuthProvider` so notifications work on the login page. `ErrorBoundary` wraps everything so a crash anywhere (including inside providers) is caught.

---

## Routing

All routes are declared in `App.jsx` — nowhere else.

### Route guards

```jsx
<ProtectedRoute>                  // Any authenticated user
<ProtectedRoute adminOnly>        // admin + superadmin
<ProtectedRoute superAdminOnly>   // superadmin only
```

The `AppRoutes` component reads `user.role` from `useAuth()` and conditionally renders role-specific route trees:

| Role | Index route | Available routes |
|------|------------|-----------------|
| `admin` / `superadmin` | Dashboard | Full admin route tree |
| `dispatcher` | Dispatch Sheet | Dispatch sheet, stock balance, change password |
| `salesman` | Stock Entry | Stock entry, balance, statement, change password |

### Print routes

Print pages render **outside** the `<Layout>` shell (no sidebar). They use `<ProtectedRoute>` for auth but don't nest under the `<Layout>` route:

```
/print/stock-summary              adminOnly
/print/deposit                    adminOnly
/print/dairy-statement            adminOnly
/print/salesperson-statement      adminOnly
/print/salesman-my-statement      any authenticated
```

### Adding a new route

1. Create the page component in the appropriate `pages/` subdirectory
2. Add a `lazy()` import at the top of `App.jsx`
3. Add a `<Route>` entry in the correct role section
4. Add a nav link in `Layout.jsx` (if it should appear in the sidebar)
5. Write tests (see [Testing](#testing) below)

---

## API Layer

### The Axios Instance (`api/axios.js`)

**Every API call must use this instance.** Never import `axios` directly or use `fetch`.

```js
import api from '../api/axios';

// ✅ Correct
const res = await api.get('/brands');
const { data } = res.data;  // unwrap { success, data } envelope

// ❌ Wrong — bypasses JWT injection + session handling
import axios from 'axios';
const res = await axios.get('/api/v1/brands');
```

**What the instance does:**

| Feature | Detail |
|---------|--------|
| Base URL | `VITE_API_BASE_URL` env var (falls back to `localhost:3001/api/v1` in dev) |
| Timeout | 60 seconds (Render cold starts can take 30–50s) |
| JWT injection | Reads `localStorage.token`, sets `Authorization: Bearer ...` on every request |
| Session expiry | On 401 → clears auth, redirects to `/login` with a notice |
| Timeout + expired session | On network error + local session past 2h → same redirect |
| Cold-start tracking | Tags each request with an ID; `coldStart.js` fires a 2s timer |

**Exception paths that don't redirect:**
- `/auth/login` — a 401 means wrong credentials, not session expiry
- `/auth/change-password` — a 401 means wrong current password
- `/pin/verify` — a 401 means wrong PIN

### Cold-Start Detection (`api/coldStart.js`)

Render's free tier sleeps after 15 min of inactivity. The first request can take 30–50s.

```
markRequestStart(id)  ─── 2s timer ──→  slow = true  ──→ ColdStartScreen shows
markRequestEnd(id)    ─── clears ────→  slow = false  ──→ ColdStartScreen hides
```

`ColdStartScreen.jsx` subscribes to this pub-sub and shows a branded "Server is waking up" overlay. It's armed only on login (`armForLogin()`) and auto-disarms after the first request completes — later slow requests don't re-trigger it.

---

## Custom Hooks

### `useApiResource(url, opts)` — Single-endpoint GET

Replaces the copy-pasted `setLoading → try api.get → catch notify → finally setLoading(false)` block.

```js
const { data: brands, loading, error, refetch, setData } = useApiResource('/brands');
```

| Option | Default | Purpose |
|--------|---------|---------|
| `params` | — | Query params (re-fetches when they change) |
| `enabled` | `true` | Skip the fetch when `false` |
| `initialData` | `null` | Value before the first load |
| `notifyOnError` | `true` | Show error toast on failure |
| `select` | — | Transform payload before storing |

**Race-condition guard:** A monotonic request ID ensures stale responses (from a superseded URL/params change) are silently dropped.

### `useApiResources(urls, opts)` — Parallel GET

For pages that need 2+ endpoints in lockstep (`Promise.all`). One loading flag, one error, one moment when everything arrives.

```js
const { data, loading } = useApiResources(
  [`/categories?brandId=${brandId}`, `/products?brandId=${brandId}`],
  {
    select: ([categories, products]) => ({ categories, products }),
  }
);
```

Same options as `useApiResource`, plus `select` receives an array of payloads in URL order.

### `useMutation(mutationFn, opts)` — Async writes

Wraps POST/PUT/DELETE with loading state, error toast, and optional success toast. Never throws — resolves to `{ ok, result }` or `{ ok: false, error }`.

```js
const { mutate: save, loading: saving } = useMutation(
  (data) => api.post('/products', data),
  {
    successMessage: 'Product created!',
    onSuccess: () => refetch(),
  }
);

// In a handler:
const { ok } = await save(formData);
if (ok) closeModal();
```

| Option | Default | Purpose |
|--------|---------|---------|
| `onSuccess` | — | Called with `(result, ...args)` on success |
| `successMessage` | — | Toast shown on success |
| `notifyOnError` | `true` | Toast shown on failure |

**Error fallback:** `e.response?.data?.error ?? 'Something went wrong'`. Tests should expect `'Something went wrong'` for network errors.

### `useDisclosure(initial)` — Modal state

Replaces the `const [showX, setShowX] = useState(false)` pattern.

```js
const { isOpen, open, close, toggle } = useDisclosure();

<button onClick={open}>Add</button>
{isOpen && <Modal onClose={close} />}
```

### `usePaymentFilters(payments, opts)` — Payment list filters

Shared filter/search/pagination state for `DairyPayments` and `SalespersonCollections`.

```js
const filters = usePaymentFilters(payments, {
  searchable: true,
  resetDeps: [activeBrandId],
});

// filters.pagedPayments — filtered + paginated subset
// filters.page, filters.setPage, filters.totalPages — pagination
// filters.filterFrom, filters.setFilterFrom, ... — filter values
// filters.clearFilters — reset all filters
// filters.filterPanel.isOpen — filter panel toggle
```

### `useDebouncedValue(value, delay)` — Debounced input

```js
const [search, setSearch] = useState('');
const debouncedSearch = useDebouncedValue(search, 300);
// debouncedSearch updates 300ms after the last keystroke
```

---

## Context Providers

### AuthContext

**Provides:** `{ user, login, logout, loading }`

```js
import { useAuth } from '../context/AuthContext';
const { user, logout } = useAuth();
// user = { businessName, role, salespersonId, salespersonName, adminUserId }
```

**Session lifecycle:**

1. `login(username, password)` → POST `/auth/login` → stores token/user/loginTime in localStorage
2. Schedules a 2h timer (`SESSION_MS = 7,200,000ms`) → auto-logout on expiry
3. On mount, hydrates from localStorage and re-arms the timer (if still valid)
4. `logout()` → POST `/auth/logout` → clears storage → `setUser(null)`
5. On expiry → clears storage → hard redirect to `/login` with a sessionStorage notice

**Critical:** `SESSION_MS` must match the server's `JWT_EXPIRES_IN` (7200 seconds). If one changes, update the other.

### NotificationContext

**Provides:** `{ notify }`

```js
import { useNotification } from '../context/NotificationContext';
const { notify } = useNotification();

notify('Saved successfully!', 'success');    // green toast
notify('Something went wrong', 'error');     // red toast
notify('Check your input', 'warning');       // amber toast
notify('FYI: dates updated', 'info');        // blue toast
```

Notifications render as a modal-style overlay (not a dismissible toast bar). They auto-dismiss after a timeout.

---

## Component Library

### BrandedLoader (VMD Spinner)

**Import:** `import BrandedLoader from '../components/ui/BrandedLoader';`

Use `BrandedLoader` for all page-level and section-level loading. Use `Loader2` from lucide-react only for in-button spinners.

| Situation | Code |
|-----------|------|
| Page initial load | `<BrandedLoader />` |
| Full-page blocking | `<BrandedLoader overlay open={loading} label="Saving…" />` |
| Section loading | `<BrandedLoader size="sm" />` |
| Save overlay | `<BrandedLoader overlay tone="transparent" open={saving} label="Saving…" />` |
| Cold-start brand screen | `<BrandedLoader overlay tone="brand" lively />` |

**Props:**

| Prop | Default | Description |
|------|---------|-------------|
| `overlay` | `false` | Fixed full-screen with backdrop |
| `open` | `true` | Controls visibility in overlay mode |
| `label` | `"Loading…"` | Status text below spinner |
| `hideBrand` | `false` | Hides "Vikas Milk Dairy" title |
| `size` | `"md"` | `"sm"` / `"md"` / `"lg"` |
| `tone` | `"card"` | `"card"` (white) / `"transparent"` (blur) / `"brand"` (emerald) |
| `lively` | `false` | Adds sonar ping ring |

### ErrorBoundary

Wraps the entire app. Handles two error classes:

1. **ChunkLoadError** (Vercel redeployed, browser has stale chunk references) → one automatic reload per tab, guarded by `sessionStorage['chunk-reload']`. The guard re-arms after 5s of clean running.
2. **All other render errors** → shows a friendly crash screen with "Reload page" button. Reports the error to `POST /errors/client` via the shared Axios instance.

**Never remove or bypass the ErrorBoundary.**

### Layout (App Shell)

The sidebar navigation is role-aware:

| Role | Nav sections |
|------|-------------|
| `admin` / `superadmin` | Dairy (stock, payments, setup, reports) + Salesman (management, setup, reports) |
| `dispatcher` | Dispatch sheet + Stock balance + Change password |
| `salesman` | Stock entry + Balance + Statement + Change password |

The stock receipt section dynamically fetches brands from the API to build nav links (`/dairy/stock/:brandName`), with static fallbacks for the three known brands.

### Brand colors

```js
import { getBrandColors } from '../utils/constants';
const colors = getBrandColors('Nandini');
// { bg: 'bg-nandini-50', text: 'text-nandini-700', border: 'border-nandini-200', ... }
```

Three brands have custom Tailwind color palettes (`nandini`, `jersey`, `gowardhan`). Unknown brands cycle through a fallback palette.

---

## Date Handling

**Rule:** Never use `new Date()` directly. Always import from `utils/dateUtils.js`.

```js
import { getIndiaDate, formatDateDisplay, formatCurrency } from '../utils/dateUtils';

// ✅ Correct — IST-safe
const today = getIndiaDate();              // "2026-08-18"
const display = formatDateDisplay(today);  // "Tuesday, August 18, 2026"
const money = formatCurrency(1500);        // "₹1,500.00"

// ❌ Wrong — machine timezone, breaks for non-IST users
const today = new Date().toISOString().slice(0, 10);
```

**Available helpers:**

| Function | Returns |
|----------|---------|
| `getIndiaDate()` | Today as `YYYY-MM-DD` in IST |
| `getYesterday()` | Yesterday in IST |
| `getTomorrow()` | Tomorrow in IST |
| `getPrevDate(str)` | Day before the given date |
| `getNextDate(str)` | Day after the given date |
| `getFirstDayOfMonth()` | First day of current month in IST |
| `formatDateDisplay(str)` | "Tuesday, August 18, 2026" |
| `formatDateShort(str)` | "18 Aug 2026" |
| `formatDateShortNoYear(str)` | "18 Aug" |
| `getIndiaDateTimeStr()` | "18 Aug 2026, 02:30 pm" (for print footers) |
| `parseLocalDate(str)` | JS Date anchored to the calendar day (no TZ drift) |
| `formatCurrency(n)` | "₹1,23,456.00" in Indian locale |

---

## Product Display Order

Products must always be sorted: **`categoryDisplayOrder → product.displayOrder → product.name`**

Since `product.category` is a plain string (not a FK relation), sorting requires a category lookup:

```js
import { sortCategoryGroups, sortByLayout, buildCategoryOrderMap } from '../utils/productLayout';

// Sort grouped products by category order
const sortedEntries = sortCategoryGroups(groupedByCategory, categories);

// Sort a flat product array (each item must have categoryDisplayOrder)
const sorted = sortByLayout(products);

// Build a name→order map for custom sorting
const catMap = buildCategoryOrderMap(categories);
```

**Every component that renders a product list must use these helpers.** See the root `CLAUDE.md` § 9 for the full pattern.

---

## State Management Patterns

### No global store

There is no Redux, Zustand, or similar. Two React contexts handle cross-cutting concerns:

| Context | Scope |
|---------|-------|
| `AuthContext` | User identity, login/logout, session timer |
| `NotificationContext` | Toast notifications |

Everything else is local component state.

### Page data-loading pattern

```jsx
function MyPage() {
  // 1. Declarative data fetching
  const { data: items, loading, refetch } = useApiResource('/items');

  // 2. Mutation for writes
  const { mutate: save, loading: saving } = useMutation(
    (formData) => api.post('/items', formData),
    { successMessage: 'Saved!', onSuccess: () => refetch() }
  );

  // 3. Modal state
  const { isOpen, open, close } = useDisclosure();

  // 4. Loading state
  if (loading) return <BrandedLoader />;

  // 5. Render
  return (
    <div>
      {/* ... */}
      <BrandedLoader overlay tone="transparent" open={saving} label="Saving…" />
    </div>
  );
}
```

### Optimistic updates

Payment pages and setup pages often avoid a full refetch after a write by updating local state directly:

```js
const { mutate: deleteItem } = useMutation(
  (id) => api.delete(`/items/${id}`),
  {
    successMessage: 'Deleted!',
    onSuccess: (_, id) => {
      setData(prev => prev.filter(item => item.id !== id));
    },
  }
);
```

---

## Styling

### Tailwind CSS 3

All styling uses Tailwind utility classes. Custom component CSS is rare and goes in `index.css`.

```jsx
// ✅ Standard pattern
<div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
  <h2 className="text-lg font-bold text-slate-900">Title</h2>
  <p className="text-sm text-slate-500">Description</p>
</div>
```

### Class merging

Use `clsx` + `tailwind-merge` for conditional/merged classes:

```js
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

const className = twMerge(clsx(
  'px-4 py-2 rounded-xl text-sm font-semibold',
  variant === 'primary' && 'bg-emerald-700 text-white',
  variant === 'secondary' && 'bg-slate-100 text-slate-700',
  disabled && 'opacity-50 cursor-not-allowed',
));
```

### Brand-specific colors

The Tailwind config extends the palette with custom brand colors:

```
nandini-*    (amber/gold tones)
jersey-*     (sky/blue tones)
gowardhan-*  (violet/purple tones)
```

These are used through the `BRAND_COLORS` map in `utils/constants.js` and the `getBrandColors()` helper.

---

## Testing

### Stack

- **Vitest 4** — test runner (inline config in `vite.config.js`)
- **React Testing Library** — DOM queries (`screen`, `render`, `fireEvent`, `waitFor`)
- **jsdom** — browser environment simulation
- **V8 coverage** — enforced thresholds

### Coverage Thresholds

CI fails if coverage drops below these baselines:

| Metric | Threshold |
|--------|-----------|
| Statements | 78% |
| Branches | 68% |
| Functions | 70% |
| Lines | 80% |

### Test File Convention

Tests live next to the file they test:

```
pages/setup/ProductsSetup.jsx
pages/setup/ProductsSetup.test.jsx
components/BrandTabs.jsx
components/BrandTabs.test.jsx
utils/dateUtils.js
utils/dateUtils.test.js
```

### Setup File

`src/test/setup.js` loads `@testing-library/jest-dom` matchers globally (e.g. `toBeInTheDocument()`).

### Standard Test Pattern

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '../../api/axios';

// 1. Mock the Axios instance
vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

// 2. Mock notification context
const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

// 3. Pin today's date for deterministic tests
vi.mock('../../utils/dateUtils', async () => {
  const actual = await vi.importActual('../../utils/dateUtils');
  return { ...actual, getIndiaDate: () => '2026-08-09' };
});

// 4. Reset mocks between tests
beforeEach(() => {
  vi.resetAllMocks();
  // Set up default mock responses
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/brands'))     return Promise.resolve({ data: { data: brands } });
    if (url.includes('/categories')) return Promise.resolve({ data: { data: categories } });
    if (url.includes('/products'))   return Promise.resolve({ data: { data: products } });
    return Promise.resolve({ data: { data: [] } });
  });
});

// 5. Write tests
describe('MyPage', () => {
  it('renders data after loading', async () => {
    render(<MyPage />);
    expect(await screen.findByText('Expected Text')).toBeInTheDocument();
  });

  it('shows error toast on API failure', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network'));
    render(<MyPage />);
    await waitFor(() => expect(notify).toHaveBeenCalledWith(
      expect.any(String), 'error'
    ));
  });
});
```

### Mocking patterns

**Mock BrandTabs** (most setup pages need this):
```js
vi.mock('../../components/BrandTabs', () => ({
  default: ({ brands, onChange }) => (
    <div data-testid="brand-tabs">
      {brands.map(b => <button key={b.id} onClick={() => onChange(b.id)}>{b.name}</button>)}
    </div>
  ),
}));
```

**Mock react-router params:**
```js
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ brandName: 'nandini' }) };
});
```

### Minimum coverage per new page

- Renders initial state correctly
- Shows empty state when no data
- Handles API errors (`notify` called with `'error'` type)
- Core user interactions (click, change, submit)
- Optimistic UI updates (no extra GET calls after write)

### Running tests

```bash
npm test                  # single run
npm run test:coverage     # with coverage report
npx vitest --watch        # watch mode (development)
npx vitest MyPage         # run tests matching "MyPage"
```

---

## Environment Variables

| Variable | Required | Purpose |
|----------|:---:|---------|
| `VITE_API_BASE_URL` | Yes | Backend base URL (e.g. `http://localhost:3001/api/v1`) |

In development, the Axios instance falls back to `http://localhost:3001/api/v1` when the variable is unset. In production (Vercel), it must be set — the instance logs a console error if missing.

---

## Deployment (Vercel)

```bash
npm run build    # produces static output in dist/
```

Vercel picks up the build output and serves it as a static SPA. Client-side routing is handled by a Vercel rewrite rule (all paths → `index.html`).

**Cold-start resilience:** The frontend handles Render's cold-start delay with a `ColdStartScreen` overlay and a 60-second Axios timeout (vs. the default 30s).

**Stale-chunk resilience:** When Vercel deploys a new version, already-open tabs may reference chunk hashes that no longer exist. The `ErrorBoundary` catches the `ChunkLoadError` and auto-reloads (once per tab).

---

## Key Patterns & Anti-Patterns

### ✅ Do

- Import API calls from `api/axios.js`
- Use `useApiResource` / `useApiResources` for data fetching
- Use `useMutation` for writes (handles loading, errors, toasts)
- Use `useDisclosure` for modal open/close state
- Use `BrandedLoader` for loading states (not generic spinners)
- Use `utils/dateUtils.js` for all date operations
- Use `utils/productLayout.js` for product sorting
- Lazy-load new pages in `App.jsx`
- Declare all routes in `App.jsx` only
- Write co-located test files for every new page/component

### ❌ Don't

- Import `axios` directly or use `fetch`
- Use `new Date()` for date strings
- Import pages eagerly (defeats code splitting)
- Add Redux/Zustand without discussion
- Put routes outside `App.jsx`
- Remove the `ErrorBoundary`
- Use generic spinners instead of `BrandedLoader`
- Store sensitive data in localStorage (token is an exception for session recovery)
- Hardcode API base URLs
