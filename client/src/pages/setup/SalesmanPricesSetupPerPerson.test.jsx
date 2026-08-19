/**
 * Per-salesperson mode tests for SalesmanPricesSetup — the flows that
 * SalesmanPricesSetup.test.jsx (basic rendering + layout order) and
 * SalesmanPricesSetupGlobal.test.jsx (global settings) don't cover:
 *
 *   1. Initial load failure (salespeople/brands fetch)
 *   2. Per-row price edit modal (open, save, validate, error, cancel, history)
 *   3. Per-product enable/disable toggle + bulk Save
 *   4. Copy Prices modal
 *   5. Brand tab switching (refetches prices, resets search/page)
 *   6. "Enabled only" / "Show all" filter toggle
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SalesmanPricesSetup from './SalesmanPricesSetup';
import api from '../../api/axios';

const mockNotify = vi.fn();

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../utils/dateUtils', () => ({
  getIndiaDate:    () => '2026-07-25',
  formatDateShort: (d) => (d ? new Date(d).toLocaleDateString('en-IN') : ''),
  formatCurrency:  (v) => `₹${Number(v).toFixed(2)}`,
}));

vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify: mockNotify }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'admin' } }),
}));

vi.mock('../../components/BrandTabs', () => ({
  default: ({ brands, onChange }) => (
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

const SP1_PRICES = [
  {
    productId: 1, productName: 'Toned Milk', brandId: 1, brandName: 'Nandini',
    category: 'Milk', categoryDisplayOrder: 1, displayOrder: 1,
    sellingPrice: 52, isEnabled: true, salespersonEnabled: true,
    dairyCostPrice: 30, dairySellingPrice: 45,
    effectiveFrom: '2026-07-01', upcomingSellingPrice: null, upcomingEffectiveFrom: null,
    unitType: 'ml', unitSize: 500, containerType: 'crate', unitsPerContainer: 20,
  },
  {
    productId: 2, productName: 'Ghee 200ml', brandId: 1, brandName: 'Nandini',
    category: 'Ghee', categoryDisplayOrder: 2, displayOrder: 1,
    sellingPrice: null, isEnabled: false, salespersonEnabled: false,
    dairyCostPrice: 80, dairySellingPrice: 100,
    effectiveFrom: null, upcomingSellingPrice: null, upcomingEffectiveFrom: null,
    unitType: 'ml', unitSize: 200, containerType: null, unitsPerContainer: null,
  },
];

function setupDefaultMocks({ prices = SP1_PRICES, salespeople = SALESPEOPLE, brands = BRANDS } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url === '/salespeople?all=true') return Promise.resolve({ data: { data: salespeople } });
    if (url === '/brands')               return Promise.resolve({ data: { data: brands } });
    if (url === '/salespeople/1/prices') return Promise.resolve({ data: { data: prices } });
    if (url === '/salespeople/2/prices') return Promise.resolve({ data: { data: [] } });
    return Promise.resolve({ data: { data: [] } });
  });
}

async function renderReady() {
  setupDefaultMocks();
  render(<SalesmanPricesSetup />);
  await screen.findByText('Toned Milk');
}

async function openPriceEditModal() {
  await renderReady();
  fireEvent.click(screen.getByTitle('Edit price'));
  await screen.findByText('Edit Price');
}

describe('SalesmanPricesSetup (per-person) — initial load failure', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

  it('notifies an error when the initial salespeople/brands fetch fails', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/salespeople?all=true') return Promise.reject(new Error('network down'));
      return Promise.resolve({ data: { data: [] } });
    });
    render(<SalesmanPricesSetup />);
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith('Failed to load data', 'error'));
  });
});

describe('SalesmanPricesSetup (per-person) — price edit modal', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

  it('opens pre-filled with the current price and unit/pack details', async () => {
    await openPriceEditModal();
    expect(screen.getByDisplayValue('52')).toBeInTheDocument();
    expect(screen.getByText('500 ml')).toBeInTheDocument();
    expect(screen.getByText('20 / crate')).toBeInTheDocument();
  });

  it('saves a new price and refreshes the price list', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    await openPriceEditModal();

    fireEvent.change(screen.getByDisplayValue('52'), { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Price' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/salespeople/1/prices/bulk', {
      effectiveFrom: '2026-07-25',
      prices: [{ productId: 1, sellingPrice: 55, effectiveFrom: '2026-07-25' }],
    }));
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith('Price updated', 'success'));
    // Modal closes on success.
    await waitFor(() => expect(screen.queryByText('Edit Price')).not.toBeInTheDocument());
  });

  it('rejects an invalid price without calling the API', async () => {
    await openPriceEditModal();
    fireEvent.change(screen.getByDisplayValue('52'), { target: { value: '-5' } });
    // fireEvent.submit bypasses the input's native HTML5 constraint validation
    // (min="0", required) so the component's own validation is what's exercised.
    fireEvent.submit(screen.getByRole('button', { name: 'Save Price' }).closest('form'));

    expect(mockNotify).toHaveBeenCalledWith('Enter a valid price', 'warning');
    expect(api.post).not.toHaveBeenCalled();
    // Modal stays open so the admin can correct it.
    expect(screen.getByText('Edit Price')).toBeInTheDocument();
  });

  it('shows the server error message when saving fails', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'Price locked' } } });
    await openPriceEditModal();

    fireEvent.change(screen.getByDisplayValue('52'), { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Price' }));

    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith('Price locked', 'error'));
    // Modal stays open on failure.
    expect(screen.getByText('Edit Price')).toBeInTheDocument();
  });

  it('falls back to a generic error message when saving fails with no server error', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('network down'));
    await openPriceEditModal();

    fireEvent.change(screen.getByDisplayValue('52'), { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Price' }));

    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith('Failed to save price', 'error'));
  });

  it('Cancel closes the modal without saving', async () => {
    await openPriceEditModal();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Edit Price')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('History opens the price schedule modal, and it can be closed independently', async () => {
    await openPriceEditModal();
    fireEvent.click(screen.getByRole('button', { name: 'History' }));

    await screen.findByText('Price Schedule');
    // "Current Price" also appears in the underlying edit modal — scope to
    // the history modal itself.
    const historyModal = screen.getByText('Price Schedule').closest('div.bg-white');
    expect(within(historyModal).getByText('Current Price')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Price Schedule')).not.toBeInTheDocument();
    // The underlying edit modal is still open.
    expect(screen.getByText('Edit Price')).toBeInTheDocument();
  });
});

describe('SalesmanPricesSetup (per-person) — toggle + Save', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

  it('toggling a product marks it dirty ("unsaved") and enables Save', async () => {
    await renderReady();
    const row = screen.getByText('Toned Milk').closest('tr');
    fireEvent.click(within(row).getAllByRole('button').at(-1)); // last button = TogglePill

    expect(within(row).getByText('unsaved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save/i })).not.toBeDisabled();
  });

  it('shows an info notice when enabling a globally-disabled product as an exception', async () => {
    await renderReady();
    fireEvent.click(screen.getByText('Enabled only')); // reveal disabled products ("Show all")
    const row = screen.getByText('Ghee 200ml').closest('tr'); // isEnabled:false, salespersonEnabled:false
    fireEvent.click(within(row).getAllByRole('button').at(-1)); // last button = TogglePill

    expect(mockNotify).toHaveBeenCalledWith(
      'Enabling as exception — this product is still off globally for all other salespeople.',
      'info',
    );
  });

  it('saves toggle changes with the expected payload and refreshes', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    await renderReady();

    const row = screen.getByText('Toned Milk').closest('tr');
    fireEvent.click(within(row).getAllByRole('button').at(-1)); // last button = TogglePill
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/salespeople/1/products/bulk', {
      products: [{ productId: 1, isEnabled: false }],
    }));
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith('Saved successfully', 'success'));
  });

  it('shows the server error message when saving toggle changes fails', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'Conflict' } } });
    await renderReady();

    const row = screen.getByText('Toned Milk').closest('tr');
    fireEvent.click(within(row).getAllByRole('button').at(-1)); // last button = TogglePill
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith('Conflict', 'error'));
  });
});

describe('SalesmanPricesSetup (per-person) — Copy Prices', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

  /** The modal's own submit button shares its accessible name ("Copy Prices")
   * with the toolbar trigger button that opens it — scope to the modal. */
  function copyModal() {
    return screen.getByRole('heading', { name: 'Copy Prices' }).closest('div.bg-white');
  }

  it('Copy Prices button is disabled until a source salesman is picked', async () => {
    await renderReady();
    fireEvent.click(screen.getByText('Copy Prices'));
    await screen.findByRole('heading', { name: 'Copy Prices' });

    expect(within(copyModal()).getByRole('button', { name: 'Copy Prices' })).toBeDisabled();
  });

  it('copies prices from the selected salesman and refreshes', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    await renderReady();
    fireEvent.click(screen.getByText('Copy Prices'));
    await screen.findByRole('heading', { name: 'Copy Prices' });

    fireEvent.click(within(copyModal()).getByText('Suresh Babu'));
    fireEvent.click(within(copyModal()).getByRole('button', { name: 'Copy Prices' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/salespeople/1/prices/copy-from/2?brandId=1'));
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith('Prices copied successfully', 'success'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Copy Prices' })).not.toBeInTheDocument());
  });

  it('shows the server error message when copying fails', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'Nothing to copy' } } });
    await renderReady();
    fireEvent.click(screen.getByText('Copy Prices'));
    await screen.findByRole('heading', { name: 'Copy Prices' });

    fireEvent.click(within(copyModal()).getByText('Suresh Babu'));
    fireEvent.click(within(copyModal()).getByRole('button', { name: 'Copy Prices' }));

    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith('Nothing to copy', 'error'));
    // Modal stays open on failure.
    expect(screen.getByRole('heading', { name: 'Copy Prices' })).toBeInTheDocument();
  });

  it('Cancel resets the selection and closes without copying', async () => {
    await renderReady();
    fireEvent.click(screen.getByText('Copy Prices'));
    await screen.findByRole('heading', { name: 'Copy Prices' });
    fireEvent.click(within(copyModal()).getByText('Suresh Babu'));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'Copy Prices' })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('SalesmanPricesSetup (per-person) — brand switching', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

  it('re-fetches prices and resets search/page when switching brands', async () => {
    await renderReady();
    fireEvent.change(screen.getByPlaceholderText('Search by product name or category…'), { target: { value: 'toned' } });

    const priorCalls = vi.mocked(api.get).mock.calls.filter(c => c[0] === '/salespeople/1/prices').length;
    fireEvent.click(screen.getByTestId('brand-tab-2'));

    await waitFor(() => {
      const newCalls = vi.mocked(api.get).mock.calls.filter(c => c[0] === '/salespeople/1/prices').length;
      expect(newCalls).toBeGreaterThan(priorCalls);
    });
    expect(screen.getByPlaceholderText('Search by product name or category…')).toHaveValue('');
  });
});

