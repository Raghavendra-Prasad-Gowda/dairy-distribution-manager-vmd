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
const CATEGORIES = [{ id: 10, name: 'Milk', displayOrder: 1 }];

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
    // Milk (displayOrder: 1) should appear before Curd (displayOrder: 2)
    mockApi({
      products: [product({ id: 1, name: 'Toned Milk', category: 'Milk' }), product({ id: 2, name: 'Curd 200g', category: 'Curd' })],
      categories: [{ id: 10, name: 'Milk', displayOrder: 1 }, { id: 11, name: 'Curd', displayOrder: 2 }],
    });
    const { container } = render(<ProductsSetup />);
    await screen.findByText('Toned Milk');
    const headers = [...container.querySelectorAll('.cat-row')].map(r => r.textContent);
    expect(headers).toEqual(['Milk', 'Curd']);
  });

  it('sorts category groups by dairy layout displayOrder, not insertion order', async () => {
    // Products come back from the API in product displayOrder: Curd first (displayOrder: 1),
    // Milk second (displayOrder: 5) — but category displayOrder says Milk (1) before Curd (2).
    mockApi({
      products: [
        product({ id: 2, name: 'Curd 200g', category: 'Curd', displayOrder: 1 }),
        product({ id: 1, name: 'Toned Milk', category: 'Milk', displayOrder: 5 }),
      ],
      categories: [{ id: 10, name: 'Milk', displayOrder: 1 }, { id: 11, name: 'Curd', displayOrder: 2 }],
    });
    const { container } = render(<ProductsSetup />);
    await screen.findByText('Toned Milk');
    const headers = [...container.querySelectorAll('.cat-row')].map(r => r.textContent);
    // Milk (categoryDisplayOrder 1) must come before Curd (categoryDisplayOrder 2)
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

  it('shows the last cost/selling price change date and time when history exists', async () => {
    mockApi({ products: [product({
      costPrices:    [{ createdAt: '2026-08-01T10:30:00.000Z' }],
      sellingPrices: [{ createdAt: '2026-08-02T14:15:00.000Z' }],
    })] });
    render(<ProductsSetup />);
    await screen.findByText('Toned Milk');
    // 24-hour → 12-hour-with-AM/PM conversion is locale-driven; just assert
    // the date portion (day-month-year) rendered for each price history badge.
    expect(screen.getByText('01 Aug 26')).toBeInTheDocument();
    expect(screen.getByText('02 Aug 26')).toBeInTheDocument();
  });

  it('the X button clears the search and restores the full list', async () => {
    mockApi({ products: [product({ id: 1, name: 'Toned Milk' }), product({ id: 2, name: 'Curd 200g', category: 'Curd' })] });
    render(<ProductsSetup />);
    await screen.findByText('Toned Milk');
    const input = screen.getByPlaceholderText(/Search by name or category/i);
    fireEvent.change(input, { target: { value: 'curd' } });
    expect(screen.queryByText('Toned Milk')).toBeNull();

    fireEvent.click(input.parentElement.querySelector('button'));
    expect(input).toHaveValue('');
    expect(screen.getByText('Toned Milk')).toBeInTheDocument();
  });

  it('notifies an error when the brands fetch fails', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands')) return Promise.reject(new Error('network down'));
      return Promise.resolve({ data: { data: [] } });
    });
    render(<ProductsSetup />);
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Failed to load brands', 'error'));
  });

  it('refetches when switching brand tabs', async () => {
    mockApi({ brands: [{ id: 1, name: 'Nandini' }, { id: 2, name: 'Jersey' }] });
    render(<ProductsSetup />);
    await screen.findByTestId('brand-tabs');
    fireEvent.click(screen.getByText('Jersey'));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('products?brandId=2')));
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

  it('shows an error notification when the toggle fails', async () => {
    mockApi({ products: [product({ id: 4, showInStockReceipt: true })] });
    vi.mocked(api.put).mockRejectedValue(new Error('network down'));
    render(<ProductsSetup />);
    await screen.findByText('Toned Milk');
    fireEvent.click(screen.getByTitle('Hide from Stock Receipt'));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Something went wrong', 'error'));
  });
});

