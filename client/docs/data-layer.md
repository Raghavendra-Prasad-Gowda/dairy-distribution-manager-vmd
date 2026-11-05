# 🔌 Data Layer

[⬅️ Client README](../README.md)

---

## 1. 🔌 The axios instance (`src/api/axios.js`)

```mermaid
flowchart LR
    subgraph Request
        RQ[api.get/post…] --> I1[attach Authorization: Bearer localStorage.token]
        I1 --> I2[tag request id · coldStart.markRequestStart]
    end
    I2 --> NET((🌐 /api/v1 · 60 s timeout))
    NET --> R1[coldStart.markRequestEnd]
    R1 --> OK{status}
    OK -- 2xx --> RES[resolve]
    OK -- 401 --> X{expected 401?<br/>login · change-password · PIN · MFA}
    X -- yes --> REJ[reject → page shows message]
    X -- no --> OUT[clear session → /login with notice]
    OK -- no response --> S{local session > 2 h?}
    S -- yes --> OUT
    S -- no --> REJ2[reject → network error toast]
```

| Feature | Detail |
|---|---|
| Base URL | `VITE_API_BASE_URL` (default `http://localhost:3001/api/v1`) |
| Timeout | 60 000 ms |
| Auth | `localStorage.token` → `Authorization: Bearer` |
| Session expiry | Real 401 → logout + redirect with a sessionStorage notice |
| Cold start | Every request reported to `coldStart.js` |

```js
import api from '../api/axios';
const { data } = await api.get('/brands');   // data = { success, data }
```

## 2. ⏳ Cold-start tracker (`src/api/coldStart.js`)

```mermaid
stateDiagram-v2
    [*] --> Disarmed
    Disarmed --> Armed: armForLogin()
    Armed --> Waking: a request exceeds 2 s
    Waking --> Disarmed: all slow requests finished (auto-disarm)
```

`Login.jsx` arms the tracker; `ColdStartScreen` subscribes and shows a branded "server is waking up" overlay only
while `Waking`. Once that screen hides it disarms, so ordinary slow requests later in the session never show it.

## 3. 🪝 Hooks

| Hook | Use for | Returns |
|---|---|---|
| `useApiResource(url, opts)` | One GET | `{ data, loading, error, refetch, setData }` |
| `useApiResources(urls, opts)` | Several GETs in lockstep | same, `select` receives payloads in URL order |
| `useMutation(fn, opts)` | Writes | `{ mutate, loading, error }`; `mutate` resolves `{ ok, result }` / `{ ok:false, error }` |
| `useDisclosure(initial)` | Modal open state | `{ isOpen, open, close, toggle }` |
| `usePaymentFilters(payments, opts)` | Payment list filters + paging | filters, `pagedPayments`, `clearFilters`… |
| `useDebouncedValue(value, ms)` | Search inputs | debounced value |

`useApiResource` options: `params`, `enabled` (skip when false / url null), `initialData`, `notifyOnError` (default
true), `select`. A monotonic request id drops stale responses when url/params change quickly.

```jsx
const { data: products = [], loading, refetch } = useApiResource(
  brandId ? '/products' : null, { params: { brandId } },
);
const { mutate: save, loading: saving } = useMutation(
  (body) => api.post('/products', body),
  { successMessage: 'Product created', onSuccess: refetch },
);
```

## 4. 🔑 `AuthContext`

```mermaid
sequenceDiagram
    autonumber
    participant L as Login.jsx
    participant A as AuthContext
    participant API as /auth
    participant LS as localStorage
    L->>A: login(username, password)
    A->>API: POST /auth/login
    alt MFA step
        API-->>L: mfaVerifyRequired / mfaSetupRequired + mfaToken
        L->>API: /auth/mfa/verify (or setup → confirm)
    end
    API-->>A: accessToken + user fields
    A->>LS: token · user · loginTime
    A->>A: schedule logout at loginTime + SESSION_MS (2 h)
    Note over A: on reload: hydrate from localStorage, re-arm timer
```

`useAuth()` → `{ user, login, logout, loading }`; `user` carries `role`, `adminUserId`, `salespersonId`,
`salespersonName`, `businessName`.

## 5. 🔔 `NotificationContext`

```js
const { notify } = useNotification();
notify('Saved', 'success');           // success | error | warning | info
```

Notices render as a modal ("Success"/"Error") that the user acknowledges — the UI automation dismisses it with
`acknowledgeNotice(...)`.

## 6. 🕰️ Dates

```js
import { getIndiaDate, formatDateDisplay, formatCurrency, getPrevDate, getNextDate } from '../utils/dateUtils';
const today = getIndiaDate();          // "2026-11-05" in IST, whatever the device timezone
```

Never `new Date().toISOString().slice(0, 10)` — that is UTC and is wrong between 00:00 and 05:30 IST.
