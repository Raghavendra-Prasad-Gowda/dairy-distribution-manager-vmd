/**
 * ProductsSetup tests.
 *
 * Covers category-grouped listing, search, the add/edit form's payload
 * shaping (unit size nulled for "piece", units-per-container nulled when no
 * container is picked, category resolved from the selected id to its name),
 * the edit form's "effective date always resets to today" behaviour, the
 * archive confirmation flow, and the "Show in Receipt" toggle's optimistic
 * local update (no full refetch).
 */

import React from 'react';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProductsSetup from './ProductsSetup';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

vi.mock('../../utils/dateUtils', async () => {
  const actual = await vi.importActual('../../utils/dateUtils');
  return { ...actual, getIndiaDate: () => '2026-08-09' };
});

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

const BRANDS = [{ id: 1, name: 'Nandini' }];
const CATEGORIES = [{ id: 10, name: 'Milk' }];

function product(overrides) {
  return {
    id: 1, name: 'Toned Milk', category: 'Milk',
    unitType: 'ml', unitSize: 500, containerType: 'crate', unitsPerContainer: 20,
    costPrice: 20, sellingPrice: 25, showInStockReceipt: true,
    costPrices: [], sellingPrices: [],
    ...overrides,
  };
}

function mockApi({ brands = BRANDS, products = [], categories = CATEGORIES } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/brands'))     return Promise.resolve({ data: { data: brands } });
    if (url.includes('/categories')) return Promise.resolve({ data: { data: categories } });
    if (url.includes('/products'))   return Promise.resolve({ data: { data: products } });
    return Promise.resolve({ data: { data: [] } });
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockApi();
});

describe('ProductsSetup — listing', () => {
  it('groups products by category with a header row', async () => {
    mockApi({ products: [product({ id: 1, name: 'Toned Milk', category: 'Milk' }), product({ id: 2, name: 'Curd 200g', category: 'Curd' })] });
    const { container } = render(<ProductsSetup />);
    await screen.findByText('Toned Milk');
    const headers = [...container.querySelectorAll('.cat-row')].map(r => r.textContent);
    expect(headers).toEqual(['Milk', 'Curd']);
  });

  it('shows an empty state naming the active brand', async () => {
    render(<ProductsSetup />);
    expect(await screen.findByText(/No products yet for Nandini/)).toBeInTheDocument();
  });

  it('filters by name or category', async () => {
    mockApi({ products: [product({ id: 1, name: 'Toned Milk' }), product({ id: 2, name: 'Curd 200g', category: 'Curd' })] });
    render(<ProductsSetup />);
    await screen.findByText('Toned Milk');
    fireEvent.change(screen.getByPlaceholderText(/Search by name or category/i), { target: { value: 'curd' } });
    expect(screen.getByText('Curd 200g')).toBeInTheDocument();
    expect(screen.queryByText('Toned Milk')).toBeNull();
  });

  it('shows the upcoming price and its effective date when present', async () => {
    mockApi({ products: [product({ upcomingCostPrice: 22, upcomingCostPriceFrom: '2026-09-01T00:00:00.000Z' })] });
    render(<ProductsSetup />);
    await screen.findByText('Toned Milk');
    expect(screen.getByText(/22\.00/)).toBeInTheDocument();
  });
});

describe('ProductsSetup — Show in Receipt toggle', () => {
  it('PUTs the flipped flag and updates locally without a full refetch', async () => {
    mockApi({ products: [product({ id: 4, showInStockReceipt: true })] });
    render(<ProductsSetup />);
    await screen.findByText('Toned Milk');
    const getCallsBefore = api.get.mock.calls.length;

    fireEvent.click(screen.getByTitle('Hide from Stock Receipt'));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/products/4', { showInStockReceipt: false }));
    // No extra GETs — the toggle updates React state directly.
    expect(api.get.mock.calls.length).toBe(getCallsBefore);
    expect(screen.getByTitle('Show in Stock Receipt')).toBeInTheDocument();
  });
});

