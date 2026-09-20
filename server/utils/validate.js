const { z } = require('zod');
const AppError = require('./AppError');
const { getIndiaDateStr, getIndiaTomorrowStr } = require('./dateUtils');

// ─── Shared building blocks ──────────────────────────────────────────────────
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const dateString = (msg = 'Date must be YYYY-MM-DD') => z.string().regex(DATE_REGEX, msg);
// For price effective-from fields: must be today (IST) or later. Past dates
// would either re-bill historical transactions or sit invisible — we disallow
// both at the schema boundary.
const todayOrLaterDateString = (msg = 'Effective date must be today or later') =>
  z
    .string()
    .regex(DATE_REGEX, 'Date must be YYYY-MM-DD')
    .refine((v) => v >= getIndiaDateStr(), { message: msg });
// For stock receipts and dispatches: no one can physically receive or hand
// out stock they don't have yet, so a date can't run ahead of "today or
// tomorrow" (tomorrow stays allowed so an entry made just after IST midnight
// for the day about to start still goes through). The client's DateSelector
// enforces the same today+1 ceiling — this is the server-side backstop so it
// can't be bypassed by calling the API directly.
const notBeyondTomorrowDateString = (
  msg = 'You can only enter stock for today or tomorrow. Please pick an earlier date.'
) =>
  z
    .string()
    .regex(DATE_REGEX, 'Date must be YYYY-MM-DD')
    .refine((v) => v <= getIndiaTomorrowStr(), { message: msg });
const PAYMENT_MODES = ['Cash', 'UPI', 'NEFT', 'RTGS', 'Cheque', 'Online'];
const paymentMode = z.enum(PAYMENT_MODES).optional();
const shortText = z.string().max(500).optional();

// ─── Schema Definitions ──────────────────────────────────────────────────────

