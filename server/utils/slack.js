'use strict';
const logger = require('../config/logger');
const prisma  = require('../lib/prisma');

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const APP_URL     = process.env.APP_URL || '';

// ─── Event catalogue ──────────────────────────────────────────────────────────
const SLACK_EVENTS = {
  // System
  SERVER_STARTED:  'SERVER_STARTED',
  SERVER_SHUTDOWN: 'SERVER_SHUTDOWN',
  SERVER_ERROR:    'SERVER_ERROR',
  CLIENT_ERROR:    'CLIENT_ERROR',
  // Auth
  LOGIN:        'LOGIN',
  LOGOUT:       'LOGOUT',
  FAILED_LOGIN: 'FAILED_LOGIN',
  // Stock receipts
  STOCK_RECEIPT_SAVED: 'STOCK_RECEIPT_SAVED',
  // Dairy payments
  DAIRY_PAYMENT_RECORDED: 'DAIRY_PAYMENT_RECORDED',
  DAIRY_PAYMENT_UPDATED:  'DAIRY_PAYMENT_UPDATED',
  DAIRY_PAYMENT_DELETED:  'DAIRY_PAYMENT_DELETED',
  // Dispatch
  DISPATCH_SAVED:   'DISPATCH_SAVED',
  DISPATCH_DELETED: 'DISPATCH_DELETED',
  // Salesperson payments
  SALESPERSON_PAYMENT_RECORDED: 'SALESPERSON_PAYMENT_RECORDED',
  SALESPERSON_PAYMENT_UPDATED:  'SALESPERSON_PAYMENT_UPDATED',
  SALESPERSON_PAYMENT_DELETED:  'SALESPERSON_PAYMENT_DELETED',
  // Bulk top-ups + ledger reset — distinct from the single-record events
  // above: these touch several salespeople/brands at once and are admin-
  // loaded balance adjustments, not a real collection/payment.
  SALESPERSON_TOPUP_RECORDED: 'SALESPERSON_TOPUP_RECORDED',
  DAIRY_TOPUP_RECORDED:       'DAIRY_TOPUP_RECORDED',
  SALESPERSON_LEDGER_RESET:   'SALESPERSON_LEDGER_RESET',
  // Setup — salespeople
  SALESPERSON_CREATED: 'SALESPERSON_CREATED',
  SALESPERSON_UPDATED: 'SALESPERSON_UPDATED',
  // Setup — products
  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  PRODUCT_DELETED: 'PRODUCT_DELETED',
  // Setup — categories
  CATEGORY_CREATED: 'CATEGORY_CREATED',
  CATEGORY_UPDATED: 'CATEGORY_UPDATED',
  CATEGORY_DELETED: 'CATEGORY_DELETED',
  // Setup — routes
  ROUTE_CREATED: 'ROUTE_CREATED',
  ROUTE_UPDATED: 'ROUTE_UPDATED',
  ROUTE_DELETED: 'ROUTE_DELETED',
};

// ─── Colors ───────────────────────────────────────────────────────────────────
const COLORS = {
  GREEN: '#2eb886',
  BLUE:  '#1264a3',
  AMBER: '#e8a838',
  RED:   '#e01e5a',
  // Matches the teal "Deposit Top-up" badge used client-side, so a deposit
  // top-up is visually distinct from a plain dues top-up in Slack too.
  TEAL:  '#0f9488',
};

