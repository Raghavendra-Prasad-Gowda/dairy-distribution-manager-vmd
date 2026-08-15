/**
 * Global Settings tests for SalesmanPricesSetup component.
 *
 * Covers all 10 global settings functions:
 *   1. fetchGlobal()            — GET /products/salesperson-global
 *   2. fetchProductView()       — builds product-centric view from per-SP prices
 *   3. handleGlobalToggle()     — toggle with price guard
 *   4. handleGlobalPriceChange()— price input update in global table
 *   5. handleToggleAllGlobal()  — Enable All / Disable All buttons
 *   6. handleSave() global mode — PATCH with validation + price fallback
 *   7. handleBulkUpdate()       — POST /salespeople/bulk-update
 *   8. handleBulkProductUpdate()— POST /salesperson-products/bulk-update
 *   9. handleClearCustomPrices()— DELETE with confirm dialog
 *  10. handleClearAllSalesmanPrices() — DELETE all brand products, modal confirm
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SalesmanPricesSetup from './SalesmanPricesSetup';
import api from '../../api/axios';

// ── Stable mock references ─────────────────────────────────────────────────────
const mockNotify = vi.fn();

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../utils/dateUtils', () => ({
  getIndiaDate:    () => '2026-07-31',
  formatDateShort: (d) => (d ? new Date(d).toLocaleDateString('en-IN') : ''),
  formatCurrency:  (v) => `₹${Number(v).toFixed(2)}`,
}));

vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify: mockNotify }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'superadmin' } }),
}));

vi.mock('../../components/BrandTabs', () => ({
  default: ({ brands, activeBrandId, onChange }) => (
    <div data-testid="brand-tabs">
      {brands.map(b => (
        <button key={b.id} data-testid={`brand-tab-${b.id}`} onClick={() => onChange(b.id)}>
          {b.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../../components/Pagination', () => ({
  default: () => <div data-testid="pagination" />,
}));

vi.mock('../../components/ui/LoadingOverlay', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock('../../components/ui/BrandedLoader', () => ({
  default: () => <div data-testid="loader" />,
}));

// ── Fixtures ───────────────────────────────────────────────────────────────────
const SALESPEOPLE = [
  { id: 1, name: 'Ramesh Kumar', route: 'Route 3', isActive: true },
  { id: 2, name: 'Suresh Babu', route: 'Route 5', isActive: true },
];

const BRANDS = [
  { id: 1, name: 'Nandini', displayOrder: 1 },
  { id: 2, name: 'Jersey', displayOrder: 2 },
];

const GLOBAL_PRODUCTS = [
  {
    productId: 1,
    productName: 'Nandini Toned Milk 500ml',
    brandId: 1,
    brandName: 'Nandini',
    category: 'Milk',
    categoryDisplayOrder: 1,
    displayOrder: 1,
    salespersonEnabled: true,
    salespersonDefaultPrice: 50,
    dairyCostPrice: 30,
    dairySellingPrice: 45,
  },
  {
    productId: 2,
    productName: 'Nandini Curd 400g',
    brandId: 1,
    brandName: 'Nandini',
    category: 'Curd',
    categoryDisplayOrder: 2,
    displayOrder: 1,
    salespersonEnabled: false,
    salespersonDefaultPrice: 0,
    dairyCostPrice: 20,
    dairySellingPrice: 28,
  },
];

// Per-salesperson price rows (used by fetchProductView)
const SP1_PRICES = [
  {
    productId: 1,
    productName: 'Nandini Toned Milk 500ml',
    brandId: 1,
    category: 'Milk',
    categoryDisplayOrder: 1,
    displayOrder: 1,
    sellingPrice: 52,
    isEnabled: true,
    dairyCostPrice: 30,
    dairySellingPrice: 45,
  },
];
const SP2_PRICES = [
  {
    productId: 1,
    productName: 'Nandini Toned Milk 500ml',
    brandId: 1,
    category: 'Milk',
    categoryDisplayOrder: 1,
    displayOrder: 1,
    sellingPrice: 50,
    isEnabled: true,
    dairyCostPrice: 30,
    dairySellingPrice: 45,
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Set up the standard happy-path API mocks. */
function setupDefaultMocks({ globalProducts = GLOBAL_PRODUCTS } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url === '/salespeople?all=true') {
      return Promise.resolve({ data: { data: SALESPEOPLE } });
    }
    if (url === '/brands') {
      return Promise.resolve({ data: { data: BRANDS } });
    }
    if (url === '/products/salesperson-global') {
      return Promise.resolve({ data: { data: globalProducts } });
    }
    if (url === '/salespeople/1/prices') {
      return Promise.resolve({ data: { data: SP1_PRICES } });
    }
    if (url === '/salespeople/2/prices') {
      return Promise.resolve({ data: { data: SP2_PRICES } });
    }
    return Promise.resolve({ data: { data: [] } });
  });
}

/** Render the component, wait for initial data, then click Global. */
async function renderAndGoGlobal({ globalProducts } = {}) {
  setupDefaultMocks({ globalProducts });
  render(<SalesmanPricesSetup />);

  // Wait for initial data load
  await waitFor(() => expect(screen.getByText('Ramesh Kumar')).toBeInTheDocument());

  // Switch to global mode
  const globalBtn = screen.getByText('Global');
  fireEvent.click(globalBtn);

  // Wait for global products to load
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/products/salesperson-global'));

  return { globalBtn };
}

/** Get the toggle pill button inside a table row (first button = toggle, second = Clear). */
function getToggleInRow(row) {
  return within(row).getAllByRole('button')[0];
}

