/**
 * CategorySetup tests.
 *
 * Same shape as RouteSetup: standalone vs shell mode, CRUD flow, plus the
 * search filter this page adds on top.
 */

import React from 'react';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CategorySetup from './CategorySetup';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
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

function category(overrides) {
  return { id: 1, name: 'Milk', ...overrides };
}

function mockApi({ brands = BRANDS, categories = [] } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/brands'))     return Promise.resolve({ data: { data: brands } });
    if (url.includes('/categories')) return Promise.resolve({ data: { data: categories } });
    return Promise.resolve({ data: { data: [] } });
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockApi();
});

describe('CategorySetup — standalone mode', () => {
  it('loads brands, then categories for the first brand', async () => {
    mockApi({ categories: [category({ name: 'Milk' })] });
    render(<CategorySetup />);
    expect(await screen.findByText('Milk')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('brandId=1'));
  });

  it('refetches when switching brand tabs', async () => {
    render(<CategorySetup />);
    await screen.findByTestId('brand-tabs');
    fireEvent.click(screen.getByText('Jersey'));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('brandId=2')));
  });

  it('shows an empty state naming the active brand', async () => {
    render(<CategorySetup />);
    expect(await screen.findByText(/No categories yet for Nandini/)).toBeInTheDocument();
  });
});

describe('CategorySetup — shell mode', () => {
  it('uses the shell-provided brand instead of fetching brands', async () => {
    mockApi({ categories: [category({ name: 'Ghee' })] });
    render(<CategorySetup shellActiveBrandId={7} shellBrands={[{ id: 7, name: 'Gowardhan' }]} />);
    expect(await screen.findByText('Ghee')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('brandId=7'));
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/brands'));
  });

  it('hides the page header', () => {
    render(<CategorySetup shellActiveBrandId={7} shellBrands={[{ id: 7, name: 'Gowardhan' }]} />);
    expect(screen.queryByText('Category Setup')).toBeNull();
  });
});

describe('CategorySetup — search', () => {
  it('filters the list by name', async () => {
    mockApi({ categories: [category({ id: 1, name: 'Milk' }), category({ id: 2, name: 'Curd' })] });
    render(<CategorySetup />);
    await screen.findByText('Milk');
    fireEvent.change(screen.getByPlaceholderText('Search by name…'), { target: { value: 'curd' } });
    expect(screen.getByText('Curd')).toBeInTheDocument();
    expect(screen.queryByText('Milk')).toBeNull();
  });
});

describe('CategorySetup — add category', () => {
  it('posts brandId and trimmed name', async () => {
    render(<CategorySetup />);
    await screen.findByText(/No categories yet/);

    fireEvent.click(screen.getByText('Add Category'));
    fireEvent.change(screen.getByPlaceholderText(/e.g. Milk, Curd/), { target: { value: '  Butter  ' } });
    fireEvent.click(screen.getByText('Add Category', { selector: 'button[type="submit"]' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/categories', { brandId: 1, name: 'Butter' })
    );
    expect(notify).toHaveBeenCalledWith('Category added', 'success');
  });
});

describe('CategorySetup — edit category', () => {
  it('opens prefilled and saves via PUT', async () => {
    mockApi({ categories: [category({ id: 3, name: 'Milk' })] });
    render(<CategorySetup />);
    await screen.findByText('Milk');

    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByDisplayValue('Milk')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('Milk'), { target: { value: 'Dairy Milk' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/categories/3', { name: 'Dairy Milk' }));
    expect(notify).toHaveBeenCalledWith('Category updated', 'success');
  });

  it('shows the server error on a failed save', async () => {
    vi.mocked(api.put).mockRejectedValue({ response: { data: { error: 'Name already exists' } } });
    mockApi({ categories: [category({ id: 3 })] });
    render(<CategorySetup />);
    await screen.findByText('Milk');
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Name already exists', 'error'));
  });
});

describe('CategorySetup — delete category', () => {
  it('warns that products will become uncategorised, then deletes on confirm', async () => {
    mockApi({ categories: [category({ id: 9, name: 'Milk' })] });
    render(<CategorySetup />);
    await screen.findByText('Milk');

    fireEvent.click(screen.getByTitle('Delete'));
    expect(await screen.findByText(/will become uncategorised/)).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/categories/9'));
    expect(notify).toHaveBeenCalledWith('Category deleted', 'success');
  });
});
