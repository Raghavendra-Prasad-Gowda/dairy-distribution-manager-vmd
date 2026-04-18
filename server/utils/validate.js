const { z } = require('zod');
const AppError = require('./AppError');

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

  // Brands
  createBrand: z.object({
    name: z.string().min(1, 'Brand name is required'),
  }),
  updateBrand: z.object({
    name: z.string().min(1, 'Brand name is required'),
  }),

  // Categories
  createCategory: z.object({
    brandId: z.number().int().positive('Brand ID is required'),
    name:    z.string().min(1, 'Category name is required'),
  }),

  // Products
  createProduct: z.object({
    brandId:    z.number().int().positive('Brand ID is required'),
    name:       z.string().min(1, 'Product name is required'),
    category:   z.string().optional().nullable(),
    mlPerCrate: z.number().int().positive().optional().nullable(),
    dairyPrice: z.number().min(0).default(0),
  }),
  updateProduct: z.object({
    name:       z.string().min(1).optional(),
    category:   z.string().optional().nullable(),
    mlPerCrate: z.number().int().positive().optional().nullable(),
    dairyPrice: z.number().min(0).optional(),
    isActive:   z.boolean().optional(),
  }),

  // Stock Receipts
  bulkStockReceipt: z.object({
    brandId: z.number().int().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
    items: z.array(z.object({
      productId: z.number().int().positive(),
      quantity: z.number().min(0),
      unitPrice: z.number().min(0),
    })),
  }),

  // Dairy Payment
  createDairyPayment: z.object({
    brandId: z.number().int().positive(),
    paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amount: z.number().positive('Amount must be positive'),
    paymentMode: z.string().optional(),
    reference: z.string().optional(),
    notes: z.string().optional(),
  }),

  // Salespeople
  createSalesperson: z.object({
    name: z.string().min(1, 'Name is required'),
    phone: z.string().optional(),
    route: z.string().optional(),
  }),
  updateSalesperson: z.object({
    name: z.string().min(1).optional(),
    phone: z.string().optional(),
    route: z.string().optional(),
    isActive: z.boolean().optional(),
  }),

  // Salesperson Prices
  bulkSalespersonPrices: z.object({
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    prices: z.array(z.object({
      productId: z.number().int().positive(),
      sellingPrice: z.number().min(0),
    })),
  }),

  // Dispatch
  createDispatch: z.object({
    salespersonId: z.number().int().positive(),
    dispatchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    items: z.array(z.object({
      productId: z.number().int().positive(),
      quantity: z.number().positive(),
      unitPrice: z.number().min(0),
    })),
    notes: z.string().optional(),
  }),

  // Salesperson Payment
  createSalespersonPayment: z.object({
    salespersonId: z.number().int().positive(),
    paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amount: z.number().positive('Amount must be positive'),
    paymentMode: z.string().optional(),
    reference: z.string().optional(),
    notes: z.string().optional(),
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
    const message = result.error.errors.map((e) => e.message).join('; ');
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