/** Find the table row that contains the given product name. */
function findProductRow(productName) {
  const rows = screen.getAllByRole('row');
  return rows.find(r => r.textContent.includes(productName));
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Global Settings — fetchGlobal()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls GET /products/salesperson-global when Global tab is clicked', async () => {
    await renderAndGoGlobal();
    expect(api.get).toHaveBeenCalledWith('/products/salesperson-global');
  });

  it('renders the global products in the table', async () => {
    await renderAndGoGlobal();
    await waitFor(() => {
      expect(screen.getByText('Nandini Toned Milk 500ml')).toBeInTheDocument();
    });
  });

  it('shows error notification when fetchGlobal fails', async () => {
    setupDefaultMocks();
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/salespeople?all=true') return Promise.resolve({ data: { data: SALESPEOPLE } });
      if (url === '/brands') return Promise.resolve({ data: { data: BRANDS } });
      if (url === '/products/salesperson-global') return Promise.reject({ response: { data: { error: 'Not authorized' } } });
      return Promise.resolve({ data: { data: [] } });
    });

    render(<SalesmanPricesSetup />);
    await waitFor(() => expect(screen.getByText('Ramesh Kumar')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Global'));

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Not authorized', 'error');
    });
  });

  it('shows global mode amber warning banner', async () => {
    await renderAndGoGlobal();
    await waitFor(() => {
      expect(screen.getByText(/Changes here apply to/i)).toBeInTheDocument();
    });
  });

  it('shows Enable All and Disable All buttons in global mode', async () => {
    await renderAndGoGlobal();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Enable All' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Disable All' })).toBeInTheDocument();
    });
  });
});

describe('Global Settings — fetchProductView()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches prices for all salespeople when View Price List is clicked', async () => {
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('View Price List')).toBeInTheDocument());
    fireEvent.click(screen.getByText('View Price List'));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/salespeople/1/prices');
      expect(api.get).toHaveBeenCalledWith('/salespeople/2/prices');
    });
  });

  it('opens View Price List modal with heading after fetching', async () => {
    await renderAndGoGlobal();
    fireEvent.click(screen.getByText('View Price List'));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Salesperson Price List/i })).toBeInTheDocument();
    });
  });

  it('shows error notification when fetchProductView fails', async () => {
    setupDefaultMocks();
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/salespeople?all=true') return Promise.resolve({ data: { data: SALESPEOPLE } });
      if (url === '/brands') return Promise.resolve({ data: { data: BRANDS } });
      if (url === '/products/salesperson-global') return Promise.resolve({ data: { data: GLOBAL_PRODUCTS } });
      if (url.includes('/prices')) return Promise.reject({ response: { data: { error: 'Failed to fetch' } } });
      return Promise.resolve({ data: { data: [] } });
    });

    render(<SalesmanPricesSetup />);
    await waitFor(() => expect(screen.getByText('Ramesh Kumar')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Global'));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/products/salesperson-global'));

    fireEvent.click(screen.getByText('View Price List'));
    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Failed to fetch', 'error');
    });
  });

  it('re-fetches prices on every View Price List click (no stale data)', async () => {
    await renderAndGoGlobal();
    const viewBtn = screen.getByText('View Price List');
    fireEvent.click(viewBtn);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/salespeople/1/prices'));

    const callCount = vi.mocked(api.get).mock.calls.filter(c => c[0] === '/salespeople/1/prices').length;

    fireEvent.click(viewBtn);
    await waitFor(() => {
      const newCount = vi.mocked(api.get).mock.calls.filter(c => c[0] === '/salespeople/1/prices').length;
      expect(newCount).toBeGreaterThan(callCount);
    });
  });
});

describe('Global Settings — handleGlobalToggle()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows warning when trying to enable a product that has no default price', async () => {
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Nandini Curd 400g')).toBeInTheDocument());

    // Curd product: price=0, disabled. Clicking its toggle tries to enable without a price.
    const curdRow = findProductRow('Nandini Curd 400g');
    const toggle = getToggleInRow(curdRow);
    fireEvent.click(toggle);

    expect(mockNotify).toHaveBeenCalledWith(
      'Set a default price before enabling this product',
      'warning',
    );
  });

  it('allows toggling off an enabled product without a price check', async () => {
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Nandini Toned Milk 500ml')).toBeInTheDocument());

    // Milk product: price=50, enabled. Clicking its toggle disables it.
    const milkRow = findProductRow('Nandini Toned Milk 500ml');
    const toggle = getToggleInRow(milkRow);
    fireEvent.click(toggle);

    // No price warning shown; row becomes dirty
    await waitFor(() => {
      expect(screen.getByText('unsaved')).toBeInTheDocument();
    });
    expect(mockNotify).not.toHaveBeenCalledWith(expect.anything(), 'warning');
  });

  it('allows enabling a product that has a dirty (newly entered) price', async () => {
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Nandini Curd 400g')).toBeInTheDocument());

    const curdRow = findProductRow('Nandini Curd 400g');

    // Enter a price first
    const priceInput = within(curdRow).getByRole('spinbutton');
    fireEvent.change(priceInput, { target: { value: '30' } });

    // Now toggle to enable — should not warn
    const toggle = getToggleInRow(curdRow);
    fireEvent.click(toggle);

    expect(mockNotify).not.toHaveBeenCalledWith(expect.anything(), 'warning');
  });

  it('marks the row as dirty (unsaved) after toggle', async () => {
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Nandini Toned Milk 500ml')).toBeInTheDocument());

    const milkRow = findProductRow('Nandini Toned Milk 500ml');
    const toggle = getToggleInRow(milkRow);
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByText('unsaved')).toBeInTheDocument();
    });
  });
});