describe('ProductsSetup — add product', () => {
  async function openAddAndFillBasics() {
    fireEvent.click(screen.getByText('Add Product'));
    fireEvent.change(screen.getByPlaceholderText(/Homogenised Milk/), { target: { value: 'New Product' } });
    // Cost Price and Selling Price inputs share the same "0.00" placeholder.
    fireEvent.change(screen.getAllByPlaceholderText('0.00')[0], { target: { value: '15' } });
    fireEvent.change(screen.getAllByPlaceholderText('0.00')[1], { target: { value: '20' } });
  }

  it('nulls unitSize when unit type is piece', async () => {
    render(<ProductsSetup />);
    await screen.findByText(/No products yet for Nandini/);
    await openAddAndFillBasics();
    fireEvent.click(screen.getByText('piece'));
    fireEvent.click(screen.getByText('Add Product', { selector: 'button[type="submit"]' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const payload = api.post.mock.calls[0][1];
    expect(payload).toMatchObject({ brandId: 1, name: 'New Product', unitType: 'piece', unitSize: null });
  });

  it('nulls unitsPerContainer when no container is selected', async () => {
    render(<ProductsSetup />);
    await screen.findByText(/No products yet for Nandini/);
    await openAddAndFillBasics();
    fireEvent.click(screen.getByText('Add Product', { selector: 'button[type="submit"]' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const payload = api.post.mock.calls[0][1];
    expect(payload).toMatchObject({ containerType: null, unitsPerContainer: null });
  });

  it('includes unitsPerContainer once a container type is picked', async () => {
    render(<ProductsSetup />);
    await screen.findByText(/No products yet for Nandini/);
    await openAddAndFillBasics();
    fireEvent.click(screen.getByText('Crate'));
    fireEvent.change(screen.getByPlaceholderText('e.g. 12'), { target: { value: '20' } });
    fireEvent.click(screen.getByText('Add Product', { selector: 'button[type="submit"]' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const payload = api.post.mock.calls[0][1];
    expect(payload).toMatchObject({ containerType: 'crate', unitsPerContainer: 20 });
  });

  it('resolves the selected category id to its name in the payload', async () => {
    render(<ProductsSetup />);
    await screen.findByText(/No products yet for Nandini/);
    await openAddAndFillBasics();
    fireEvent.change(screen.getByDisplayValue('— No category —'), { target: { value: String(CATEGORIES[0].id) } });
    fireEvent.click(screen.getByText('Add Product', { selector: 'button[type="submit"]' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1]).toMatchObject({ category: 'Milk' });
  });

  it('shows the server error on a failed create', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'Name already exists' } } });
    render(<ProductsSetup />);
    await screen.findByText(/No products yet for Nandini/);
    await openAddAndFillBasics();
    fireEvent.click(screen.getByText('Add Product', { selector: 'button[type="submit"]' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Name already exists', 'error'));
  });
});

describe('ProductsSetup — edit product', () => {
  it('prefills from the existing product, resolving category name back to its id', async () => {
    // unitsPerContainer deliberately != costPrice/sellingPrice so displayValue queries don't collide.
    mockApi({ products: [product({ id: 5, name: 'Toned Milk', category: 'Milk', costPrice: 20, sellingPrice: 25, unitsPerContainer: 24 })] });
    render(<ProductsSetup />);
    await screen.findByText('Toned Milk');
    fireEvent.click(screen.getByTitle('Edit'));

    expect(screen.getByDisplayValue('Toned Milk')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Milk')).toBeInTheDocument();
    expect(screen.getByDisplayValue('20')).toBeInTheDocument();
    expect(screen.getByDisplayValue('25')).toBeInTheDocument();
  });

  it('always defaults the effective date to today, not the product\'s original date', async () => {
    mockApi({ products: [product({ id: 5 })] });
    render(<ProductsSetup />);
    await screen.findByText('Toned Milk');
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByDisplayValue('2026-08-09')).toBeInTheDocument();
  });

  it('saves via PUT with the resolved payload', async () => {
    mockApi({ products: [product({ id: 5, name: 'Toned Milk' })] });
    render(<ProductsSetup />);
    await screen.findByText('Toned Milk');
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.change(screen.getByDisplayValue('Toned Milk'), { target: { value: 'Toned Milk Fresh' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/products/5', expect.objectContaining({ name: 'Toned Milk Fresh' })));
    expect(notify).toHaveBeenCalledWith('Product updated', 'success');
  });
});

describe('ProductsSetup — archive', () => {
  it('asks for confirmation, then archives (isActive:false) on confirm', async () => {
    mockApi({ products: [product({ id: 8, name: 'Toned Milk' })] });
    render(<ProductsSetup />);
    await screen.findByText('Toned Milk');
    fireEvent.click(screen.getByTitle('Archive'));

    expect(await screen.findByText('Archive Product')).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/products/8', { isActive: false }));
    expect(notify).toHaveBeenCalledWith('Product archived', 'success');
  });
});