const schemas = {
  // Auth
  login: z.object({
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(1, 'Password is required'),
  }),
  changePassword: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  }),
  verifyPin: z.object({
    // Accept string or number from the client, coerce to string for comparison.
    pin: z
      .union([z.string(), z.number()])
      .transform(String)
      .pipe(z.string().min(1, 'PIN is required')),
  }),

  // MFA — self-service (superadmin only)
  verifyMfaLogin: z.object({
    mfaToken: z.string().min(1, 'MFA session token is required'),
    // 6-digit TOTP code or an "XXXXX-XXXXX" backup code.
    code: z.string().min(6, 'Code is required').max(20, 'Code is too long'),
  }),
  confirmMfa: z.object({
    code: z
      .string()
      .length(6, 'Code must be exactly 6 digits')
      .regex(/^\d{6}$/, 'Code must be digits only'),
  }),
  disableMfa: z.object({
    password: z.string().min(1, 'Password is required'),
  }),

  // MFA — forced first-time enrollment, driven by a superadmin-set
  // mfaRequired policy on someone else's account (see setMfaRequired below).
  // These carry the same short-lived mfaToken login() hands back — no full
  // session exists yet, so there's no other way to authenticate the call.
  mfaSetupToken: z.object({
    mfaToken: z.string().min(1, 'MFA session token is required'),
  }),
  confirmRequiredMfa: z.object({
    mfaToken: z.string().min(1, 'MFA session token is required'),
    code: z
      .string()
      .length(6, 'Code must be exactly 6 digits')
      .regex(/^\d{6}$/, 'Code must be digits only'),
  }),

  // Superadmin forcing/lifting an MFA requirement on another admin/superadmin
  // account (never dispatcher — enforced in the controller).
  setMfaRequired: z.object({
    required: z.boolean(),
  }),

  updatePin: z.object({
    currentPin: z
      .union([z.string(), z.number()])
      .transform(String)
      .pipe(z.string().min(1, 'Current PIN is required')),
    newPin: z
      .union([z.string(), z.number()])
      .transform(String)
      .pipe(
        z
          .string()
          .length(6, 'New PIN must be exactly 6 digits')
          .regex(/^\d{6}$/, 'New PIN must be digits only')
      ),
  }),
  updatePinSettings: z.object({
    plPinEnabled: z.boolean(),
  }),

  // Brands
  createBrand: z.object({
    name: z.string().min(1, 'Brand name is required'),
  }),
  copyBrandProducts: z.object({
    sourceBrandId: z.number().int().positive('Source brand ID is required'),
  }),
  updateBrand: z.object({
    name: z.string().min(1, 'Brand name is required').optional(),
    depositEnabled: z.boolean().optional(),
    depositPerLitre: z.number().min(0).optional(),
    isActive: z.boolean().optional(),
    isArchived: z.boolean().optional(),
  }),

  // Categories
  createCategory: z.object({
    brandId: z.number().int().positive('Brand ID is required'),
    name: z.string().min(1, 'Category name is required'),
  }),

  // Products
  createProduct: z.object({
    brandId: z.number().int().positive('Brand ID is required'),
    name: z.string().min(1, 'Product name is required'),
    category: z.string().optional().nullable(),
    unitType: z.enum(['ml', 'gram', 'piece']).default('piece'),
    unitSize: z.number().int().positive().optional().nullable(),
    mlPerCrate: z.number().int().positive().optional().nullable(),
    containerType: z.enum(['crate', 'box']).optional().nullable(),
    unitsPerContainer: z.number().int().positive().optional().nullable(),
    costPrice: z.number().min(0).default(0),
    sellingPrice: z.number().min(0).default(0),
    effectiveFrom: todayOrLaterDateString(
      'Cost price effective date must be today or later'
    ).optional(),
    sellingPriceEffectiveFrom: todayOrLaterDateString(
      'Selling price effective date must be today or later'
    ).optional(),
  }),
  updateProduct: z.object({
    name: z.string().min(1).optional(),
    category: z.string().optional().nullable(),
    unitType: z.enum(['ml', 'gram', 'piece']).optional(),
    unitSize: z.number().int().positive().optional().nullable(),
    mlPerCrate: z.number().int().positive().optional().nullable(),
    containerType: z.enum(['crate', 'box']).optional().nullable(),
    unitsPerContainer: z.number().int().positive().optional().nullable(),
    costPrice: z.number().min(0).optional(),
    sellingPrice: z.number().min(0).optional(),
    isActive: z.boolean().optional(),
    showInStockReceipt: z.boolean().optional(),
    depositEnabled: z.boolean().optional(),
    effectiveFrom: todayOrLaterDateString(
      'Cost price effective date must be today or later'
    ).optional(),
    sellingPriceEffectiveFrom: todayOrLaterDateString(
      'Selling price effective date must be today or later'
    ).optional(),
  }),

  // Layout reordering — dairy
  reorderBrands: z.array(
    z.object({
      id: z.number().int().positive(),
      displayOrder: z.number().int().nonnegative(),
    })
  ),
  reorderProducts: z.array(
    z.object({
      id: z.number().int().positive(),
      displayOrder: z.number().int().nonnegative(),
    })
  ),
  reorderCategories: z.array(
    z.object({
      id: z.number().int().positive(),
      displayOrder: z.number().int().nonnegative(),
    })
  ),
  // Bulk update of the global salesperson-access flag / default price per product.
  // The "enabling requires a positive default price" rule is enforced in the
  // controller (it needs the cross-field context) but the shapes are checked here.
  updateSalespersonGlobal: z.object({
    products: z
      .array(
        z.object({
          productId: z.number().int().positive('productId is required'),
          isEnabled: z.boolean().optional(),
          // Price SEMANTICS ("must be > 0 to enable") are enforced in the controller
          // where the cross-field context lives; here we only check the type.
          defaultPrice: z.number().optional(),
        })
      )
      .min(1, 'products array is required'),
  }),

  // Stock Receipts (qty 0 is meaningful — it means "no receipt for this product
  // on this day", and the controller filters those out before insert)
  bulkStockReceipt: z.object({
    brandId: z.number().int().positive(),
    date: notBeyondTomorrowDateString(),
    routeId: z.number().int().nonnegative().optional().default(0),
    items: z
      .array(
        z.object({
          productId: z.number().int().positive(),
          quantity: z.number().min(0),
          unitPrice: z.number().min(0),
        })
      )
      .default([]),
  }),

  // Dairy Payment
  updateDairyPayment: z.object({
    amount: z.number().positive('Amount must be positive'),
    paymentDate: dateString(),
    paymentMode,
    reference: shortText,
    notes: shortText,
  }),
  createDairyPayment: z.object({
    brandId: z.number().int().positive(),
    paymentDate: dateString(),
    amount: z.number().positive('Amount must be positive'),
    paymentMode,
    reference: shortText,
    notes: shortText,
  }),

  // Routes
  createRoute: z.object({
    brandId: z.number().int().positive('Brand ID is required'),
    routeNumber: z.string().min(1, 'Route number is required'),
    displayOrder: z.number().int().nonnegative().optional(),
  }),
  updateRoute: z.object({
    routeNumber: z.string().min(1).optional(),
    displayOrder: z.number().int().nonnegative().optional(),
    isActive: z.boolean().optional(),
  }),

  // Salespeople
  createSalesperson: z.object({
    name: z.string().min(1, 'Name is required'),
    phone: z.string().optional(),
    route: z.string().optional(),
    username: z.string().min(3, 'Username must be at least 3 characters').optional(),
    password: z.string().min(6, 'Password must be at least 6 characters').optional(),
    displayOrder: z.number().int().nonnegative().optional(),
  }),
  updateSalesperson: z.object({
    name: z.string().min(1).optional(),
    phone: z.string().optional(),
    route: z.string().optional(),
    isActive: z.boolean().optional(),
    username: z.string().min(3, 'Username must be at least 3 characters').optional().nullable(),
    password: z.string().min(6, 'Password must be at least 6 characters').optional(),
    displayOrder: z.number().int().nonnegative().optional(),
  }),
  reorderSalespeople: z.array(
    z.object({
      id: z.number().int().positive(),
      displayOrder: z.number().int().nonnegative(),
    })
  ),

  // Salesperson Product Visibility
  bulkSalespersonProducts: z.object({
    products: z
      .array(
        z.object({
          productId: z.number().int().positive(),
          isEnabled: z.boolean(),
        })
      )
      .min(1, 'At least one product is required'),
  }),

  bulkUpdateMultipleSalespersonProducts: z.object({
    salespersonIds: z
      .array(z.number().int().positive())
      .min(1, 'At least one salesman is required'),
    products: z
      .array(
        z.object({
          productId: z.number().int().positive(),
          isEnabled: z.boolean(),
        })
      )
      .min(1, 'At least one product is required'),
  }),

  // Salesperson Prices — effective dates must be today (IST) or later.
  // Past dates are rejected: they'd be invisible (GET filters lte today)
  // and changing the past would either sit silently or re-bill old
  // dispatches. Future dates are explicitly allowed (scheduled changes).
  bulkSalespersonPrices: z.object({
    effectiveFrom: todayOrLaterDateString(),
    prices: z.array(
      z.object({
        productId: z.number().int().positive(),
        sellingPrice: z.number().min(0),
        effectiveFrom: todayOrLaterDateString().optional(),
      })
    ),
  }),

  // Bulk update multiple products across multiple salesmen
  bulkUpdateSalespersonPrices: z.object({
    salespersonIds: z
      .array(z.number().int().positive())
      .min(1, 'At least one salesman is required'),
    productPrices: z
      .array(
        z.object({
          productId: z.number().int().positive('Product ID is required'),
          sellingPrice: z.number().min(0, 'Selling price must be non-negative'),
        })
      )
      .min(1, 'At least one product is required'),
    effectiveFrom: todayOrLaterDateString(),
  }),

  // Dispatch (salespersonId optional — server injects it for salesman role)
  createDispatch: z.object({
    salespersonId: z.number().int().positive().optional(),
    dispatchDate: notBeyondTomorrowDateString(),
    // Empty items means "clear my draft for this date" — the controller
    // deletes the existing dispatch (if any) and cascades the balance.
    items: z
      .array(
        z.object({
          productId: z.number().int().positive(),
          quantity: z.number().positive(),
          unitPrice: z.number().min(0),
        })
      )
      .default([]),
    notes: shortText,
    // Set by StockEntry.jsx's Save-and-Submit flow, which re-saves
    // unconditionally right before locking the entry — the Submitted card
    // that follows already reports the same item count and total, so this
    // save's own Slack notification would be a redundant middle card. A
    // plain Save (this flag omitted) still notifies as always.
    submitting: z.boolean().optional().default(false),
  }),

  // Admin opens a blank past-date entry for a salesperson (no existing dispatch yet)
  openDispatchForEntry: z.object({
    salespersonId: z.number().int().positive(),
    dispatchDate: dateString(),
  }),

  // Salesperson Payment
  createSalespersonPayment: z.object({
    salespersonId: z.number().int().positive(),
    paymentDate: dateString(),
    amount: z.number().positive('Amount must be positive'),
    paymentMode,
    reference: shortText,
    notes: shortText,
  }),
  updateSalespersonPayment: z.object({
    paymentDate: dateString(),
    amount: z.number().positive('Amount must be positive'),
    paymentMode,
    reference: shortText,
    notes: shortText,
  }),

  // Bulk top-up — admin loads pre-existing dues for several salesmen at once
  bulkSalespersonTopUp: z.object({
    paymentDate: dateString(),
    notes: shortText,
    entries: z
      .array(
        z.object({
          salespersonId: z.number().int().positive(),
          amount: z.number().positive('Amount must be positive'),
        })
      )
      .min(1, 'At least one salesperson is required'),
  }),

  // Bulk ledger reset — wipes the financial history of several salesmen
  bulkResetLedger: z.object({
    salespersonIds: z
      .array(z.number().int().positive())
      .min(1, 'At least one salesperson is required'),
  }),

  // Bulk top-up — admin loads dues already owed to several brands at once.
  // Adds to DairyBalance.topUpAmount (money owed for stock). Deliberately
  // separate from bulkDairyDepositTopUp below — a deposit top-up must never
  // touch this balance.
  bulkDairyTopUp: z.object({
    paymentDate: dateString(),
    notes: shortText,
    entries: z
      .array(
        z.object({
          brandId: z.number().int().positive(),
          amount: z.number().positive('Amount must be positive'),
        })
      )
      .min(1, 'At least one brand is required'),
  }),

  // Bulk deposit top-up — loads a crate/container deposit already held with
  // several brands from before the app. Writes to the standalone
  // DairyDepositTopUp ledger only — never DairyBalance/topUpAmount, which
  // tracks money owed for stock, a separate concern from deposit held.
  bulkDairyDepositTopUp: z.object({
    topUpDate: dateString(),
    notes: shortText,
    entries: z
      .array(
        z.object({
          brandId: z.number().int().positive(),
          amount: z.number().positive('Amount must be positive'),
        })
      )
      .min(1, 'At least one brand is required'),
  }),

  // Admin Users (superadmin-only)
  createAdminUser: z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    role: z.enum(['admin', 'superadmin', 'dispatcher']).default('admin'),
  }),
  updateAdminUser: z.object({
    username: z.string().min(3, 'Username must be at least 3 characters').optional(),
    password: z.string().min(6, 'Password must be at least 6 characters').optional(),
    role: z.enum(['admin', 'superadmin', 'dispatcher']).optional(),
    isActive: z.boolean().optional(),
  }),

  // Bills — the printed cash/credit bill handed to a salesperson for a supply
  // period. The date range is historical by nature (a month that has already
  // been supplied), so unlike stock entry there is no today/tomorrow ceiling;
  // the range is only checked for from <= to, in the controller.
  createBill: z.object({
    salespersonId: z.number().int().positive('Salesperson is required'),
    from: dateString('From date must be YYYY-MM-DD'),
    to: dateString('To date must be YYYY-MM-DD'),
    // M/s on the pad — defaults to the salesperson's own name when omitted.
    partyName: z.string().max(120, 'M/s name is too long').optional(),
    poNumber: z.string().max(50, 'PO number is too long').optional(),
  }),

  // Client error reporting (public, unauthenticated — see routes/clientErrors.js).
  // All fields optional (a crash report with nothing useful should still be
  // accepted, not rejected), but capped so an unauthenticated caller can't
  // stuff an oversized/malicious payload into the Slack card built from it.
  reportClientError: z.object({
    message: z.string().max(2000, 'message is too long').optional(),
    stack: z.string().max(5000, 'stack is too long').optional(),
    page: z.string().max(300, 'page is too long').optional(),
  }),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Validates req.body against the given Zod schema.
 * Returns parsed data on success.
 * Sends 400 and returns null on failure — caller must immediately return.
 */
function validate(schema, req, res) {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const message = result.error.issues.map((e) => e.message).join('; ');
    res.status(400).json({ success: false, error: message, code: 'VALIDATION_ERROR' });
    return null;
  }
  return result.data;
}

/**
 * Parses a route param string to a positive integer.
 * Throws AppError(400) on invalid input.
 */
function parseId(value, name = 'ID') {
  const id = parseInt(value, 10);
  if (isNaN(id) || id <= 0) throw new AppError(`Invalid ${name}`, 400);
  return id;
}

module.exports = { schemas, validate, parseId };
