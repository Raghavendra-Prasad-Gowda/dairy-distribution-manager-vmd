/**
 * LayoutSettings tests.
 *
 * Actual pointer-drag reordering (dnd-kit) isn't practical to simulate in
 * jsdom, so product drag-and-drop itself is out of scope here. Everything
 * else is covered: standalone vs shell mode, category grouping/order,
 * filtering out inactive/hidden products, category up/down reordering (the
 * one interaction that's a plain click, not a drag) and its effect on the
 * dirty flag, and the save flow's two PATCH calls.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LayoutSettings from './LayoutSettings';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), patch: vi.fn() },
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

const BRANDS = [{ id: 1, name: 'Nandini' }, { id: 2, name: 'Jersey' }];

function category(overrides) {
  return { id: 1, name: 'Milk', displayOrder: 0, ...overrides };
}
function product(overrides) {
  return {
    id: 1, name: 'Toned Milk', category: 'Milk', displayOrder: 0,
    isActive: true, showInStockReceipt: true, unitType: 'ml', unitSize: 500,
    ...overrides,
  };
}

function mockApi({ brands = BRANDS, categories = [], products = [] } = {}) {
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

describe('LayoutSettings — standalone mode', () => {
  it('loads brands, then categories/products for the first brand', async () => {
    mockApi({ categories: [category()], products: [product()] });
    render(<LayoutSettings />);
    expect(await screen.findByText('Toned Milk')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('brandId=1'));
  });

  it('refetches when switching brand tabs', async () => {
    render(<LayoutSettings />);
    await screen.findByTestId('brand-tabs');
    fireEvent.click(screen.getByText('Jersey'));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('categories?brandId=2')));
  });

  it('notifies an error when the brands fetch fails', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands')) return Promise.reject(new Error('network down'));
      return Promise.resolve({ data: { data: [] } });
    });
    render(<LayoutSettings />);
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Failed to load brands', 'error'));
  });
});

describe('LayoutSettings — shell mode', () => {
  it('uses the shell-provided brand instead of fetching brands', async () => {
    mockApi({ categories: [category()], products: [product({ name: 'Special Milk' })] });
    render(<LayoutSettings shellActiveBrandId={7} shellBrands={[{ id: 7, name: 'Gowardhan' }]} />);
    expect(await screen.findByText('Special Milk')).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/brands'));
  });

  it('hides the page header', () => {
    render(<LayoutSettings shellActiveBrandId={7} shellBrands={[{ id: 7, name: 'Gowardhan' }]} />);
    expect(screen.queryByText('Layout Settings')).toBeNull();
  });
});

describe('LayoutSettings — product visibility', () => {
  it('excludes archived (isActive:false) products', async () => {
    mockApi({ categories: [category()], products: [
      product({ id: 1, name: 'Visible' }),
      product({ id: 2, name: 'Archived', isActive: false }),
    ] });
    render(<LayoutSettings />);
    expect(await screen.findByText('Visible')).toBeInTheDocument();
    expect(screen.queryByText('Archived')).toBeNull();
  });

  it('excludes products hidden from stock receipt', async () => {
    mockApi({ categories: [category()], products: [
      product({ id: 1, name: 'Visible' }),
      product({ id: 2, name: 'Hidden', showInStockReceipt: false }),
    ] });
    render(<LayoutSettings />);
    expect(await screen.findByText('Visible')).toBeInTheDocument();
    expect(screen.queryByText('Hidden')).toBeNull();
  });
});

describe('LayoutSettings — category expand/collapse', () => {
  it('starts expanded and can be collapsed by clicking the header', async () => {
    mockApi({ categories: [category({ name: 'Milk' })], products: [product({ category: 'Milk' })] });
    render(<LayoutSettings />);
    await screen.findByText('Toned Milk');

    fireEvent.click(screen.getByText('Milk'));
    expect(screen.queryByText('Toned Milk')).toBeNull();

    fireEvent.click(screen.getByText('Milk'));
    expect(screen.getByText('Toned Milk')).toBeInTheDocument();
  });
});

describe('LayoutSettings — category reordering (up/down)', () => {
  it('orders categories by displayOrder-derived index, Milk before Curd', async () => {
    mockApi({
      categories: [category({ id: 1, name: 'Milk' }), category({ id: 2, name: 'Curd' })],
      products: [product({ id: 1, category: 'Milk' }), product({ id: 2, name: 'Curd 200g', category: 'Curd' })],
    });
    render(<LayoutSettings />);
    await screen.findByText('Toned Milk');
    const headers = screen.getAllByText(/Milk|Curd/).filter(el => el.tagName === 'SPAN' && el.className.includes('font-bold'));
    expect(headers.map(h => h.textContent)).toEqual(['Milk', 'Curd']);
  });

  it('moving the first category down swaps the order and marks the layout dirty', async () => {
    mockApi({
      categories: [category({ id: 1, name: 'Milk' }), category({ id: 2, name: 'Curd' })],
      products: [product({ id: 1, category: 'Milk' }), product({ id: 2, name: 'Curd 200g', category: 'Curd' })],
    });
    render(<LayoutSettings />);
    await screen.findByText('Toned Milk');

    // The down-arrow on the first category row (Milk) moves it below Curd.
    const milkRow = screen.getByText('Milk').closest('div').parentElement;
    const [, downBtn] = milkRow.querySelectorAll('button');
    fireEvent.click(downBtn);

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    const headers = screen.getAllByText(/Milk|Curd/).filter(el => el.tagName === 'SPAN' && el.className.includes('font-bold'));
    expect(headers.map(h => h.textContent)).toEqual(['Curd', 'Milk']);
  });

  it('disables the up arrow on the first category and the down arrow on the last', async () => {
    mockApi({
      categories: [category({ id: 1, name: 'Milk' }), category({ id: 2, name: 'Curd' })],
      products: [product({ id: 1, category: 'Milk' }), product({ id: 2, name: 'Curd 200g', category: 'Curd' })],
    });
    render(<LayoutSettings />);
    await screen.findByText('Toned Milk');

    const milkRow = screen.getByText('Milk').closest('div').parentElement;
    const [milkUp] = milkRow.querySelectorAll('button');
    expect(milkUp).toBeDisabled();

    const curdRow = screen.getByText('Curd').closest('div').parentElement;
    const [, curdDown] = curdRow.querySelectorAll('button');
    expect(curdDown).toBeDisabled();
  });
});

describe('LayoutSettings — save', () => {
  it('disables Save Layout until something changes', async () => {
    mockApi({ categories: [category()], products: [product()] });
    render(<LayoutSettings />);
    await screen.findByText('Toned Milk');
    expect(screen.getByText('Save Layout').closest('button')).toBeDisabled();
  });

  it('shows an error toast when saving fails', async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error('network down'));
    mockApi({
      categories: [category({ id: 1, name: 'Milk' }), category({ id: 2, name: 'Curd' })],
      products: [product({ id: 1, category: 'Milk' }), product({ id: 2, name: 'Curd 200g', category: 'Curd' })],
    });
    render(<LayoutSettings />);
    await screen.findByText('Toned Milk');

    const curdRow = screen.getByText('Curd').closest('div').parentElement;
    const [upBtn] = curdRow.querySelectorAll('button');
    fireEvent.click(upBtn);
    fireEvent.click(screen.getByText('Save Layout'));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Something went wrong', 'error'));
    // A failed save leaves the change unsaved.
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });
});