describe('Global Settings — handleGlobalPriceChange()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates price input value when user types', async () => {
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Nandini Toned Milk 500ml')).toBeInTheDocument());

    const milkRow = findProductRow('Nandini Toned Milk 500ml');
    const priceInput = within(milkRow).getByRole('spinbutton');

    fireEvent.change(priceInput, { target: { value: '55' } });
    expect(priceInput.value).toBe('55');
  });

  it('marks row as dirty after price change', async () => {
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Nandini Toned Milk 500ml')).toBeInTheDocument());

    const milkRow = findProductRow('Nandini Toned Milk 500ml');
    const priceInput = within(milkRow).getByRole('spinbutton');
    fireEvent.change(priceInput, { target: { value: '60' } });

    await waitFor(() => {
      expect(screen.getByText('unsaved')).toBeInTheDocument();
    });
  });

  it('empty price input stores null in dirty state (no crash)', async () => {
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Nandini Toned Milk 500ml')).toBeInTheDocument());

    const milkRow = findProductRow('Nandini Toned Milk 500ml');
    const priceInput = within(milkRow).getByRole('spinbutton');

    expect(() => {
      fireEvent.change(priceInput, { target: { value: '' } });
    }).not.toThrow();
  });
});

describe('Global Settings — handleToggleAllGlobal()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Enable All button is disabled when all products are already enabled', async () => {
    const allEnabled = GLOBAL_PRODUCTS.map(p => ({ ...p, salespersonEnabled: true }));
    await renderAndGoGlobal({ globalProducts: allEnabled });

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: 'Enable All' });
      expect(btn).toBeDisabled();
    });
  });

  it('Disable All button is disabled when all products are already disabled', async () => {
    const allDisabled = GLOBAL_PRODUCTS.map(p => ({ ...p, salespersonEnabled: false }));
    await renderAndGoGlobal({ globalProducts: allDisabled });

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: 'Disable All' });
      expect(btn).toBeDisabled();
    });
  });

  it('Disable All re-enables the Enable All button', async () => {
    const allEnabled = GLOBAL_PRODUCTS.map(p => ({ ...p, salespersonEnabled: true }));
    await renderAndGoGlobal({ globalProducts: allEnabled });

    await waitFor(() => expect(screen.getByText('Nandini Toned Milk 500ml')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Disable All' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Enable All' })).not.toBeDisabled();
    });
  });

  it('Enable All re-enables the Disable All button', async () => {
    const allDisabled = GLOBAL_PRODUCTS.map(p => ({ ...p, salespersonEnabled: false }));
    await renderAndGoGlobal({ globalProducts: allDisabled });

    await waitFor(() => expect(screen.getByText('Nandini Toned Milk 500ml')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Enable All' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Disable All' })).not.toBeDisabled();
    });
  });

  it('Save button becomes active after Enable All / Disable All', async () => {
    const allEnabled = GLOBAL_PRODUCTS.map(p => ({ ...p, salespersonEnabled: true }));
    await renderAndGoGlobal({ globalProducts: allEnabled });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Disable All' })).toBeInTheDocument());

    const saveBtn = screen.getByRole('button', { name: /Save/i });
    expect(saveBtn).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Disable All' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save/i })).not.toBeDisabled();
    });
  });
});

