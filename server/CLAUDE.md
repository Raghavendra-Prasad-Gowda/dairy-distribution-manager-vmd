# Server — Engineering Contract

## Structure

```
server/
├── app.js                  # Express app setup (middleware, route registration)
├── index.js                # Boot sequence: listen → migrate → seed
├── config/
│   └── logger.js           # Winston logger (always stdout, JSON in prod)
├── controllers/            # All request handlers — one file per domain
├── routes/                 # Thin routers — only path + method + controller ref
├── services/
│   └── balanceService.js   # Balance cascade logic (dairy + salesperson)
├── lib/
│   └── prisma.js           # Singleton Prisma client
└── prisma/
    ├── schema.prisma
    ├── seed.js             # Foundation data only (brands, admin user)
    └── migrations/
```

## Principles

### Controller/Route Split
- **Routes** (`routes/*.js`): path + HTTP method + controller reference only. Zero logic.
- **Controllers** (`controllers/*.controller.js`): all handler logic, DB calls, response formatting.
- Never put business logic in route files.

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
  immediately if it yields `null`.

### Balance Invariant
> Every balance record = sum of all prior + current transactions for that entity/date.

- **Never** update a balance directly. Always call `recalculateDairyBalance` or `recalculateSalespersonBalance` from `services/balanceService.js`.
- These functions use `prisma.$transaction(..., { isolationLevel: 'Serializable' })` to prevent write-skew.
- The `tx` parameter must be threaded through all helper calls inside a transaction — never use the global `prisma` client inside a transaction block.

### Migrations
- Schema changes → `npx prisma migrate dev --name <description>` locally.
- `prisma migrate deploy` runs automatically on boot in production (via `index.js`).
- Never edit a migration file after it has been applied.
- Never use `prisma db push` in production.

### Seeding
- `prisma/seed.js` → `seedFoundationData()` only: brands + admin user.
- Product/category/route seeds belong in separate one-time scripts under `scripts/`.
- `seedFoundationData` must be idempotent (upsert, never insert-only).

### Security
- PIN endpoints: rate-limited to 20 attempts per 15 min (express-rate-limit).
- JWTs are signed and verified with `HS256` only (`JWT_VERIFY_OPTS` in `utils/constants.js`) — always pass it to `jwt.verify`.
- Client IP for logs/Slack is `req.ip` (trust proxy = 1). Never read `X-Forwarded-For` directly; it is client-spoofable.
- Untrusted text going into Slack cards (public client-error beacon) must pass through `escapeSlack`.
- Run `npm audit` in `server/` and `client/` before release; no high/critical findings may ship.
- Payload limit: `express.json({ limit: '10kb' })`.
- JWT expiry: 2 hours (`JWT_EXPIRES_IN: 7200`). Client session timeout must match (`SESSION_MS = 2 * 60 * 60 * 1000`).
- No secrets in code, and **no insecure fallback defaults for secrets**. All config is read
  through `config/env.js`, which validates `process.env` with Zod at boot and **fails closed
  in production** (missing/short `JWT_SECRET`, `EDIT_PIN`, `DATABASE_URL`, `ADMIN_PASSWORD`
  refuse to boot). Never read `process.env` for a secret directly — import `config/env.js`.

### Logging
- Use Winston logger (`config/logger.js`) — never `console.log/error`.
- Console transport always active (stdout visible on Render/any platform).
- Production: JSON format. Development: colorized simple format.

## What NOT to Do
- Do not add retry loops for DB connections (Render/Aiven handles uptime).
- Do not add `waitForDb` or similar — `app.listen()` must fire first.
- Do not put logic in route files.
- Do not call `prisma` directly inside a transaction block (pass `tx`).
- Do not expose raw Prisma errors to clients.
- Do not seed products/categories on every boot.
