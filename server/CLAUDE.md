# Server — Engineering Contract

Backend sub-contract. The root `CLAUDE.md` still applies in full (route map, Slack catalogue, balance rules,
product display order, change checklist); this file adds the server-only rules. The API automation suite in
`automation/` has its own contract: `automation/CLAUDE.md`.


Detailed documentation: `README.md` and `docs/` (architecture, API reference, data model, ledger and dispatch engines,
security, notifications, testing, coding standards, runbook). Keep them in sync with behaviour changes.

## Structure

```
server/
├── app.js                  # Express app: helmet, CORS, morgan, rate limits, routes, global error handler
├── index.js                # Boot sequence: listen → migrate → seed → ready (+ crash/shutdown Slack cards)
├── config/
│   ├── env.js              # Zod-validated process.env — fails closed in production
│   └── logger.js           # Winston logger (always stdout, JSON in prod)
├── controllers/            # All request handlers — one file per domain
│   ├── dispatches/         # read, write, lockLifecycle, dayFinalization, _shared (dispatches.controller.js re-exports)
│   └── reports/            # one file per report, _shared helpers (reports.controller.js re-exports)
├── routes/                 # Thin routers — only path + method + guard + controller ref
├── middleware/
│   ├── auth.js             # authenticate, requireAdmin, requireSuperAdmin, requireAdminOrDispatcher
│   └── asyncHandler.js
├── services/
│   ├── balanceService.js   # Balance cascade logic (dairy + salesperson)
│   ├── paymentLedger.js    # Shared payment date-change cascade + bulk-entity validation
│   ├── depositRules.js     # Deposit qualification + per-line deposit
│   ├── stockGuard.js       # Dispatch stock availability
│   ├── dispatchDayFinalization.js
│   ├── mfaService.js       # TOTP + backup codes
│   └── accountLockService.js
├── utils/                  # validate, AppError, authz, actor, slack, dateUtils, productLayout, billFormat,
│                           # pagination, mfaCrypto, dbUrl, version, constants
├── lib/
│   └── prisma.js           # Singleton Prisma client (PrismaPg adapter)
├── prisma/
│   ├── schema.prisma
│   ├── seed.js             # Foundation data only (superadmin from env, PIN settings)
│   └── migrations/
├── prisma.config.ts        # Prisma 7 CLI config (datasource URL lives here, not in schema.prisma)
├── scripts/
│   ├── check-timezone-safety.js   # CI lint: no `lte/gte/lt/gt: new Date()` in controllers/services
│   └── write-version.js           # `npm run build` → version.json (gitignored)
├── tests/                  # Mocked-Prisma Playwright specs + helpers (run on every PR, under c8)
└── automation/             # Java API suite vs the deployed backend — NOT part of the server app
```

## Principles

### Controller/Route Split
- **Routes** (`routes/*.js`): path + HTTP method + guard middleware + controller reference only. Zero logic.
  The one historical exception is `routes/clientErrors.js` (public crash beacon with its own limiter) — do not add more.
- **Controllers** (`controllers/*.controller.js`): all handler logic, DB calls, response formatting.
  Large domains are split into a sub-folder (`controllers/dispatches/`, `controllers/reports/`) that the
  `*.controller.js` file re-exports — follow that pattern instead of growing a single file past ~500 lines.
- Never put business logic in route files.

### Authorization
- Guards are applied at the mount in `app.js` (`requireAdmin`, `requireSuperAdmin`) or per route inside the router
  when a router mixes roles (`brands`, `reports`, `stockReceipts`, `salespersonPrices`, `salespersonPayments`, `pin`, `dairyPayments`).
- Inside controllers, re-check with `assertRole(req, ...roles)` / `assertAdmin(req)` from `utils/authz.js` —
  never hand-roll `role !== 'admin' && role !== 'superadmin'`.
- A salesman may only touch their own rows: compare `req.user.salespersonId` and return 403 otherwise.
- Use `utils/actor.js` to resolve the acting admin's username for Slack/audit fields.

### Error Handling
- **Never** wrap controller bodies in try/catch. Wrap every handler in `asyncHandler`
  (`middleware/asyncHandler.js`) so rejected promises propagate to the single global
  error handler in `app.js`.
- Throw `AppError(message, statusCode)` for operational errors — never `throw new Error()`
  (the global handler only trusts `err.isOperational`).
- The global handler maps Prisma `P2002`/`P2025`/`P2003` to clean client messages and, in
  production, never leaks stack traces or Prisma internals.
- Use the Winston logger (`config/logger.js`) — never `console.log`. Logging of request
  errors is centralized in the global handler; controllers should not log-and-swallow.
- Success responses use the `{ success: true, data }` envelope; failures are produced by the
  global handler as `{ success: false, error, code? }`.
- Validate all input at the boundary with `validate(schemas.xxx, req, res)` and `return`
  immediately if it yields `null`. Parse route ids with `parseId()`.

### Lists & Pagination
- List endpoints that may grow use `utils/pagination.js`: opt-in via `?page`/`?limit` (default 20, max 100),
  envelope `{ items, pagination: { total, page, limit, pages, hasMore } }`. Without those params the response
  stays un-paginated — never break an existing caller.
- Any list of products is sorted with `utils/productLayout.js` (root `CLAUDE.md` §9).