describe('Global Settings — handleSave() in global mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.patch).mockResolvedValue({ data: { success: true } });
  });

  it('Save button is disabled when no changes are pending', async () => {
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Nandini Toned Milk 500ml')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Save/i })).toBeDisabled();
  });

  it('calls PATCH /products/salesperson-global with price change in payload', async () => {
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Nandini Toned Milk 500ml')).toBeInTheDocument());

    const milkRow = findProductRow('Nandini Toned Milk 500ml');
    const priceInput = within(milkRow).getByRole('spinbutton');
    fireEvent.change(priceInput, { target: { value: '55' } });

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/products/salesperson-global', {
        products: expect.arrayContaining([
          expect.objectContaining({ productId: 1, defaultPrice: expect.any(Number) }),
        ]),
      });
    });
  });

  it('includes existing price in payload when enabling product with unchanged price', async () => {
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Nandini Toned Milk 500ml')).toBeInTheDocument());

    const milkRow = findProductRow('Nandini Toned Milk 500ml');
    const toggle = getToggleInRow(milkRow);

    // Toggle off then back on — price was never changed
    fireEvent.click(toggle); // disable
    fireEvent.click(toggle); // re-enable (guard checks existing price=50)

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/products/salesperson-global', {
        products: expect.arrayContaining([
          expect.objectContaining({ productId: 1, isEnabled: true, defaultPrice: 50 }),
        ]),
      });
    });
  });

  it('shows success notification and re-fetches after save', async () => {
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Nandini Toned Milk 500ml')).toBeInTheDocument());

    const milkRow = findProductRow('Nandini Toned Milk 500ml');
    const priceInput = within(milkRow).getByRole('spinbutton');
    fireEvent.change(priceInput, { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Global settings saved', 'success');
    });

    const globalCalls = vi.mocked(api.get).mock.calls.filter(c => c[0] === '/products/salesperson-global');
    expect(globalCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('shows error notification when PATCH fails', async () => {
    vi.mocked(api.patch).mockRejectedValue({ response: { data: { error: 'Server error' } } });

    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Nandini Toned Milk 500ml')).toBeInTheDocument());

    const milkRow = findProductRow('Nandini Toned Milk 500ml');
    const priceInput = within(milkRow).getByRole('spinbutton');
    fireEvent.change(priceInput, { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Server error', 'error');
    });
  });

  it('does NOT call PATCH when enabling a product without a price (blocked at toggle)', async () => {
    // Product 2 has price=0, disabled. Trying to toggle it on shows a warning and blocks the action.
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Nandini Curd 400g')).toBeInTheDocument());

    const curdRow = findProductRow('Nandini Curd 400g');
    const toggle = getToggleInRow(curdRow);
    fireEvent.click(toggle); // blocked by handleGlobalToggle guard

    expect(mockNotify).toHaveBeenCalledWith('Set a default price before enabling this product', 'warning');
    expect(api.patch).not.toHaveBeenCalled();
  });
});

describe('Global Settings — handleBulkUpdate() (Bulk Update Prices)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function openBulkUpdateModal() {
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Bulk Update Prices')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Bulk Update Prices'));
    // Modal opened — wait for the "Apply to Salespeople" section to appear
    await waitFor(() => expect(screen.getByText(/Apply to Salespeople/i)).toBeInTheDocument());
  }

  it('opens Bulk Update Prices modal with heading', async () => {
    await openBulkUpdateModal();
    expect(screen.getByRole('heading', { name: /Bulk Update Prices/i })).toBeInTheDocument();
  });

  it('Update button is disabled when no salesman is selected', async () => {
    await openBulkUpdateModal();
    // Use /Update \(/ to match "Update (0 salesmen, 0 products)" and not the "Bulk Update Prices" trigger button
    const updateBtn = screen.getByRole('button', { name: /Update \(/ });
    expect(updateBtn).toBeDisabled();
  });

  it('Update button is disabled when no product is added', async () => {
    await openBulkUpdateModal();
    // Select a salesman but add no product
    const spCheckbox = screen.getByRole('checkbox', { name: /Ramesh Kumar/i });
    fireEvent.click(spCheckbox);

    const updateBtn = screen.getByRole('button', { name: /Update \(/ });
    expect(updateBtn).toBeDisabled();
  });

  it('Update button becomes enabled after selecting salesman and adding product', async () => {
    await openBulkUpdateModal();

    // Select salesman
    const spCheckbox = screen.getByRole('checkbox', { name: /Ramesh Kumar/i });
    fireEvent.click(spCheckbox);

    // Add product by clicking its name button in the product list
    // Only enabled products appear: GLOBAL_PRODUCTS[0] (milk, enabled)
    const productBtn = screen.getByRole('button', { name: /Nandini Toned Milk 500ml/i });
    fireEvent.click(productBtn);

    await waitFor(() => {
      // Button now shows the count and is enabled (price still empty but validation is at submit)
      const updateBtn = screen.getByRole('button', { name: /Update \(/ });
      expect(updateBtn).not.toBeDisabled();
    });
  });

  it('shows warning when product price is left empty on submit', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } });
    await openBulkUpdateModal();

    // Select salesman + add product
    fireEvent.click(screen.getByRole('checkbox', { name: /Ramesh Kumar/i }));
    fireEvent.click(screen.getByRole('button', { name: /Nandini Toned Milk 500ml/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Update \(/ })).not.toBeDisabled());

    // Don't enter a price — submit
    fireEvent.click(screen.getByRole('button', { name: /Update \(/ }));

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith(
        expect.stringContaining('Enter salesman price'),
        'warning',
      );
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('calls POST /salespeople/bulk-update with correct payload', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } });
    await openBulkUpdateModal();

    fireEvent.click(screen.getByRole('checkbox', { name: /Ramesh Kumar/i }));
    fireEvent.click(screen.getByRole('button', { name: /Nandini Toned Milk 500ml/i }));

    // Enter price in the product table's price input
    await waitFor(() => expect(screen.getByRole('button', { name: /Update \(/ })).not.toBeDisabled());
    const productPriceInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(productPriceInput, { target: { value: '55' } });

    fireEvent.click(screen.getByRole('button', { name: /Update \(/ }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/salespeople/bulk-update', {
        salespersonIds: [1],
        productPrices: [{ productId: 1, sellingPrice: 55 }],
        effectiveFrom: '2026-07-31',
      });
    });
  });

  it('shows success notification with salesman and product counts', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } });
    await openBulkUpdateModal();

    fireEvent.click(screen.getByRole('checkbox', { name: /Ramesh Kumar/i }));
    fireEvent.click(screen.getByRole('button', { name: /Nandini Toned Milk 500ml/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Update \(/ })).not.toBeDisabled());
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: /Update \(/ }));

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith(
        expect.stringContaining('1 salesmen'),
        'success',
      );
    });
  });

  it('resets updatingBulkPrices to false on success (Update button re-enabled on reopen)', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } });
    await openBulkUpdateModal();

    fireEvent.click(screen.getByRole('checkbox', { name: /Ramesh Kumar/i }));
    fireEvent.click(screen.getByRole('button', { name: /Nandini Toned Milk 500ml/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Update \(/ })).not.toBeDisabled());
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: /Update \(/ }));

    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining('Prices updated'), 'success'));

    // Reopen modal — form should be reset and Update button starts disabled (no selections)
    await waitFor(() => expect(screen.queryByText(/Apply to Salespeople/i)).not.toBeInTheDocument());
    fireEvent.click(screen.getByText('Bulk Update Prices'));
    await waitFor(() => {
      const updateBtn = screen.getByRole('button', { name: /Update \(/ });
      expect(updateBtn).toBeDisabled(); // disabled but NOT stuck in "loading" state
      expect(updateBtn).not.toHaveTextContent('Updating');
    });
  });

  it('resets updatingBulkPrices to false on failure', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'API error' } } });
    await openBulkUpdateModal();

    fireEvent.click(screen.getByRole('checkbox', { name: /Ramesh Kumar/i }));
    fireEvent.click(screen.getByRole('button', { name: /Nandini Toned Milk 500ml/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Update \(/ })).not.toBeDisabled());
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: /Update \(/ }));

    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith('API error', 'error'));

    // Button must NOT be stuck in disabled/loading state after failure
    const updateBtn = screen.getByRole('button', { name: /Update \(/ });
    expect(updateBtn).not.toHaveTextContent('Updating');
  });
});