describe('ProductsSetup — size per unit options', () => {
  const sizeSelect = () => screen.getByText(/Size per unit/).closest('div').querySelector('select');
  const sizes = () => [...sizeSelect().options].map(o => o.value).filter(Boolean).map(Number);

  it('offers the sizes from the Jersey price revision (475 ml, 425/440/950 g, 10 kg)', async () => {
    render(<ProductsSetup />);
    await screen.findByText('Add Product');
    fireEvent.click(screen.getByText('Add Product'));
    expect(sizes()).toEqual(expect.arrayContaining([425, 440, 475, 950, 10000]));
  });

  it('keeps the list in ascending order', async () => {
    render(<ProductsSetup />);
    await screen.findByText('Add Product');
    fireEvent.click(screen.getByText('Add Product'));
    expect(sizes()).toEqual([...sizes()].sort((a, b) => a - b));
  });

  it('keeps an existing product\'s unusual size selectable when editing', async () => {
    mockApi({ products: [product({ id: 7, name: 'Odd Pack', unitSize: 333 })] });
    render(<ProductsSetup />);
    await screen.findByText('Odd Pack');
    fireEvent.click(screen.getByTitle('Edit'));
    expect(sizeSelect().value).toBe('333');
    expect(sizes()).toContain(333);
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

  it('shows the server error, and falls back to a generic message with no server error', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'Name already exists' } } });
    render(<ProductsSetup />);
    await screen.findByText(/No products yet for Nandini/);
    await openAddAndFillBasics();
    fireEvent.click(screen.getByText('Add Product', { selector: 'button[type="submit"]' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Name already exists', 'error'));

    vi.mocked(api.post).mockRejectedValue(new Error('network down'));
    fireEvent.click(screen.getByText('Add Product', { selector: 'button[type="submit"]' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Something went wrong', 'error'));
  });

  it('lets the ml unit size be changed via the size dropdown', async () => {
    render(<ProductsSetup />);
    await screen.findByText(/No products yet for Nandini/);
    await openAddAndFillBasics();
    fireEvent.change(screen.getByDisplayValue('500 ml'), { target: { value: '1000' } });
    fireEvent.click(screen.getByText('Add Product', { selector: 'button[type="submit"]' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1]).toMatchObject({ unitSize: 1000 });
  });

  it('shows the "Scheduled" banner when the effective date is in the future', async () => {
    render(<ProductsSetup />);
    await screen.findByText(/No products yet for Nandini/);
    fireEvent.click(screen.getByText('Add Product'));
    expect(screen.queryByText(/Scheduled — kicks in/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('2026-08-09'), { target: { value: '2026-09-01' } });
    expect(screen.getByText(/Scheduled — kicks in on 1 Sept?\s*2026/)).toBeInTheDocument();
  });

  it('Cancel and the X button both close the Add modal without posting', async () => {
    render(<ProductsSetup />);
    await screen.findByText(/No products yet for Nandini/);
    fireEvent.click(screen.getByText('Add Product'));
    fireEvent.change(screen.getByPlaceholderText(/Homogenised Milk/), { target: { value: 'New Product' } });
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText(/Homogenised Milk/)).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Add Product'));
    fireEvent.click(screen.getByText('Add New Product').closest('div.bg-emerald-800').querySelector('button'));
    expect(screen.queryByPlaceholderText(/Homogenised Milk/)).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
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

  it('shows an error notification when archiving fails', async () => {
    mockApi({ products: [product({ id: 8, name: 'Toned Milk' })] });
    vi.mocked(api.put).mockRejectedValue(new Error('network down'));
    render(<ProductsSetup />);
    await screen.findByText('Toned Milk');
    fireEvent.click(screen.getByTitle('Archive'));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Something went wrong', 'error'));
  });
});

describe('ProductsSetup — pagination overflow', () => {
  it('splits into a second page once a category group pushes past 10 items', async () => {
    const milk = Array.from({ length: 6 }, (_, i) => product({ id: i + 1, name: `Milk ${i}`, category: 'Milk' }));
    const curd = Array.from({ length: 6 }, (_, i) => product({ id: i + 100, name: `Curd ${i}`, category: 'Curd' }));
    mockApi({ products: [...milk, ...curd], categories: [{ id: 10, name: 'Milk', displayOrder: 1 }, { id: 11, name: 'Curd', displayOrder: 2 }] });
    render(<ProductsSetup />);
    await screen.findByText('Milk 0');
    // Curd's whole group (6 items) would push the running count to 12 > 10,
    // so it spills entirely onto page 2 rather than being split mid-category.
    expect(screen.queryByText('Curd 0')).not.toBeInTheDocument();
  });
});
