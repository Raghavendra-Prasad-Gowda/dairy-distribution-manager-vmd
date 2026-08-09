/**
 * PriceSetup (dairy Rate Master) tests.
 *
 * Covers brand loading, category-grouped product listing, search filtering,
 * the edit-price modal (PUT with isActive untouched), and the delete
 * confirmation flow (PUT isActive:false — an archive, not a hard delete).
 */

import React from 'react';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PriceSetup from './PriceSetup';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), put: vi.fn() },
}));

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

vi.mock('../../components/BrandTabs', () => ({
  default: ({ brands, onChange }) => (
    <div data-testid="brand-tabs">
      {brands.map(b => <button key={b.id} onClick={() => onChange(b.id)}>{b.name}</button>)}
    </div>
  ),
}));

vi.mock('../../components/Pagination', () => ({
  default: () => <div data-testid="pagination" />,
}));

const BRANDS = [{ id: 1, name: 'Nandini' }, { id: 2, name: 'Jersey' }];

function product(overrides) {
  return {
    id: 1, name: 'Toned Milk', category: 'Milk', costPrice: 20, sellingPrice: 25,
    ...overrides,
  };
}

function mockApi({ brands = BRANDS, products = [] } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/brands'))   return Promise.resolve({ data: { data: brands } });
    if (url.includes('/products')) return Promise.resolve({ data: { data: products } });
    return Promise.resolve({ data: { data: [] } });
  });
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) — clearAllMocks only wipes call
  // history, so a mockRejectedValue set by an earlier test (e.g. the
  // "server error" case) would otherwise leak into later tests' api.put calls.
  vi.resetAllMocks();
  mockApi();
});

async function renderPage() {
  const utils = render(<PriceSetup />);
  await screen.findByTestId('brand-tabs');
  return utils;
}

describe('PriceSetup — loading products', () => {
  it('fetches products for the first brand by default', async () => {
    await renderPage();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('brandId=1')));
  });

  it('refetches when switching brands', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Jersey'));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('brandId=2')));
  });

  it('groups products by category with a header row', async () => {
    mockApi({ products: [
      product({ id: 1, name: 'Toned Milk', category: 'Milk' }),
      product({ id: 2, name: 'Curd 200g', category: 'Curd' }),
    ] });
    const { container } = await renderPage();
    await screen.findByText('Toned Milk');
    // Category also appears as each row's own category cell, so scope to
    // the dedicated header row (`.cat-row`).
    const headers = [...container.querySelectorAll('.cat-row')].map(r => r.textContent);
    expect(headers).toEqual(['Milk', 'Curd']);
  });

  it('shows a per-brand empty state when there are no products', async () => {
    mockApi({ products: [] });
    await renderPage();
    expect(await screen.findByText(/No products yet for Nandini/)).toBeInTheDocument();
  });
});

describe('PriceSetup — search', () => {
  it('filters by product name or category', async () => {
    mockApi({ products: [
      product({ id: 1, name: 'Toned Milk', category: 'Milk' }),
      product({ id: 2, name: 'Curd 200g', category: 'Curd' }),
    ] });
    await renderPage();
    await screen.findByText('Toned Milk');
    fireEvent.change(screen.getByPlaceholderText(/Search by name or category/i), { target: { value: 'curd' } });
    expect(screen.getByText('Curd 200g')).toBeInTheDocument();
    expect(screen.queryByText('Toned Milk')).toBeNull();
  });

  it('shows "no products match" when the search excludes everything', async () => {
    mockApi({ products: [product()] });
    await renderPage();
    await screen.findByText('Toned Milk');
    fireEvent.change(screen.getByPlaceholderText(/Search by name or category/i), { target: { value: 'nonexistent' } });
    expect(screen.getByText('No products match your search.')).toBeInTheDocument();
  });
});

describe('PriceSetup — edit price', () => {
  it('opens the edit modal prefilled with the current prices', async () => {
    mockApi({ products: [product({ id: 5, costPrice: 20, sellingPrice: 25 })] });
    await renderPage();
    await screen.findByText('Toned Milk');
    fireEvent.click(screen.getByTitle('Edit Price'));

    expect(screen.getByText('Edit Price')).toBeInTheDocument();
    expect(screen.getByDisplayValue('20.00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('25.00')).toBeInTheDocument();
  });

  it('saves the new prices via PUT, preserving the product name', async () => {
    mockApi({ products: [product({ id: 5, name: 'Toned Milk', costPrice: 20, sellingPrice: 25 })] });
    await renderPage();
    await screen.findByText('Toned Milk');
    fireEvent.click(screen.getByTitle('Edit Price'));

    fireEvent.change(screen.getByDisplayValue('20.00'), { target: { value: '22' } });
    fireEvent.click(screen.getByText('Save Price'));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/products/5', {
        name: 'Toned Milk', costPrice: 22, sellingPrice: 25,
      })
    );
    expect(notify).toHaveBeenCalledWith('Price updated', 'success');
  });

  it('shows a server error and keeps the modal open on failure', async () => {
    vi.mocked(api.put).mockRejectedValue({ response: { data: { error: 'Save failed' } } });
    mockApi({ products: [product({ id: 5 })] });
    await renderPage();
    await screen.findByText('Toned Milk');
    fireEvent.click(screen.getByTitle('Edit Price'));
    fireEvent.click(screen.getByText('Save Price'));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Save failed', 'error'));
    expect(screen.getByText('Edit Price')).toBeInTheDocument();
  });

  it('closes the modal on Cancel without saving', async () => {
    mockApi({ products: [product({ id: 5 })] });
    await renderPage();
    await screen.findByText('Toned Milk');
    fireEvent.click(screen.getByTitle('Edit Price'));
    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.queryByText('Edit Price')).toBeNull();
    expect(api.put).not.toHaveBeenCalled();
  });
});

describe('PriceSetup — delete (archive)', () => {
  it('asks for confirmation before archiving', async () => {
    mockApi({ products: [product({ id: 5, name: 'Toned Milk' })] });
    await renderPage();
    await screen.findByText('Toned Milk');
    fireEvent.click(screen.getByTitle('Delete'));

    expect(await screen.findByText('Delete Product')).toBeInTheDocument();
    expect(screen.getByText(/Delete "Toned Milk"\?/)).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('archives (isActive:false) rather than hard-deleting, on confirm', async () => {
    mockApi({ products: [product({ id: 5, name: 'Toned Milk' })] });
    await renderPage();
    await screen.findByText('Toned Milk');
    fireEvent.click(screen.getByTitle('Delete'));
    await screen.findByText('Delete Product');

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/products/5', { isActive: false }));
    expect(notify).toHaveBeenCalledWith('Product deleted', 'success');
  });
});