describe('SalesmanPricesSetup (per-person) — sidebar salesperson search', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

  it('filters the sidebar by name and, separately, by route', async () => {
    await renderReady();
    const searchInput = screen.getByPlaceholderText('Search salesperson…');

    fireEvent.change(searchInput, { target: { value: 'suresh' } });
    expect(screen.getByText('Suresh Babu')).toBeInTheDocument();
    expect(screen.queryByText('Ramesh Kumar')).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'route 3' } });
    expect(screen.getByText('Ramesh Kumar')).toBeInTheDocument();
    expect(screen.queryByText('Suresh Babu')).not.toBeInTheDocument();
  });
});

describe('SalesmanPricesSetup (per-person) — pagination overflow', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

  it('splits into a second page once a category group pushes past 10 items', async () => {
    // 6 products in "Milk" (fits) + 6 more in "Curd" (11th item overflows
    // the 10-per-page bucket) — Curd's whole group must land on page 2,
    // not be split mid-category.
    const milk = Array.from({ length: 6 }, (_, i) => ({
      productId: i + 1, productName: `Milk ${i}`, brandId: 1, brandName: 'Nandini',
      category: 'Milk', categoryDisplayOrder: 0, displayOrder: i,
      sellingPrice: 20, isEnabled: true, salespersonEnabled: true,
      dairyCostPrice: 10, dairySellingPrice: 15,
      effectiveFrom: null, upcomingSellingPrice: null, upcomingEffectiveFrom: null,
    }));
    const curd = Array.from({ length: 6 }, (_, i) => ({
      productId: i + 100, productName: `Curd ${i}`, brandId: 1, brandName: 'Nandini',
      category: 'Curd', categoryDisplayOrder: 1, displayOrder: i,
      sellingPrice: 20, isEnabled: true, salespersonEnabled: true,
      dairyCostPrice: 10, dairySellingPrice: 15,
      effectiveFrom: null, upcomingSellingPrice: null, upcomingEffectiveFrom: null,
    }));

    setupDefaultMocks({ prices: [...milk, ...curd] });
    render(<SalesmanPricesSetup />);
    await screen.findByText('Milk 0');

    // Page 1 holds all 6 Milk items; Curd (would push count to 12 > 10)
    // spills entirely onto page 2.
    expect(screen.queryByText('Curd 0')).not.toBeInTheDocument();
  });
});

describe('SalesmanPricesSetup (per-person) — "Enabled only" filter', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

  it('defaults to hiding disabled products, and "Show all" reveals them', async () => {
    await renderReady();
    expect(screen.queryByText('Ghee 200ml')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Enabled only'));
    expect(await screen.findByText('Ghee 200ml')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Show all'));
    expect(screen.queryByText('Ghee 200ml')).not.toBeInTheDocument();
  });
});
