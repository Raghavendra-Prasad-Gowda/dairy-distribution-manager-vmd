const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const env = require('./config/env'); // validates & freezes config at boot (fail-fast)
const prisma = require('./lib/prisma');
const logger = require('./config/logger');
const { notifySlack, SLACK_EVENTS } = require('./utils/slack');
const { appVersion } = require('./utils/version');

// ─── Route imports ────────────────────────────────────────────────────────────
const authRoutes                = require('./routes/auth');
const brandsRoutes              = require('./routes/brands');
const productsRoutes            = require('./routes/products');
const categoriesRoutes          = require('./routes/categories');
const stockReceiptsRoutes       = require('./routes/stockReceipts');
const dairyBalanceRoutes        = require('./routes/dairyBalance');
const dairyPaymentsRoutes       = require('./routes/dairyPayments');
const dairyDepositTopUpsRoutes  = require('./routes/dairyDepositTopUps');
const salespeopleRoutes          = require('./routes/salespeople');
const salespersonPricesRoutes    = require('./routes/salespersonPrices');
const salespersonProductsRoutes  = require('./routes/salespersonProducts');
const dispatchesRoutes          = require('./routes/dispatches');
const salespersonBalanceRoutes  = require('./routes/salespersonBalance');
const salespersonPaymentsRoutes = require('./routes/salespersonPayments');
const reportsRoutes             = require('./routes/reports');
const billsRoutes               = require('./routes/bills');
const pinRoutes                 = require('./routes/pin');
const routesRoutes              = require('./routes/routes');
const clientErrorsRoutes        = require('./routes/clientErrors');
const adminUsersRoutes              = require('./routes/adminUsers');
const salespersonStatementRoutes    = require('./routes/salespersonStatement');
const { authenticate, requireAdmin, requireSuperAdmin } = require('./middleware/auth');

const app = express();

// Trust proxy is required when running behind Render/Vercel/Nginx
app.set('trust proxy', 1);

// ─── 1. Security headers ─────────────────────────────────────────────────────
app.use(helmet());

// ─── 2. CORS ─────────────────────────────────────────────────────────────────
const allowedOrigins = env.allowedOrigins;
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200,
}));

// ─── 3. HTTP logging ─────────────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// ─── 4. Global rate limiter ──────────────────────────────────────────────────
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again after 15 minutes',
}));

// ─── 5. Strict auth rate limiter ─────────────────────────────────────────────
app.use('/api/v1/auth/login', rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.LOGIN_RATE_LIMIT_MAX, // 20 unless a test environment raises it
  message: 'Too many login attempts, please try again after an hour',
}));

// Tighter limit on bulk endpoints that fan out large payload work
const bulkWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.BULK_WRITE_RATE_LIMIT_MAX, // 30 unless a test environment raises it
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many bulk requests, please slow down',
});

// ─── 6. Cookie parser ────────────────────────────────────────────────────────
app.use(cookieParser());

// ─── 7. Body parser ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));

// ─── Root & Health checks ─────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ name: 'Dairy Distribution Manager API', status: 'ok' }));

// Liveness: is the process up? Fast, no dependencies — a failing liveness probe
// tells the platform to RESTART the container.
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime(), ...appVersion }));

// Readiness: can we actually serve traffic (DB reachable)? A failing readiness
// probe tells the load balancer to STOP routing here without killing the pod.
// So an LB never reports healthy while Postgres is down or pool-exhausted.
app.get('/health/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready', uptime: process.uptime() });
  } catch (err) {
    logger.error('Readiness check failed — database unreachable.', { message: err.message });
    res.status(503).json({ status: 'unavailable', error: 'database unreachable' });
  }
});

// ─── Public routes ───────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/errors/client', clientErrorsRoutes);

// ─── Protected routes (all require authenticate) ─────────────────────────────
app.use('/api/v1', authenticate);

// Shared (admin + salesman) — role gating is per-route inside each router;
// salesman/dispatcher access the narrow slices they need (own dispatches,
// own balance, own prices), everything else returns 403 from the controller.
app.use('/api/v1/salesperson-statement', salespersonStatementRoutes);
app.use('/api/v1/dispatches',           dispatchesRoutes);
app.use('/api/v1/salesperson-balance',  salespersonBalanceRoutes);
app.use('/api/v1/salesperson-payments', salespersonPaymentsRoutes);
app.use('/api/v1/salespeople',          salespersonPricesRoutes);

// Admin-only salesperson sub-resources (bulk writes — rate-limited)
app.use('/api/v1/salespeople',          requireAdmin, bulkWriteLimiter, salespersonProductsRoutes);

// Admin-only routes — every route in these routers carries requireAdmin
// (or stricter) at the route level, so no blanket mount-level guard is
// needed for brands; the rest use the blanket pattern for consistency.
app.use('/api/v1/brands',               brandsRoutes);
app.use('/api/v1/products',             requireAdmin, productsRoutes);
app.use('/api/v1/categories',           requireAdmin, categoriesRoutes);
// stock-receipts and reports: most routes stay admin-only, but each router
// opens exactly the one read-only GET a dispatcher needs — gated per-route
// inside the router file instead of blanket-admin at the mount, so dispatcher
// never gets the write endpoints that live on the same router.
app.use('/api/v1/stock-receipts',       bulkWriteLimiter, stockReceiptsRoutes);
app.use('/api/v1/dairy-balance',        requireAdmin, dairyBalanceRoutes);
app.use('/api/v1/dairy-payments',       requireAdmin, dairyPaymentsRoutes);
app.use('/api/v1/dairy-deposit-topups', requireAdmin, dairyDepositTopUpsRoutes);
app.use('/api/v1/salespeople',          requireAdmin, salespeopleRoutes);
app.use('/api/v1/reports',              reportsRoutes);
app.use('/api/v1/bills',                requireAdmin, billsRoutes);
app.use('/api/v1/pin',                  requireAdmin, pinRoutes);
app.use('/api/v1/routes',               requireAdmin, routesRoutes);

// Super-admin-only routes
app.use('/api/v1/admin-users',          requireSuperAdmin, adminUsersRoutes);

// ─── Global error handler ─────────────────────────────────────────────────────
// Must be the last middleware. The 4-arg signature (incl. unused _next) is how
// Express recognizes this as an error handler — the arity matters, not the name.
app.use((err, req, res, _next) => {
  const isDev = env.isDev;

  // Prisma known error codes
  if (err.code === 'P2002') {
    return res.status(400).json({ success: false, error: 'A record with those values already exists', code: 'DUPLICATE' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ success: false, error: 'Record not found', code: 'NOT_FOUND' });
  }
  if (err.code === 'P2003') {
    return res.status(400).json({ success: false, error: 'Cannot delete: this record has associated data', code: 'FK_CONSTRAINT' });
  }

  // Operational errors (AppError)
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      ...(isDev && { stack: err.stack }),
    });
  }

  // Unexpected errors — log internally, return generic message
  logger.error('Unexpected error', { error: err.message, stack: err.stack });
  void notifySlack(SLACK_EVENTS.SERVER_ERROR, { method: req.method, path: req.path, message: err.message });
  res.status(500).json({
    success: false,
    error: 'An unexpected error occurred. Please try again.',
    ...(isDev && { stack: err.stack }),
  });
});

module.exports = app;
