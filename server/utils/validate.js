const { z } = require('zod');
const AppError = require('./AppError');

// ─── Shared building blocks ──────────────────────────────────────────────────
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const dateString = (msg = 'Date must be YYYY-MM-DD') => z.string().regex(DATE_REGEX, msg);
const PAYMENT_MODES = ['Cash', 'UPI', 'NEFT', 'RTGS', 'Cheque', 'Online'];
const paymentMode  = z.enum(PAYMENT_MODES).optional();
const shortText    = z.string().max(500).optional();

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
    name:              z.string().min(1, 'Brand name is required').optional(),
    depositEnabled:  z.boolean().optional(),
    depositPerLitre: z.number().min(0).optional(),
  }),

  // Categories
  createCategory: z.object({
    brandId: z.number().int().positive('Brand ID is required'),
    name:    z.string().min(1, 'Category name is required'),
  }),

  // Products
  createProduct: z.object({
    brandId:                    z.number().int().positive('Brand ID is required'),
    name:                       z.string().min(1, 'Product name is required'),
    category:                   z.string().optional().nullable(),
    unitType:                   z.enum(['ml', 'gram', 'piece']).default('piece'),
    unitSize:                   z.number().int().positive().optional().nullable(),
    mlPerCrate:                 z.number().int().positive().optional().nullable(),
    containerType:              z.enum(['crate', 'box']).optional().nullable(),
    unitsPerContainer:          z.number().int().positive().optional().nullable(),
    costPrice:                  z.number().min(0).default(0),
    sellingPrice:               z.number().min(0).default(0),
    effectiveFrom:              dateString().optional(),
    sellingPriceEffectiveFrom:  dateString().optional(),
  }),
  updateProduct: z.object({
    name:                       z.string().min(1).optional(),
    category:                   z.string().optional().nullable(),
    unitType:                   z.enum(['ml', 'gram', 'piece']).optional(),
    unitSize:                   z.number().int().positive().optional().nullable(),
    mlPerCrate:                 z.number().int().positive().optional().nullable(),
    containerType:              z.enum(['crate', 'box']).optional().nullable(),
    unitsPerContainer:          z.number().int().positive().optional().nullable(),
    costPrice:                  z.number().min(0).optional(),
    sellingPrice:               z.number().min(0).optional(),
    isActive:                   z.boolean().optional(),
    showInStockReceipt:         z.boolean().optional(),
    depositEnabled:             z.boolean().optional(),
    effectiveFrom:              dateString().optional(),
    sellingPriceEffectiveFrom:  dateString().optional(),
  }),

  // Layout reordering — dairy
  reorderBrands: z.array(z.object({
    id:           z.number().int().positive(),
    displayOrder: z.number().int().nonnegative(),
  })),
  reorderProducts: z.array(z.object({
    id:           z.number().int().positive(),
    displayOrder: z.number().int().nonnegative(),
  })),
  reorderCategories: z.array(z.object({
    id:           z.number().int().positive(),
    displayOrder: z.number().int().nonnegative(),
  })),

  // Layout reordering — salesperson
  reorderSalespersonBrands: z.array(z.object({
    id:           z.number().int().positive(),
    displayOrder: z.number().int().nonnegative(),
  })),
  reorderSalespersonProducts: z.array(z.object({
    id:           z.number().int().positive(),
    displayOrder: z.number().int().nonnegative(),
  })),
  reorderSalespersonCategories: z.array(z.object({
    id:           z.number().int().positive(),
    displayOrder: z.number().int().nonnegative(),
  })),

  // Stock Receipts (qty 0 is meaningful — it means "no receipt for this product
  // on this day", and the controller filters those out before insert)
  bulkStockReceipt: z.object({
    brandId: z.number().int().positive(),
    date:    dateString(),
    routeId: z.number().int().nonnegative().optional().default(0),
    items: z.array(z.object({
      productId: z.number().int().positive(),
      quantity:  z.number().min(0),
      unitPrice: z.number().min(0),
    })).default([]),
  }),

  // Dairy Payment
  updateDairyPayment: z.object({
    amount:      z.number().positive('Amount must be positive'),
    paymentDate: dateString(),
    paymentMode,
    reference:   shortText,
    notes:       shortText,
  }),
  createDairyPayment: z.object({
    brandId:     z.number().int().positive(),
    paymentDate: dateString(),
    amount:      z.number().positive('Amount must be positive'),
    paymentMode,
    reference:   shortText,
    notes:       shortText,
  }),

  // Routes
  createRoute: z.object({
    brandId:      z.number().int().positive('Brand ID is required'),
    routeNumber:  z.string().min(1, 'Route number is required'),
    displayOrder: z.number().int().nonnegative().optional(),
  }),
  updateRoute: z.object({
    routeNumber:  z.string().min(1).optional(),
    displayOrder: z.number().int().nonnegative().optional(),
    isActive:     z.boolean().optional(),
  }),

  // Salespeople
  createSalesperson: z.object({
    name:     z.string().min(1, 'Name is required'),
    phone:    z.string().optional(),
    route:    z.string().optional(),
    username: z.string().min(3, 'Username must be at least 3 characters').optional(),
    password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  }),
  updateSalesperson: z.object({
    name:     z.string().min(1).optional(),
    phone:    z.string().optional(),
    route:    z.string().optional(),
    isActive: z.boolean().optional(),
    username: z.string().min(3, 'Username must be at least 3 characters').optional().nullable(),
    password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  }),

  // Salesperson Product Visibility
  bulkSalespersonProducts: z.object({
    products: z.array(z.object({
      productId: z.number().int().positive(),
      isEnabled: z.boolean(),
    })).min(1, 'At least one product is required'),
  }),

  // Salesperson Prices
  bulkSalespersonPrices: z.object({
    effectiveFrom: dateString(),
    prices: z.array(z.object({
      productId:     z.number().int().positive(),
      sellingPrice:  z.number().min(0),
      effectiveFrom: dateString().optional(),
    })),
  }),

  // Dispatch (salespersonId optional — server injects it for salesman role)
  createDispatch: z.object({
    salespersonId: z.number().int().positive().optional(),
    dispatchDate:  dateString(),
    items: z.array(z.object({
      productId: z.number().int().positive(),
      quantity:  z.number().positive(),
      unitPrice: z.number().min(0),
    })).min(1, 'At least one item is required'),
    notes: shortText,
  }),

  // Salesperson Payment
  createSalespersonPayment: z.object({
    salespersonId: z.number().int().positive(),
    paymentDate:   dateString(),
    amount:        z.number().positive('Amount must be positive'),
    paymentMode,
    reference:     shortText,
    notes:         shortText,
  }),
  updateSalespersonPayment: z.object({
    paymentDate: dateString(),
    amount:      z.number().positive('Amount must be positive'),
    paymentMode,
    reference:   shortText,
    notes:       shortText,
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