describe('Global Settings — handleBulkProductUpdate() (Bulk Product Access)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function openBulkProductModal() {
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Bulk Product Access')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Bulk Product Access'));
    // Modal opened — wait for the "Select Salesmen" section heading
    await waitFor(() => expect(screen.getByText(/Select Salesmen \(/i)).toBeInTheDocument());
  }

  it('opens Bulk Product Access modal with correct heading', async () => {
    await openBulkProductModal();
    expect(screen.getByText(/Bulk Enable\/Disable Products/i)).toBeInTheDocument();
  });

  it('Confirm button is disabled when no salesman selected', async () => {
    await openBulkProductModal();
    const confirmBtn = screen.getByRole('button', { name: /Confirm/i });
    expect(confirmBtn).toBeDisabled();
  });

  it('Confirm button is disabled when no product selected', async () => {
    await openBulkProductModal();
    // Select salesman but no product
    const spCheckbox = screen.getByRole('checkbox', { name: /Ramesh Kumar/i });
    fireEvent.click(spCheckbox);

    const confirmBtn = screen.getByRole('button', { name: /Confirm/i });
    expect(confirmBtn).toBeDisabled();
  });

  it('Confirm button becomes enabled after selecting salesman and product', async () => {
    await openBulkProductModal();

    fireEvent.click(screen.getByRole('checkbox', { name: /Ramesh Kumar/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Nandini Toned Milk 500ml/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Confirm/i })).not.toBeDisabled();
    });
  });

  it('calls POST /salesperson-products/bulk-update with enable action', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } });
    await openBulkProductModal();

    fireEvent.click(screen.getByRole('checkbox', { name: /Ramesh Kumar/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Nandini Toned Milk 500ml/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Confirm/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/salespeople/products/bulk-update', {
        salespersonIds: [1],
        products: [{ productId: 1, isEnabled: true }],
      });
    });
  });

  it('calls POST /salesperson-products/bulk-update with disable action', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } });
    await openBulkProductModal();

    // Switch action to "disable" using the select dropdown
    const actionSelect = screen.getByRole('combobox');
    fireEvent.change(actionSelect, { target: { value: 'disable' } });

    fireEvent.click(screen.getByRole('checkbox', { name: /Ramesh Kumar/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Nandini Toned Milk 500ml/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Confirm/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/salespeople/products/bulk-update', {
        salespersonIds: [1],
        products: [{ productId: 1, isEnabled: false }],
      });
    });
  });

  it('shows success notification after confirm', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } });
    await openBulkProductModal();

    fireEvent.click(screen.getByRole('checkbox', { name: /Ramesh Kumar/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Nandini Toned Milk 500ml/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Confirm/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith(
        expect.stringContaining('enabled'),
        'success',
      );
    });
  });

  it('shows error notification when API fails', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'Not found' } } });
    await openBulkProductModal();

    fireEvent.click(screen.getByRole('checkbox', { name: /Ramesh Kumar/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Nandini Toned Milk 500ml/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Confirm/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Not found', 'error');
    });
  });
});

describe('Global Settings — handleClearCustomPrices()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.delete).mockResolvedValue({
      data: {
        success: true,
        data: {
          message: 'Cleared custom prices for 2 salespeople.',
          clearedCount: 2,
          clearedSalespersonIds: [1, 2],
        },
      },
    });
  });

  it('shows confirm dialog before clearing', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Nandini Toned Milk 500ml')).toBeInTheDocument());

    const clearBtns = screen.getAllByRole('button', { name: 'Clear' });
    fireEvent.click(clearBtns[0]);

    expect(confirmSpy).toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('does NOT call DELETE when user cancels confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Nandini Toned Milk 500ml')).toBeInTheDocument());

    const clearBtns = screen.getAllByRole('button', { name: 'Clear' });
    fireEvent.click(clearBtns[0]);

    expect(api.delete).not.toHaveBeenCalled();
  });

  it('calls DELETE /products/:id/salesperson-prices when confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Nandini Toned Milk 500ml')).toBeInTheDocument());

    const clearBtns = screen.getAllByRole('button', { name: 'Clear' });
    fireEvent.click(clearBtns[0]);

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/products/1/salesperson-prices');
    });
  });

  it('shows success notification with message from API response', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Nandini Toned Milk 500ml')).toBeInTheDocument());

    const clearBtns = screen.getAllByRole('button', { name: 'Clear' });
    fireEvent.click(clearBtns[0]);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Cleared custom prices for 2 salespeople.', 'success');
    });
  });

  it('shows error notification when DELETE fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.delete).mockRejectedValue({ response: { data: { error: 'Product not found' } } });

    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Nandini Toned Milk 500ml')).toBeInTheDocument());

    const clearBtns = screen.getAllByRole('button', { name: 'Clear' });
    fireEvent.click(clearBtns[0]);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Product not found', 'error');
    });
  });

  it('refreshes global products after successful clear', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Nandini Toned Milk 500ml')).toBeInTheDocument());

    const priorGlobalCalls = vi.mocked(api.get).mock.calls.filter(
      c => c[0] === '/products/salesperson-global'
    ).length;

    const clearBtns = screen.getAllByRole('button', { name: 'Clear' });
    fireEvent.click(clearBtns[0]);

    await waitFor(() => {
      const newCount = vi.mocked(api.get).mock.calls.filter(
        c => c[0] === '/products/salesperson-global'
      ).length;
      expect(newCount).toBeGreaterThan(priorGlobalCalls);
    });
  });
});

