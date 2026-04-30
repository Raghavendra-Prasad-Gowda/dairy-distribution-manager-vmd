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
- All controller methods wrapped in try/catch.
- Use `logger.error(msg, { message: err.message })` — never `console.log`.
- Return `{ success: false, error: 'human-readable message' }` with appropriate HTTP status.
- Never leak stack traces or Prisma internals to the client.

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
- PIN endpoint: rate-limited to 5 attempts per 15 min (express-rate-limit).
- Payload limit: `express.json({ limit: '10kb' })`.
- JWT expiry: 12 hours. Client session timeout must match.
- No secrets in code. All secrets via environment variables.

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