### Dates
- Dates are business dates in **IST**. Use `utils/dateUtils.js` (`getIndiaDateStr`, `getIndiaTomorrowStr`).
- Never compare a stored DATE column against `new Date()` in a Prisma filter — `npm run lint:tz` (CI) fails it.
  Use `new Date(getIndiaDateStr())`.

### Balance Invariant
> Every balance record = sum of all prior + current transactions for that entity/date.

- **Never** update a balance directly. Always call `recalculateDairyBalance` or `recalculateSalespersonBalance` from `services/balanceService.js`.
- These functions use `prisma.$transaction(..., { isolationLevel: 'Serializable' })` to prevent write-skew.
- The `tx` parameter must be threaded through all helper calls inside a transaction — never use the global `prisma` client inside a transaction block.
- Payment create/update/delete with a changed date goes through `services/paymentLedger.js`, which recalculates both the old and the new date.

### Migrations
- Schema changes → `npx prisma migrate dev --name <description>` locally.
- `prisma migrate deploy` runs automatically on boot in production (via `index.js`).
- Never edit a migration file after it has been applied.
- Never use `prisma db push` in production.
- Prisma 7: the datasource URL is in `prisma.config.ts`; the runtime client gets it via the adapter in `lib/prisma.js`. A bare `new PrismaClient()` does not work.

### Seeding
- `prisma/seed.js` → `seedFoundationData()` only: the superadmin (created/synced from `SUPERADMIN_USERNAME` /
  `SUPERADMIN_PASSWORD` when both are set) and the `AppSettings` rows `edit_pin`, `pl_pin`, `pl_pin_enabled`
  (each written only if missing, so UI changes survive redeploys). Brands are created in the UI, not seeded.
- Product/category/route seeds belong in separate one-time scripts under `scripts/`.
- `seedFoundationData` must be idempotent (upsert / create-if-missing, never insert-only).

### Security
- PIN endpoints: rate-limited to 20 attempts per 15 min (express-rate-limit). PINs are bcrypt hashes in
  `AppSettings` — never compare against `env.EDIT_PIN` at runtime.
- MFA: TOTP secrets are encrypted with `utils/mfaCrypto.js` (key derived from `JWT_SECRET`); backup codes are
  bcrypt-hashed and consumed on use. Never log or return a secret after enrolment.
- Lock-out: `services/accountLockService.js` — 5 wrong passwords or MFA codes (`ACCOUNT_LOCK_THRESHOLD`) lock
  an AdminUser for 30 min (`ACCOUNT_LOCK_COOLDOWN_MS`); expiry is checked on login, no background job.
- Client IP for logs/Slack is `req.ip` (trust proxy = 1). Never read `X-Forwarded-For` directly; it is client-spoofable.
- Untrusted text going into Slack cards (public client-error beacon) must pass through `escapeSlack`.
- Payload limit: `express.json({ limit: '10kb' })`.
- JWT expiry: 2 hours (`JWT_EXPIRES_IN: 7200`). Client session timeout must match (`SESSION_MS = 2 * 60 * 60 * 1000`).
- Auth is the `Authorization: Bearer` header only. Login also sets a cookie, but `authenticate` does not honour it — do not start.
- No secrets in code, and **no insecure fallback defaults for secrets**. All config is read
  through `config/env.js`, which validates `process.env` with Zod at boot and **fails closed
  in production** (missing/short `JWT_SECRET`, `DATABASE_URL`, `ADMIN_PASSWORD` refuse to boot).
  Never read `process.env` for a secret directly — import `config/env.js`. Exceptions: `logger.js`
  and `index.js` read `NODE_ENV`, `utils/version.js` reads build metadata.

### Logging
- Use Winston logger (`config/logger.js`) — never `console.log/error` (ESLint `no-console` is an error).
- Console transport always active (stdout visible on Render/any platform).
- Production: JSON format. Development: colorized simple format.

## Testing (this folder)

| Suite | Where | Runs | Proves |
|---|---|---|---|
| Mocked Playwright specs | `tests/playwright/*.spec.js` | every PR (`npm run test:coverage`, c8 gate 70/80/85/70) | code logic with a mocked Prisma |
| API automation | `automation/` (see `automation/CLAUDE.md`) | after merge to `develop`; `@smoke` after merge to `main` | the deployed backend + real DB |

- Endpoint behaviour → a scenario in `automation/`. Unit logic, rate-limit exhaustion, lock-out/MFA, Slack card
  shape, forged tokens → a mocked spec in `tests/playwright/`. `automation/COVERAGE.md` maps one to the other —
  update it when you add or remove a mocked spec file.
- **Every path and branch you add or change must be covered by the API automation** (root `CLAUDE.md` §17.1a): all roles, every validation rule, every `if`/`throw`/default, every data state and side effect. Branches the API cannot reach go in a mocked spec and in `COVERAGE.md`.
- `npm run check` = lint + timezone lint + mocked specs. Run it before pushing.
- `automation/` is excluded from `eslint`, Prettier and c8; never import from it in server code (or vice versa).

## What NOT to Do
- Do not add retry loops for DB connections (Render/Aiven handles uptime).
- Do not add `waitForDb` or similar — `app.listen()` must fire first.
- Do not put logic in route files.
- Do not call `prisma` directly inside a transaction block (pass `tx`).
- Do not expose raw Prisma errors to clients.
- Do not seed products/categories on every boot.
- Do not rotate `JWT_SECRET` casually — it also keys the MFA secret encryption (every authenticator would need re-enrolling).
- Do not put files the server needs at runtime under `automation/`; it is a separate Maven project.