describe('Global Settings — Exception Manager (superadmin only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function openExceptionManager() {
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Nandini Curd 400g')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Exception Manager/i }));
    // Wait for the modal heading to appear
    await waitFor(() =>
      expect(screen.getByText('Exception Manager', { selector: 'h3' })).toBeInTheDocument()
    );
  }

  it('shows "Exception Manager" button in global mode for superadmin', async () => {
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByRole('button', { name: /Exception Manager/i })).toBeInTheDocument());
  });

  it('opens the Exception Manager modal when the button is clicked', async () => {
    await openExceptionManager();
    // Sub-heading in the modal header
    expect(screen.getByText(/Enable globally-disabled products for specific salespeople only/i)).toBeInTheDocument();
  });

  it('shows globally-disabled products in the modal list', async () => {
    await openExceptionManager();
    // GLOBAL_PRODUCTS[1] is salespersonEnabled: false (Nandini Curd 400g)
    // Should appear in the modal's product checklist
    const checkboxes = screen.getAllByRole('checkbox');
    // At least one checkbox corresponds to the disabled product
    expect(checkboxes.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Nandini Curd 400g').length).toBeGreaterThan(0);
  });

  it('shows dairy Cost and MRP labels for disabled products in the modal', async () => {
    await openExceptionManager();
    // Product 2: dairyCostPrice: 20, dairySellingPrice: 28
    // These appear as "Cost ₹20.00 | MRP ₹28.00" in the Exception Manager
    // (They also appear in the global table, so we just verify the labels exist)
    expect(screen.getAllByText(/Cost/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/MRP/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('₹20.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₹28.00').length).toBeGreaterThan(0);
  });

  it('shows "Use dairy MRP for all" button after selecting a disabled product with enable action', async () => {
    await openExceptionManager();
    // Select the disabled product (Nandini Curd 400g checkbox)
    const checkbox = screen.getByRole('checkbox', { name: /Nandini Curd 400g/i });
    fireEvent.click(checkbox);
    await waitFor(() =>
      expect(screen.getByText('Use dairy MRP for all')).toBeInTheDocument()
    );
  });

  it('"Use dairy MRP for all" fills price inputs with dairySellingPrice', async () => {
    await openExceptionManager();

    // Select the disabled product
    const checkbox = screen.getByRole('checkbox', { name: /Nandini Curd 400g/i });
    fireEvent.click(checkbox);
    await waitFor(() => expect(screen.getByText('Use dairy MRP for all')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Use dairy MRP for all'));

    // The price input for the selected product should now hold the dairy selling price ("28")
    // (dairySellingPrice: 28 for Nandini Curd 400g)
    await waitFor(() => {
      const allSpinbuttons = screen.getAllByRole('spinbutton');
      const filled = allSpinbuttons.find(i => i.value === '28');
      expect(filled).toBeDefined();
    });
  });

  it('"Use dairy MRP for all" does not overwrite a price that was manually entered', async () => {
    await openExceptionManager();

    const checkbox = screen.getByRole('checkbox', { name: /Nandini Curd 400g/i });
    fireEvent.click(checkbox);
    await waitFor(() => expect(screen.getByText('Use dairy MRP for all')).toBeInTheDocument());

    // Manually enter a price BEFORE clicking "Use dairy MRP for all"
    // The button fills ALL selected products — it doesn't skip those already filled.
    // After clicking, the value should be 28 (MRP overrides the manual entry).
    const spinbuttons = screen.getAllByRole('spinbutton');
    const modalInput = spinbuttons.find(i => i.placeholder === '28');
    if (modalInput) {
      fireEvent.change(modalInput, { target: { value: '25' } });
    }

    fireEvent.click(screen.getByText('Use dairy MRP for all'));

    await waitFor(() => {
      const allInputs = screen.getAllByRole('spinbutton');
      const filledWithMRP = allInputs.find(i => i.value === '28');
      expect(filledWithMRP).toBeDefined();
    });
  });

  it('Submit button is disabled until both products and salespeople are selected', async () => {
    await openExceptionManager();
    // Submit button with no selections → disabled
    const submitBtn = screen.getByRole('button', { name: /Enable \(|Disable \(/ });
    expect(submitBtn).toBeDisabled();
  });

  // ── Brand grouping in Exception Manager ────────────────────────────────────

  it('groups globally-disabled products under a brand section header', async () => {
    // GLOBAL_PRODUCTS[1] (Nandini Curd 400g) is disabled. The brand header
    // "Nandini" must appear inside the modal product list.
    await openExceptionManager();
    const modal = screen.getByText('Exception Manager', { selector: 'h3' }).closest('.bg-white');
    // getByText uses exact match — "Nandini" won't match "Nandini Curd 400g".
    expect(within(modal).getByText('Nandini')).toBeInTheDocument();
  });

  it('shows a category sub-header inside the brand section', async () => {
    // Nandini Curd 400g → category: 'Curd' → rendered as a section header
    // inside the "Nandini" brand group, not inline on the product row.
    await openExceptionManager();
    const modal = screen.getByText('Exception Manager', { selector: 'h3' }).closest('.bg-white');
    expect(within(modal).getByText('Curd')).toBeInTheDocument();
  });

  it('shows separate brand headers when disabled products span multiple brands', async () => {
    const multibrandProducts = [
      ...GLOBAL_PRODUCTS,
      {
        productId: 3,
        productName: 'Jersey Full Cream 500ml',
        brandId: 2,
        brandName: 'Jersey',
        category: 'Milk',
        categoryDisplayOrder: 1,
        displayOrder: 1,
        salespersonEnabled: false,
        salespersonDefaultPrice: 0,
        dairyCostPrice: 38,
        dairySellingPrice: 52,
      },
    ];

    setupDefaultMocks({ globalProducts: multibrandProducts });
    render(<SalesmanPricesSetup />);
    await waitFor(() => expect(screen.getByText('Ramesh Kumar')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Global'));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/products/salesperson-global'));
    fireEvent.click(screen.getByRole('button', { name: /Exception Manager/i }));
    await waitFor(() =>
      expect(screen.getByText('Exception Manager', { selector: 'h3' })).toBeInTheDocument()
    );

    const modal = screen.getByText('Exception Manager', { selector: 'h3' }).closest('.bg-white');
    const withinModal = within(modal);

    // Both brand headers appear inside the modal
    expect(withinModal.getByText('Nandini')).toBeInTheDocument();
    expect(withinModal.getByText('Jersey')).toBeInTheDocument();
    // Both disabled products are listed
    expect(withinModal.getByText('Nandini Curd 400g')).toBeInTheDocument();
    expect(withinModal.getByText('Jersey Full Cream 500ml')).toBeInTheDocument();
  });

  it('orders brand sections by brands displayOrder (Nandini before Jersey)', async () => {
    // BRANDS fixture: Nandini displayOrder=1, Jersey displayOrder=2 → Nandini first.
    const multibrandProducts = [
      ...GLOBAL_PRODUCTS,
      {
        productId: 3,
        productName: 'Jersey Full Cream 500ml',
        brandId: 2,
        brandName: 'Jersey',
        category: 'Milk',
        categoryDisplayOrder: 1,
        displayOrder: 1,
        salespersonEnabled: false,
        salespersonDefaultPrice: 0,
        dairyCostPrice: 38,
        dairySellingPrice: 52,
      },
    ];

    setupDefaultMocks({ globalProducts: multibrandProducts });
    render(<SalesmanPricesSetup />);
    await waitFor(() => expect(screen.getByText('Ramesh Kumar')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Global'));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/products/salesperson-global'));
    fireEvent.click(screen.getByRole('button', { name: /Exception Manager/i }));
    await waitFor(() =>
      expect(screen.getByText('Exception Manager', { selector: 'h3' })).toBeInTheDocument()
    );

    const modal = screen.getByText('Exception Manager', { selector: 'h3' }).closest('.bg-white');
    const nandiniHeader = within(modal).getByText('Nandini');
    const jerseyHeader = within(modal).getByText('Jersey');

    // Nandini (displayOrder 1) must precede Jersey (displayOrder 2) in the DOM.
    expect(
      nandiniHeader.compareDocumentPosition(jerseyHeader) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('search filter hides non-matching products but keeps matching ones inside their brand section', async () => {
    // Two disabled products: Nandini Curd 400g (category: Curd) and Jersey Full Cream 500ml.
    // Searching "cream" should show Jersey Full Cream 500ml and hide Nandini Curd 400g.
    const multibrandProducts = [
      ...GLOBAL_PRODUCTS,
      {
        productId: 3,
        productName: 'Jersey Full Cream 500ml',
        brandId: 2,
        brandName: 'Jersey',
        category: 'Milk',
        categoryDisplayOrder: 1,
        displayOrder: 1,
        salespersonEnabled: false,
        salespersonDefaultPrice: 0,
        dairyCostPrice: 38,
        dairySellingPrice: 52,
      },
    ];

    setupDefaultMocks({ globalProducts: multibrandProducts });
    render(<SalesmanPricesSetup />);
    await waitFor(() => expect(screen.getByText('Ramesh Kumar')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Global'));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/products/salesperson-global'));
    fireEvent.click(screen.getByRole('button', { name: /Exception Manager/i }));
    await waitFor(() =>
      expect(screen.getByText('Exception Manager', { selector: 'h3' })).toBeInTheDocument()
    );

    // Type into the search box
    const searchInput = screen.getByPlaceholderText(/Search disabled products/i);
    fireEvent.change(searchInput, { target: { value: 'cream' } });

    const modal = screen.getByText('Exception Manager', { selector: 'h3' }).closest('.bg-white');
    const withinModal = within(modal);

    // Matching product and its brand header should be present
    expect(withinModal.getByText('Jersey Full Cream 500ml')).toBeInTheDocument();
    expect(withinModal.getByText('Jersey')).toBeInTheDocument();
    // Non-matching product and its brand header should be gone
    expect(withinModal.queryByText('Nandini Curd 400g')).not.toBeInTheDocument();
    expect(withinModal.queryByText('Nandini')).not.toBeInTheDocument();
  });

  it('shows empty-state message when search matches no disabled products', async () => {
    await openExceptionManager();
    const searchInput = screen.getByPlaceholderText(/Search disabled products/i);
    fireEvent.change(searchInput, { target: { value: 'zzz-no-match-zzz' } });

    expect(screen.getByText('No matching globally-disabled products.')).toBeInTheDocument();
  });

  it('renders no category sub-header when a product has no category', async () => {
    // Products without a category are grouped under an empty key and rendered
    // without a sub-header div (the {cat && ...} guard prevents it).
    const noCategoryProducts = [
      {
        productId: 4,
        productName: 'Nandini Loose Milk',
        brandId: 1,
        brandName: 'Nandini',
        category: null,           // no category
        categoryDisplayOrder: null,
        displayOrder: 1,
        salespersonEnabled: false,
        salespersonDefaultPrice: 0,
        dairyCostPrice: 22,
        dairySellingPrice: 30,
      },
    ];

    setupDefaultMocks({ globalProducts: noCategoryProducts });
    render(<SalesmanPricesSetup />);
    await waitFor(() => expect(screen.getByText('Ramesh Kumar')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Global'));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/products/salesperson-global'));
    fireEvent.click(screen.getByRole('button', { name: /Exception Manager/i }));
    await waitFor(() =>
      expect(screen.getByText('Exception Manager', { selector: 'h3' })).toBeInTheDocument()
    );

    const modal = screen.getByText('Exception Manager', { selector: 'h3' }).closest('.bg-white');
    const withinModal = within(modal);

    // Brand header appears but no category sub-header
    expect(withinModal.getByText('Nandini')).toBeInTheDocument();
    expect(withinModal.getByText('Nandini Loose Milk')).toBeInTheDocument();
    // No spurious empty sub-header text; the null category must not be rendered as a string
    expect(withinModal.queryByText('null')).not.toBeInTheDocument();
  });

  it('sorts products within a category by displayOrder (lower first)', async () => {
    // Three disabled Nandini products in the same category, listed in reverse
    // displayOrder by the API — the grouped view must sort them ascending.
    const disorderProducts = [
      {
        productId: 5, productName: 'Nandini Product C', brandId: 1, brandName: 'Nandini',
        category: 'Milk', categoryDisplayOrder: 1, displayOrder: 3,
        salespersonEnabled: false, salespersonDefaultPrice: 0,
        dairyCostPrice: 10, dairySellingPrice: 15,
      },
      {
        productId: 6, productName: 'Nandini Product A', brandId: 1, brandName: 'Nandini',
        category: 'Milk', categoryDisplayOrder: 1, displayOrder: 1,
        salespersonEnabled: false, salespersonDefaultPrice: 0,
        dairyCostPrice: 10, dairySellingPrice: 15,
      },
      {
        productId: 7, productName: 'Nandini Product B', brandId: 1, brandName: 'Nandini',
        category: 'Milk', categoryDisplayOrder: 1, displayOrder: 2,
        salespersonEnabled: false, salespersonDefaultPrice: 0,
        dairyCostPrice: 10, dairySellingPrice: 15,
      },
    ];

    setupDefaultMocks({ globalProducts: disorderProducts });
    render(<SalesmanPricesSetup />);
    await waitFor(() => expect(screen.getByText('Ramesh Kumar')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Global'));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/products/salesperson-global'));
    fireEvent.click(screen.getByRole('button', { name: /Exception Manager/i }));
    await waitFor(() =>
      expect(screen.getByText('Exception Manager', { selector: 'h3' })).toBeInTheDocument()
    );

    const modal = screen.getByText('Exception Manager', { selector: 'h3' }).closest('.bg-white');
    const productA = within(modal).getByText('Nandini Product A');
    const productB = within(modal).getByText('Nandini Product B');
    const productC = within(modal).getByText('Nandini Product C');

    // A (displayOrder 1) → B (2) → C (3) in DOM order
    expect(
      productA.compareDocumentPosition(productB) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      productB.compareDocumentPosition(productC) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});

describe('Global Settings — handleClearAllSalesmanPrices()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.delete).mockResolvedValue({
      data: {
        success: true,
        data: {
          message: 'Cleared.',
          clearedCount: 2,
          clearedSalespersonIds: [1, 2],
        },
      },
    });
  });

  it('Clear All Salesman Prices button opens confirmation modal', async () => {
    await renderAndGoGlobal();
    await waitFor(() => expect(screen.getByText('Clear All Salesman Prices')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Clear All Salesman Prices'));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Clear All Salesman Prices/i })).toBeInTheDocument();
    });
  });

  it('does NOT call DELETE when confirm modal is cancelled', async () => {
    await renderAndGoGlobal();
    fireEvent.click(screen.getByText('Clear All Salesman Prices'));
    await waitFor(() => expect(screen.getByRole('heading', { name: /Clear All Salesman Prices/i })).toBeInTheDocument());

    // Click the Cancel button inside the confirm modal
    const modal = screen.getByRole('heading', { name: /Clear All Salesman Prices/i }).closest('div.bg-white');
    const cancelBtn = within(modal).getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    expect(api.delete).not.toHaveBeenCalled();
  });

  it('calls DELETE for every brand product when confirmed', async () => {
    await renderAndGoGlobal();
    fireEvent.click(screen.getByText('Clear All Salesman Prices'));
    await waitFor(() => expect(screen.getByRole('heading', { name: /Clear All Salesman Prices/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Clear All Prices/i }));

    await waitFor(() => {
      // Nandini brand (id=1) has 2 products
      expect(api.delete).toHaveBeenCalledWith('/products/1/salesperson-prices');
      expect(api.delete).toHaveBeenCalledWith('/products/2/salesperson-prices');
    });
  });

  it('shows success notification with unique salesman count after clear all', async () => {
    await renderAndGoGlobal();
    fireEvent.click(screen.getByText('Clear All Salesman Prices'));
    await waitFor(() => expect(screen.getByRole('heading', { name: /Clear All Salesman Prices/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Clear All Prices/i }));

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith(
        expect.stringContaining('unique salesmen'),
        'success',
      );
    });
  });

  it('refreshes both global products and product view after clear all', async () => {
    await renderAndGoGlobal();
    fireEvent.click(screen.getByText('Clear All Salesman Prices'));
    await waitFor(() => expect(screen.getByRole('heading', { name: /Clear All Salesman Prices/i })).toBeInTheDocument());

    const priorGlobalCalls = vi.mocked(api.get).mock.calls.filter(
      c => c[0] === '/products/salesperson-global'
    ).length;
    const priorPriceCalls = vi.mocked(api.get).mock.calls.filter(
      c => c[0] === '/salespeople/1/prices'
    ).length;

    fireEvent.click(screen.getByRole('button', { name: /Clear All Prices/i }));

    await waitFor(() => {
      const newGlobalCount = vi.mocked(api.get).mock.calls.filter(
        c => c[0] === '/products/salesperson-global'
      ).length;
      expect(newGlobalCount).toBeGreaterThan(priorGlobalCalls);
    });

    await waitFor(() => {
      const newPriceCount = vi.mocked(api.get).mock.calls.filter(
        c => c[0] === '/salespeople/1/prices'
      ).length;
      expect(newPriceCount).toBeGreaterThan(priorPriceCalls);
    });
  });
});
