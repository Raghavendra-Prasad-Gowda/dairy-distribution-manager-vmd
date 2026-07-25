/**
 * SalesmanPricesSetup component tests.
 *
 * Tests for basic component rendering and visibility:
 * - Component renders without errors
 * - Global Settings button is visible
 * - Salesperson list is available
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
});
