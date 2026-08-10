/**
 * RouteSetup tests.
 *
 * Covers both of this component's modes — standalone (own header, fetches
 * brands itself) and embedded "shell" mode (brand/active id come from props,
 * used inside Layout Settings) — plus the add/edit/delete CRUD flow.
 */

import React from 'react';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RouteSetup from './RouteSetup';
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

const BRANDS = [{ id: 1, name: 'Nandini' }, { id: 2, name: 'Jersey' }];

function route(overrides) {
  return { id: 1, routeNumber: '220', ...overrides };
}

function mockApi({ brands = BRANDS, routes = [] } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/brands')) return Promise.resolve({ data: { data: brands } });
    if (url.includes('/routes')) return Promise.resolve({ data: { data: routes } });
    return Promise.resolve({ data: { data: [] } });
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockApi();
});

describe('RouteSetup — standalone mode', () => {
  it('loads brands, then routes for the first brand', async () => {
    mockApi({ routes: [route({ routeNumber: '220' })] });
    render(<RouteSetup />);
    expect(await screen.findByText('Route 220')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('brandId=1'));
  });

  it('refetches when switching brand tabs', async () => {
    render(<RouteSetup />);
    await screen.findByTestId('brand-tabs');
    fireEvent.click(screen.getByText('Jersey'));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('brandId=2')));
  });

  it('shows an empty state naming the active brand', async () => {
    render(<RouteSetup />);
    expect(await screen.findByText(/No routes configured for Nandini/)).toBeInTheDocument();
  });
});

describe('RouteSetup — shell mode', () => {
  it('uses the shell-provided brand instead of fetching brands', async () => {
    mockApi({ routes: [route({ routeNumber: '999' })] });
    render(<RouteSetup shellActiveBrandId={7} shellBrands={[{ id: 7, name: 'Gowardhan' }]} />);
    expect(await screen.findByText('Route 999')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('brandId=7'));
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/brands'));
  });

  it('hides the page header and moves Add Route into the content area', () => {
    render(<RouteSetup shellActiveBrandId={7} shellBrands={[{ id: 7, name: 'Gowardhan' }]} />);
    expect(screen.queryByText('Route Setup')).toBeNull();
    expect(screen.getByText('Add Route')).toBeInTheDocument();
  });
});

describe('RouteSetup — add route', () => {
  it('posts brandId, trimmed routeNumber, and displayOrder = current count', async () => {
    mockApi({ routes: [route({ id: 1, routeNumber: '100' })] });
    render(<RouteSetup />);
    await screen.findByText('Route 100');

    fireEvent.click(screen.getByText('Add Route'));
    fireEvent.change(screen.getByPlaceholderText(/e.g. 220/), { target: { value: '  512  ' } });
    fireEvent.click(screen.getByText('Add Route', { selector: 'button[type="submit"]' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/routes', { brandId: 1, routeNumber: '512', displayOrder: 1 })
    );
    expect(notify).toHaveBeenCalledWith('Route added', 'success');
  });

  it('disables Add Route while the number field is empty', async () => {
    render(<RouteSetup />);
    await screen.findByText(/No routes configured/);
    fireEvent.click(screen.getAllByText('Add Route')[0]);
    expect(screen.getByText('Add Route', { selector: 'button[type="submit"]' })).toBeDisabled();
  });
});

describe('RouteSetup — edit route', () => {
  it('opens prefilled with the current route number and saves via PUT', async () => {
    mockApi({ routes: [route({ id: 3, routeNumber: '220' })] });
    render(<RouteSetup />);
    await screen.findByText('Route 220');

    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByDisplayValue('220')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('220'), { target: { value: '221' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/routes/3', { routeNumber: '221' }));
    expect(notify).toHaveBeenCalledWith('Route updated', 'success');
  });

  it('shows the server error on a failed save', async () => {
    vi.mocked(api.put).mockRejectedValue({ response: { data: { error: 'Duplicate route number' } } });
    mockApi({ routes: [route({ id: 3 })] });
    render(<RouteSetup />);
    await screen.findByText('Route 220');
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Duplicate route number', 'error'));
  });
});

describe('RouteSetup — delete route', () => {
  it('asks for confirmation, then deletes on confirm', async () => {
    mockApi({ routes: [route({ id: 9, routeNumber: '220' })] });
    render(<RouteSetup />);
    await screen.findByText('Route 220');

    fireEvent.click(screen.getByTitle('Delete'));
    expect(await screen.findByText('Delete Route')).toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/routes/9'));
    expect(notify).toHaveBeenCalledWith('Route deleted', 'success');
  });
});