const EVENT_COLOR = {
  [SLACK_EVENTS.SERVER_STARTED]:  COLORS.GREEN,
  [SLACK_EVENTS.SERVER_SHUTDOWN]: COLORS.AMBER,
  [SLACK_EVENTS.SERVER_ERROR]:    COLORS.RED,
  [SLACK_EVENTS.CLIENT_ERROR]:    COLORS.RED,
  [SLACK_EVENTS.LOGIN]:           COLORS.GREEN,
  [SLACK_EVENTS.LOGOUT]:          COLORS.BLUE,
  [SLACK_EVENTS.FAILED_LOGIN]:    COLORS.RED,
  [SLACK_EVENTS.STOCK_RECEIPT_SAVED]:         COLORS.BLUE,
  [SLACK_EVENTS.DAIRY_PAYMENT_RECORDED]:      COLORS.GREEN,
  [SLACK_EVENTS.DAIRY_PAYMENT_UPDATED]:       COLORS.AMBER,
  [SLACK_EVENTS.DAIRY_PAYMENT_DELETED]:       COLORS.RED,
  [SLACK_EVENTS.DISPATCH_SAVED]:              COLORS.BLUE,
  [SLACK_EVENTS.DISPATCH_DELETED]:            COLORS.RED,
  [SLACK_EVENTS.SALESPERSON_PAYMENT_RECORDED]: COLORS.GREEN,
  [SLACK_EVENTS.SALESPERSON_PAYMENT_UPDATED]:  COLORS.AMBER,
  [SLACK_EVENTS.SALESPERSON_PAYMENT_DELETED]:  COLORS.RED,
  [SLACK_EVENTS.SALESPERSON_TOPUP_RECORDED]:   COLORS.AMBER,
  [SLACK_EVENTS.DAIRY_TOPUP_RECORDED]:         COLORS.AMBER, // overridden to TEAL for a deposit top-up
  [SLACK_EVENTS.SALESPERSON_LEDGER_RESET]:     COLORS.RED,
  [SLACK_EVENTS.SALESPERSON_CREATED]: COLORS.GREEN,
  [SLACK_EVENTS.SALESPERSON_UPDATED]: COLORS.AMBER,
  [SLACK_EVENTS.PRODUCT_CREATED]: COLORS.GREEN,
  [SLACK_EVENTS.PRODUCT_UPDATED]: COLORS.AMBER,
  [SLACK_EVENTS.PRODUCT_DELETED]: COLORS.RED,
  [SLACK_EVENTS.CATEGORY_CREATED]: COLORS.GREEN,
  [SLACK_EVENTS.CATEGORY_UPDATED]: COLORS.AMBER,
  [SLACK_EVENTS.CATEGORY_DELETED]: COLORS.RED,
  [SLACK_EVENTS.ROUTE_CREATED]: COLORS.GREEN,
  [SLACK_EVENTS.ROUTE_UPDATED]: COLORS.AMBER,
  [SLACK_EVENTS.ROUTE_DELETED]: COLORS.RED,
};

// ─── Formatting helpers ───────────────────────────────────────────────────────

/** "YYYY-MM-DD" → "Mon, 6 May 2026" */
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** Number → "₹1,22,750.40" */
function formatINR(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Current time as "7 May 2026, 09:53 AM" (IST) */
function istNow() {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

// ─── Block-kit primitives ─────────────────────────────────────────────────────

function headerBlock(text) {
  return { type: 'header', text: { type: 'plain_text', text, emoji: true } };
}

function dividerBlock() {
  return { type: 'divider' };
}

function fieldsBlock(pairs) {
  const populated = pairs.filter(([, v]) => v != null && v !== '');
  return {
    type: 'section',
    fields: populated.map(([label, value]) => ({
      type: 'mrkdwn',
      text: `*${label}*\n${value}`,
    })),
  };
}

function textBlock(md) {
  return { type: 'section', text: { type: 'mrkdwn', text: md } };
}

function footerBlock() {
  const ts      = istNow();
  const appLink = APP_URL ? `<${APP_URL}|Open App>  •  ` : '';
  return {
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `🏪 *Dairy Distribution Manager*  •  ${appLink}${ts} IST` }],
  };
}

function card(event, blocks, fallbackText, colorOverride) {
  return {
    text: fallbackText,
    attachments: [{
      color:  colorOverride || EVENT_COLOR[event] || COLORS.BLUE,
      blocks: [...blocks, dividerBlock(), footerBlock()],
    }],
  };
}

/** "['A','B','C']" → "A, B, C" — falls back to a bare count when no names came through. */
function joinNames(names, count, noun) {
  return (names && names.length > 0) ? names.join(', ') : `${count} ${noun}`;
}

// ─── Data enrichment ──────────────────────────────────────────────────────────

async function enrichData(event, rawData) {
  const data = { ...rawData };

  if (data.brandId != null && !data.brandName) {
    const b = await prisma.brand.findUnique({ where: { id: data.brandId }, select: { name: true } });
    data.brandName = b?.name ?? `Brand #${data.brandId}`;
  }

  if (data.salespersonId != null && !data.salespersonName) {
    const sp = await prisma.salesperson.findUnique({ where: { id: data.salespersonId }, select: { name: true } });
    data.salespersonName = sp?.name ?? `Salesperson #${data.salespersonId}`;
  }

  return data;
}

// ─── Card builders ────────────────────────────────────────────────────────────

