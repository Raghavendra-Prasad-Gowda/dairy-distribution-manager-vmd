/**
 * SalesmanPricesSetup component tests.
 *
 * Tests for basic component rendering and visibility:
 * - Component renders without errors
 * - Global Settings button is visible
 * - Salesperson list is available
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SalesmanPricesSetup from './SalesmanPricesSetup';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

vi.mock('../../utils/dateUtils', () => ({
  getIndiaDate:       () => '2026-07-25',
  formatDateShort:    (d) => d ? new Date(d).toLocaleDateString('en-IN') : '',
  formatCurrency:     (v) => `₹${Number(v).toFixed(2)}`,
}));

vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({
    notify: vi.fn(),
  }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'admin' } }),
}));

vi.mock('../../components/BrandTabs', () => ({
  default: ({ brands, activeBrandId, onChange }) => (
    <div data-testid="brand-tabs">
      {brands.map(b => (
        <button key={b.id} onClick={() => onChange(b.id)}>
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

const SALESPEOPLE = [
  { id: 1, name: 'Ramesh Kumar', route: 'Route 3', isActive: true },
  { id: 2, name: 'Suresh Babu', route: 'Route 5', isActive: true },
];

const BRANDS = [
  { id: 1, name: 'Nandini', displayOrder: 1 },
  { id: 2, name: 'Jersey', displayOrder: 2 },
];

function mockApiResponses() {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/salespeople')) {
      return Promise.resolve({
        data: { data: SALESPEOPLE },
      });
    }
    if (url.includes('/brands')) {
      return Promise.resolve({
        data: { data: BRANDS },
      });
    }
    if (url.includes('/prices')) {
      return Promise.resolve({
        data: { data: [] },
      });
    }
    if (url.includes('/products/salesperson-global')) {
      return Promise.resolve({
        data: { data: [] },
      });
    }
    return Promise.resolve({ data: { data: [] } });
  });
}

describe('SalesmanPricesSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiResponses();
  });

  it('renders the component without errors', async () => {
    render(<SalesmanPricesSetup />);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/salespeople?all=true');
    });
  });

  it('shows Global Settings option in sidebar', async () => {
    render(<SalesmanPricesSetup />);
    const globalBtn = await screen.findByText('Global');
    expect(globalBtn).toBeInTheDocument();
  });

  it('displays salespeople in the sidebar', async () => {
    render(<SalesmanPricesSetup />);
    await waitFor(() => {
      expect(screen.getByText('Ramesh Kumar')).toBeInTheDocument();
    });
  });

  it('loads salespeople data on mount', async () => {
    render(<SalesmanPricesSetup />);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/salespeople?all=true');
    });
  });

  it('loads brands data on mount', async () => {
    render(<SalesmanPricesSetup />);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/brands');
    });
  });

  it('displays brand tabs after loading', async () => {
    render(<SalesmanPricesSetup />);
    await waitFor(() => {
      expect(screen.getByTestId('brand-tabs')).toBeInTheDocument();
    });
  });

  it('displays search input for products', async () => {
    render(<SalesmanPricesSetup />);
    const searchInput = await screen.findByPlaceholderText('Search by product name or category…');
    expect(searchInput).toBeInTheDocument();
  });

  it('displays salesperson search input', async () => {
    render(<SalesmanPricesSetup />);
    const searchInput = await screen.findByPlaceholderText('Search salesperson…');
    expect(searchInput).toBeInTheDocument();
  });

  it('displays Save button', async () => {
    render(<SalesmanPricesSetup />);
    await waitFor(() => {
      const saveBtn = screen.queryByRole('button', { name: /Save/i });
      expect(saveBtn).toBeInTheDocument();
    });
  });

  it('global button text displays correctly', async () => {
    render(<SalesmanPricesSetup />);
    const globalBtn = await screen.findByText('Global');
    expect(globalBtn.textContent).toBe('Global');
  });

  it('renders placeholder when no salesperson selected', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/salespeople')) {
        return Promise.resolve({
          data: { data: [] },
        });
      }
      if (url.includes('/brands')) {
        return Promise.resolve({
          data: { data: BRANDS },
        });
      }
      return Promise.resolve({ data: { data: [] } });
    });

    render(<SalesmanPricesSetup />);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/salespeople?all=true');
    });
  });

  it('fetches salesperson prices when salesperson selected', async () => {
    render(<SalesmanPricesSetup />);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/salespeople/1/prices');
    });
  });

  it('disables Save button when no changes', async () => {
    render(<SalesmanPricesSetup />);
    await waitFor(() => {
      const saveBtn = screen.getByRole('button', { name: /Save/i });
      expect(saveBtn).toBeDisabled();
    });
  });

  it('does NOT show the Exception Manager button for admin role in global mode', async () => {
    // This file mocks useAuth with role 'admin' — superadmin-only features must be hidden
    render(<SalesmanPricesSetup />);
    await screen.findByText('Ramesh Kumar');
    fireEvent.click(screen.getByText('Global'));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/products/salesperson-global'));
    expect(screen.queryByText('Exception Manager')).not.toBeInTheDocument();
  });
});

// ─── Layout order ─────────────────────────────────────────────────────────────
// `filteredGrouped` sorts products by category display order, then each
// product's own display order, then name — the exact layout the Profit &
// Loss report and the salesman's Stock Entry page were built to mirror. This
// was previously untested, so a regression here would have silently
// desynced this page's own reference ordering from everywhere else.

describe('SalesmanPricesSetup — layout order', () => {
  // Deliberately scrambled: Curd (the higher categoryDisplayOrder) is listed
  // FIRST in the raw API response — a plain-object group-by would insert its
  // key first too, so this decouples the assertion from insertion order and
  // actually exercises the sort. Toned Milk (the higher displayOrder) is
  // likewise listed before Special Milk within Milk.
  const PRICES = [
    { productId: 4, productName: 'Curd 200g', brandId: 1, category: 'Curd', categoryDisplayOrder: 1, displayOrder: 0,
      isEnabled: true, salespersonEnabled: true, sellingPrice: 12, dairyCostPrice: 10, dairySellingPrice: 11,
      effectiveFrom: null, upcomingSellingPrice: null, upcomingEffectiveFrom: null },
    { productId: 3, productName: 'Toned Milk', brandId: 1, category: 'Milk', categoryDisplayOrder: 0, displayOrder: 1,
      isEnabled: true, salespersonEnabled: true, sellingPrice: 25, dairyCostPrice: 20, dairySellingPrice: 22,
      effectiveFrom: null, upcomingSellingPrice: null, upcomingEffectiveFrom: null },
    { productId: 5, productName: 'Special Milk', brandId: 1, category: 'Milk', categoryDisplayOrder: 0, displayOrder: 0,
      isEnabled: true, salespersonEnabled: true, sellingPrice: 30, dairyCostPrice: 25, dairySellingPrice: 27,
      effectiveFrom: null, upcomingSellingPrice: null, upcomingEffectiveFrom: null },
  ];

  function mockApiWithPrices() {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/salespeople?all=true')) return Promise.resolve({ data: { data: SALESPEOPLE } });
      if (url.includes('/brands'))               return Promise.resolve({ data: { data: BRANDS } });
      if (url.includes('/prices'))                return Promise.resolve({ data: { data: PRICES } });
      return Promise.resolve({ data: { data: [] } });
    });
  }

  it('groups products by category, ordered by categoryDisplayOrder, not the API order', async () => {
    mockApiWithPrices();
    render(<SalesmanPricesSetup />);
    await screen.findByText('Toned Milk');

    const milkHeader = screen.getByText('Milk').closest('tr');
    const curdHeader = screen.getByText('Curd').closest('tr');
    expect(!!(milkHeader.compareDocumentPosition(curdHeader) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('orders products within a category by their own displayOrder, not the API order', async () => {
    mockApiWithPrices();
    render(<SalesmanPricesSetup />);
    await screen.findByText('Toned Milk');

    const specialMilk = screen.getByText('Special Milk').closest('tr'); // displayOrder 0
    const tonedMilk    = screen.getByText('Toned Milk').closest('tr');   // displayOrder 1
    expect(!!(specialMilk.compareDocumentPosition(tonedMilk) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('falls back to alphabetical order when categoryDisplayOrder ties', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/salespeople?all=true')) return Promise.resolve({ data: { data: SALESPEOPLE } });
      if (url.includes('/brands'))               return Promise.resolve({ data: { data: BRANDS } });
      if (url.includes('/prices')) return Promise.resolve({
        data: {
          data: [
            { productId: 1, productName: 'Zed Product',  brandId: 1, category: 'Zed',  categoryDisplayOrder: 999,
              displayOrder: 0, isEnabled: true, salespersonEnabled: true, sellingPrice: 10,
              dairyCostPrice: 8, dairySellingPrice: 9, effectiveFrom: null, upcomingSellingPrice: null, upcomingEffectiveFrom: null },
            { productId: 2, productName: 'Amul Product', brandId: 1, category: 'Amul', categoryDisplayOrder: 999,
              displayOrder: 0, isEnabled: true, salespersonEnabled: true, sellingPrice: 10,
              dairyCostPrice: 8, dairySellingPrice: 9, effectiveFrom: null, upcomingSellingPrice: null, upcomingEffectiveFrom: null },
          ],
        },
      });
      return Promise.resolve({ data: { data: [] } });
    });

    render(<SalesmanPricesSetup />);
    await screen.findByText('Zed Product');

    const amulHeader = screen.getByText('Amul').closest('tr');
    const zedHeader   = screen.getByText('Zed').closest('tr');
    expect(!!(amulHeader.compareDocumentPosition(zedHeader) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });
});
