# 📐 Server Coding Standards

[⬅️ Server README](../README.md) · Binding rules: [server/CLAUDE.md](../CLAUDE.md)

---

## 1. 🧱 Canonical patterns

### Route (thin)

```js
// routes/products.js
const router = require('express').Router();
const controller = require('../controllers/products.controller');
router.get('/',    controller.getAll);
router.post('/',   controller.create);
router.put('/:id', controller.update);
module.exports = router;
```

### Controller

```js
const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const { assertAdmin } = require('../utils/authz');
const prisma = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');

const update = asyncHandler(async (req, res) => {
  assertAdmin(req);
  const id = parseId(req.params.id, 'Product ID');
  const data = validate(schemas.updateProduct, req, res);
  if (!data) return;                                        // 400 already sent
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new AppError('Product not found', 404);
  const product = await prisma.product.update({ where: { id }, data });
  void notifySlack(SLACK_EVENTS.PRODUCT_UPDATED, { name: product.name, brandId: product.brandId });
  res.json({ success: true, data: product });
});
```

### Multi-table write

```js
const result = await prisma.$transaction(async (tx) => {
  const saved = await tx.salespersonPayment.create({ data });
  await recalculateSalespersonBalance(data.salespersonId, data.paymentDate, tx);
  return saved;
}, { isolationLevel: 'Serializable' });
```

### Sorted product list

```js
const { buildCategoryOrderMap, compareProductsByLayout } = require('../utils/productLayout');
const [products, categories] = await Promise.all([
  prisma.product.findMany({ include: { brand: { select: { id: true, name: true, displayOrder: true } } } }),
  prisma.category.findMany({ select: { brandId: true, name: true, displayOrder: true } }),
]);
const catOrder = buildCategoryOrderMap(categories);
products.sort(compareProductsByLayout(catOrder));
```

## 2. ✅ / ❌ Quick reference

| ✅ Do | ❌ Don't |
|---|---|
| `asyncHandler` on every handler | `try/catch` in controllers |
| `throw new AppError(msg, status)` | `throw new Error(msg)` |
| `validate()` then `if (!data) return` | trust `req.body` |
| `parseId(req.params.id, 'X ID')` | `parseInt(req.params.id)` |
| `require('../lib/prisma')` | `new PrismaClient()` |
| pass `tx` inside transactions | use `prisma` inside `$transaction` |
| `recalculate*Balance` | write balance rows |
| `require('../config/env')` | `process.env.SECRET` |
| `logger.info(msg, ctx)` | `console.log` |
| `void notifySlack(…)` | `await notifySlack(…)` |
| `getIndiaDateStr()` | `lte: new Date()` in filters |
| `utils/productLayout` | hand-rolled category sort |
| new migration | edit an applied migration |

## 3. 🏷️ Naming

| Thing | Convention | Example |
|---|---|---|
| Controller file | `<resource>.controller.js` | `salespersonPayments.controller.js` |
| Route file | `<resource>.js` | `routes/salespersonPayments.js` |
| Zod schema | `verbNoun` | `createSalespersonPayment` |
| Slack event | `NOUN_VERB_PAST` | `SALESPERSON_PAYMENT_RECORDED` |
| URL | kebab-case plural | `/salesperson-payments` |
| DB column | snake_case via `@map` | `payment_date` |

## 4. 🧹 Tooling

| Tool | Config | Command |
|---|---|---|
| ESLint 10 (flat) | `eslint.config.js` — `no-console`, `prefer-const`, `eqeqeq` | `npm run lint` |
| Prettier | `.prettierrc.json`, `.prettierignore` | `npm run format` |
| Timezone lint | `scripts/check-timezone-safety.js` | `npm run lint:tz` |

## 5. 👀 Review checklist

- [ ] Route thin; guard present; controller re-checks role
- [ ] Input validated; ids parsed
- [ ] Transaction for multi-table writes, `tx` threaded
- [ ] Ledger recalculated where money/stock moved
- [ ] Slack event fired
- [ ] Products sorted by layout
- [ ] Tests at the right layer; `COVERAGE.md` updated if a spec file changed
- [ ] `docs/openapi.yaml` and these docs updated