function buildCard(event, data) {
  switch (event) {

    // ── System ─────────────────────────────────────────────────────────────
    case SLACK_EVENTS.SERVER_STARTED:
      return card(event, [
        headerBlock('🟢 Server Online'),
        fieldsBlock([
          ['🔧 Environment', data.env || 'unknown'],
          ['📡 App', 'Vikas Milk Dairy — Distribution Manager is running'],
        ]),
      ], `Server Online — ${data.env}`);

    case SLACK_EVENTS.SERVER_SHUTDOWN:
      return card(event, [
        headerBlock('🟡 Server Shutting Down'),
        fieldsBlock([
          ['🔧 Environment', data.env || 'unknown'],
          ['🛑 Signal', data.signal || 'SIGTERM'],
        ]),
      ], `Server Shutdown — ${data.env}`);

    case SLACK_EVENTS.SERVER_ERROR:
      return card(event, [
        headerBlock('🔴 Server Error — 500'),
        fieldsBlock([
          ['📍 Request', `\`${data.method} ${data.path}\``],
          ['❌ Message', data.message],
        ]),
      ], `Server Error: ${data.method} ${data.path} — ${data.message}`);

    case SLACK_EVENTS.CLIENT_ERROR:
      return card(event, [
        headerBlock('🔴 App Crash — Frontend Error'),
        fieldsBlock([
          ['👤 User',    data.username || 'Not logged in'],
          ['📍 Page',    data.page     || 'unknown'],
          ['❌ Message', data.message  || 'unknown'],
        ]),
        ...(data.stack ? [textBlock(`\`\`\`${data.stack.slice(0, 600)}\`\`\``)] : []),
      ], `Frontend crash on ${data.page}: ${data.message}`);

    // ── Auth ───────────────────────────────────────────────────────────────
    case SLACK_EVENTS.LOGIN: {
      const loginRole = data.role || 'Admin';
      return card(event, [
        headerBlock(`🔓 ${loginRole} Login`),
        fieldsBlock([
          ['👤 Username', data.username || 'unknown'],
          ['👑 Role',     loginRole],
          ['🌐 IP Address', data.ip     || 'unknown'],
        ]),
      ], `${loginRole} Login — ${data.username} from ${data.ip}`);
    }

    case SLACK_EVENTS.LOGOUT: {
      const logoutRole = data.role || 'Admin';
      return card(event, [
        headerBlock(`🚪 ${logoutRole} Logout`),
        fieldsBlock([
          ['👤 Username', data.username || 'unknown'],
          ['👑 Role',     logoutRole],
          ['🌐 IP Address', data.ip     || 'unknown'],
        ]),
      ], `${logoutRole} Logout — ${data.username} from ${data.ip}`);
    }

    case SLACK_EVENTS.FAILED_LOGIN:
      return card(event, [
        headerBlock('⚠️ Failed Login Attempt'),
        fieldsBlock([
          ['👤 Username Tried', `\`${data.attemptedUsername}\``],
          ['🌐 IP Address', data.ip || 'unknown'],
          ['❌ Reason', data.reason || 'Invalid credentials'],
        ]),
      ], `Failed Login — "${data.attemptedUsername}" from ${data.ip}`);

    // ── Stock Receipts ─────────────────────────────────────────────────────
    case SLACK_EVENTS.STOCK_RECEIPT_SAVED: {
      const stockVal   = Number(data.stockValue   ?? 0);
      const depositVal = Number(data.depositValue ?? 0);
      const billTotal  = stockVal + depositVal;

      const billLine = (data.depositEnabled && depositVal > 0)
        ? `${formatINR(stockVal)}  +  ${formatINR(depositVal)}  =  *${formatINR(billTotal)}*`
        : `*${formatINR(stockVal)}*`;

      return card(event, [
        headerBlock('📦 Stock Receipt Saved'),
        fieldsBlock([
          ['🏷️ Brand',    data.brandName],
          ['📅 Date',     formatDate(data.date)],
          ['🛣️ Route',    data.routeNumber || 'General'],
          ['📦 Products', String(data.savedCount)],
          ['🔢 Units',    data.totalUnits  != null ? String(data.totalUnits)  : null],
          ['🧺 Crates',   data.totalCrates != null ? `${data.totalCrates} Crates` : null],
          ['💰 Value',    formatINR(data.totalValue)],
        ]),
        dividerBlock(),
        textBlock(`*💳 Today's Bill*\n${billLine}`),
        fieldsBlock([
          ['🏦 Opening',  formatINR(data.openingBalance ?? 0)],
          ['💳 Paid',     formatINR(data.amountPaid    ?? 0)],
          ['💸 You Owe',  formatINR(data.closingBalance ?? 0)],
        ]),
      ], `Stock Receipt — ${data.brandName} on ${data.date}`);
    }

    // ── Dairy Payments ─────────────────────────────────────────────────────
    case SLACK_EVENTS.DAIRY_PAYMENT_RECORDED:
      return card(event, [
        headerBlock('✅ Dairy Payment Recorded'),
        fieldsBlock([
          ['🏷️ Brand',   data.brandName],
          ['📅 Date',    formatDate(data.date)],
          ['💰 Amount',  formatINR(data.amount)],
          ['💳 Mode',    data.paymentMode || 'Cash'],
          ['📝 Ref',     data.reference || null],
        ]),
      ], `Dairy Payment — ${data.brandName} — ${formatINR(data.amount)}`);

    case SLACK_EVENTS.DAIRY_PAYMENT_UPDATED:
      return card(event, [
        headerBlock('✏️ Dairy Payment Updated'),
        fieldsBlock([
          ['🏷️ Brand',   data.brandName],
          ['📅 Date',    formatDate(data.date)],
          ['💰 Amount',  formatINR(data.amount)],
          ['💳 Mode',    data.paymentMode || 'Cash'],
          ['📝 Ref',     data.reference || null],
        ]),
      ], `Dairy Payment Updated — ${data.brandName} — ${formatINR(data.amount)}`);

    case SLACK_EVENTS.DAIRY_PAYMENT_DELETED:
      return card(event, [
        headerBlock('🗑️ Dairy Payment Deleted'),
        fieldsBlock([
          ['🏷️ Brand',   data.brandName],
          ['📅 Date',    formatDate(data.date)],
          ['💰 Amount',  formatINR(data.amount)],
        ]),
      ], `Dairy Payment Deleted — ${data.brandName} — ${formatINR(data.amount)}`);

    // ── Dispatches ─────────────────────────────────────────────────────────
    case SLACK_EVENTS.DISPATCH_SAVED:
      return card(event, [
        headerBlock(`${data.isUpdate ? '✏️ Dispatch Updated' : '🚚 Dispatch Created'}`),
        fieldsBlock([
          ['👤 Salesperson', data.salespersonName],
          ['📅 Date',        formatDate(data.date)],
          ['📦 Items',       String(data.itemCount)],
          ['💰 Total',       formatINR(data.totalAmount)],
        ]),
      ], `Dispatch ${data.isUpdate ? 'Updated' : 'Created'} — ${data.salespersonName} — ${formatINR(data.totalAmount)}`);

    case SLACK_EVENTS.DISPATCH_DELETED:
      return card(event, [
        headerBlock('🗑️ Dispatch Deleted'),
        fieldsBlock([
          ['👤 Salesperson', data.salespersonName],
          ['📅 Date',        formatDate(data.date)],
          ['💰 Total',       formatINR(data.totalAmount)],
        ]),
      ], `Dispatch Deleted — ${data.salespersonName} on ${data.date}`);

    // ── Salesperson Payments ───────────────────────────────────────────────
    case SLACK_EVENTS.SALESPERSON_PAYMENT_RECORDED:
      return card(event, [
        headerBlock('✅ Collection Recorded'),
        fieldsBlock([
          ['👤 Salesperson', data.salespersonName],
          ['📅 Date',        formatDate(data.date)],
          ['💰 Amount',      formatINR(data.amount)],
          ['💳 Mode',        data.paymentMode || 'Cash'],
          ['📝 Ref',         data.reference || null],
        ]),
      ], `Collection — ${data.salespersonName} — ${formatINR(data.amount)}`);

    case SLACK_EVENTS.SALESPERSON_PAYMENT_UPDATED:
      return card(event, [
        headerBlock('✏️ Collection Updated'),
        fieldsBlock([
          ['👤 Salesperson', data.salespersonName],
          ['📅 Date',        formatDate(data.date)],
          ['💰 Amount',      formatINR(data.amount)],
          ['💳 Mode',        data.paymentMode || 'Cash'],
          ['📝 Ref',         data.reference || null],
        ]),
      ], `Collection Updated — ${data.salespersonName} — ${formatINR(data.amount)}`);

    case SLACK_EVENTS.SALESPERSON_PAYMENT_DELETED:
      return card(event, [
        headerBlock('🗑️ Collection Deleted'),
        fieldsBlock([
          ['👤 Salesperson', data.salespersonName],
          ['📅 Date',        formatDate(data.date)],
          ['💰 Amount',      formatINR(data.amount)],
        ]),
      ], `Collection Deleted — ${data.salespersonName} — ${formatINR(data.amount)}`);

    // ── Bulk top-ups (admin-loaded pre-existing dues) ──────────────────────
    case SLACK_EVENTS.SALESPERSON_TOPUP_RECORDED: {
      const names = joinNames(data.salespersonNames, data.count, 'salesperson(s)');
      return card(event, [
        headerBlock('💰 Salesperson Top-up Recorded'),
        fieldsBlock([
          ['👥 Salespeople', names],
          ['📅 Date',        formatDate(data.date)],
          ['🔢 Count',       String(data.count)],
          ['💰 Total',       formatINR(data.total)],
          ['🖊️ Added By',    data.createdBy],
          ['📝 Note',        data.notes || null],
        ]),
      ], `Salesperson Top-up — ${names} — ${formatINR(data.total)}`);
    }

    case SLACK_EVENTS.DAIRY_TOPUP_RECORDED: {
      const isDeposit = data.paymentMode === 'Deposit Top-up';
      const names     = joinNames(data.brandNames, data.count, 'brand(s)');
      return card(event, [
        headerBlock(isDeposit ? '🏦 Dairy Deposit Top-up Recorded' : '💰 Dairy Top-up Recorded'),
        fieldsBlock([
          ['🏷️ Brands',   names],
          ['📅 Date',     formatDate(data.date)],
          ['🔢 Count',    String(data.count)],
          ['💰 Total',    formatINR(data.total)],
          ['🖊️ Added By', data.createdBy],
          ['📝 Note',     data.notes || null],
        ]),
      ], `${isDeposit ? 'Dairy Deposit Top-up' : 'Dairy Top-up'} — ${names} — ${formatINR(data.total)}`,
         isDeposit ? COLORS.TEAL : COLORS.AMBER);
    }

    // ── Ledger reset (irreversible wipe) ───────────────────────────────────
    case SLACK_EVENTS.SALESPERSON_LEDGER_RESET: {
      const names = joinNames(data.salespersonNames, data.count, 'salesperson(s)');
      return card(event, [
        headerBlock('🧹 Salesperson Ledger Reset'),
        fieldsBlock([
          ['👥 Salespeople',          names],
          ['💳 Payments Removed',     String(data.payments)],
          ['🚚 Dispatches Removed',   String(data.dispatches)],
          ['📊 Balance Rows Removed', String(data.balances)],
          ['🖊️ Reset By',            data.by],
        ]),
      ], `Salesperson Ledger Reset — ${names} — by ${data.by}`);
    }

    // ── Setup ──────────────────────────────────────────────────────────────
    case SLACK_EVENTS.SALESPERSON_CREATED:
      return card(event, [
        headerBlock('👤 Salesperson Added'),
        fieldsBlock([
          ['👤 Name',    data.name],
          ['📞 Phone',   data.phone  || null],
          ['🛣️ Route',  data.route  || null],
        ]),
      ], `Salesperson Added — ${data.name}`);

    case SLACK_EVENTS.SALESPERSON_UPDATED:
      return card(event, [
        headerBlock('✏️ Salesperson Updated'),
        fieldsBlock([
          ['👤 Name',    data.name],
          ['📞 Phone',   data.phone  || null],
          ['🛣️ Route',  data.route  || null],
          ['🔘 Status',  data.isActive === false ? 'Deactivated ❌' : 'Active ✅'],
        ]),
      ], `Salesperson Updated — ${data.name}`);

    // ── Products ───────────────────────────────────────────────────────────
    case SLACK_EVENTS.PRODUCT_CREATED:
      return card(event, [
        headerBlock('🆕 Product Added'),
        fieldsBlock([
          ['🏷️ Brand',      data.brandName],
          ['📦 Name',       data.name],
          ['📂 Category',   data.category   || null],
          ['💰 Cost Price', formatINR(data.costPrice    ?? 0)],
          ['🏷 Sale Price', formatINR(data.sellingPrice ?? 0)],
        ]),
      ], `Product Added — ${data.name} (${data.brandName})`);

    case SLACK_EVENTS.PRODUCT_UPDATED:
      return card(event, [
        headerBlock('✏️ Product Updated'),
        fieldsBlock([
          ['🏷️ Brand',      data.brandName],
          ['📦 Name',       data.name],
          ['📂 Category',   data.category   || null],
          ['💰 Cost Price', formatINR(data.costPrice    ?? 0)],
          ['🏷 Sale Price', formatINR(data.sellingPrice ?? 0)],
          ['🔘 Status',     data.isActive === false ? 'Deactivated ❌' : 'Active ✅'],
        ]),
      ], `Product Updated — ${data.name} (${data.brandName})`);

    case SLACK_EVENTS.PRODUCT_DELETED:
      return card(event, [
        headerBlock('🗑️ Product Deactivated'),
        fieldsBlock([
          ['🏷️ Brand',    data.brandName],
          ['📦 Name',     data.name],
          ['📂 Category', data.category || null],
        ]),
      ], `Product Deactivated — ${data.name} (${data.brandName})`);

    // ── Categories ─────────────────────────────────────────────────────────
    case SLACK_EVENTS.CATEGORY_CREATED:
      return card(event, [
        headerBlock('🆕 Category Added'),
        fieldsBlock([
          ['🏷️ Brand', data.brandName],
          ['📂 Name',  data.name],
        ]),
      ], `Category Added — ${data.name} (${data.brandName})`);

    case SLACK_EVENTS.CATEGORY_UPDATED:
      return card(event, [
        headerBlock('✏️ Category Updated'),
        fieldsBlock([
          ['🏷️ Brand',   data.brandName],
          ['📂 Name',    data.name],
          ['💧 Deposit', data.depositEnabled ? 'Enabled ✅' : 'Disabled ❌'],
        ]),
      ], `Category Updated — ${data.name} (${data.brandName})`);

    case SLACK_EVENTS.CATEGORY_DELETED:
      return card(event, [
        headerBlock('🗑️ Category Deleted'),
        fieldsBlock([
          ['🏷️ Brand', data.brandName],
          ['📂 Name',  data.name],
        ]),
      ], `Category Deleted — ${data.name} (${data.brandName})`);

    // ── Routes ─────────────────────────────────────────────────────────────
    case SLACK_EVENTS.ROUTE_CREATED:
      return card(event, [
        headerBlock('🆕 Route Added'),
        fieldsBlock([
          ['🏷️ Brand',     data.brandName],
          ['🛣️ Route No.', String(data.routeNumber)],
        ]),
      ], `Route Added — ${data.routeNumber} (${data.brandName})`);

    case SLACK_EVENTS.ROUTE_UPDATED:
      return card(event, [
        headerBlock('✏️ Route Updated'),
        fieldsBlock([
          ['🏷️ Brand',     data.brandName],
          ['🛣️ Route No.', String(data.routeNumber)],
          ['🔘 Status',    data.isActive === false ? 'Deactivated ❌' : 'Active ✅'],
        ]),
      ], `Route Updated — ${data.routeNumber} (${data.brandName})`);

    case SLACK_EVENTS.ROUTE_DELETED:
      return card(event, [
        headerBlock('🗑️ Route Deleted'),
        fieldsBlock([
          ['🏷️ Brand',     data.brandName],
          ['🛣️ Route No.', String(data.routeNumber)],
        ]),
      ], `Route Deleted — ${data.routeNumber} (${data.brandName})`);

    default:
      return { text: `[VMD] Event: ${event}` };
  }
}

// ─── HTTP POST ────────────────────────────────────────────────────────────────

async function postToSlack(payload) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(WEBHOOK_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  ctrl.signal,
    });
    if (!res.ok) throw new Error(`Slack responded ${res.status}: ${await res.text()}`);
  } finally {
    clearTimeout(t);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fire-and-forget Slack notification. Never throws.
 * Set SLACK_WEBHOOK_URL env var to enable; unset = silent no-op.
 * Set APP_URL env var to add an "Open App" link in every card footer.
 */
const notifySlack = async (event, rawData = {}) => {
  if (!WEBHOOK_URL) return;
  try {
    const data    = await enrichData(event, rawData);
    const payload = buildCard(event, data);
    await postToSlack(payload);
  } catch (err) {
    logger.warn(`Slack [${event}]: ${err.message}`);
  }
};

// buildCard is exported alongside the public API purely so tests can assert
// on card content directly, without needing a live webhook or fighting
// require-cache timing to override the module-level WEBHOOK_URL constant.
module.exports = { notifySlack, SLACK_EVENTS, buildCard };
