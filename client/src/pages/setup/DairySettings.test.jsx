/**
 * DairySettings tests.
 *
 * This page is a thin shell around BrandsSetup/RouteSetup/CategorySetup/
 * LayoutSettings (each already tested on their own) — its own job is just
 * brand selection and section switching, and passing the right
 * shellActiveBrandId/shellBrands down. Child sections are stubbed so these
 * tests only exercise DairySettings' own wiring.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DairySettings from './DairySettings';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}));

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

vi.mock('./BrandsSetup', () => ({
  default: ({ shellActiveBrandId }) => <div data-testid="brands-section">Brands section (brand {shellActiveBrandId})</div>,
}));
vi.mock('./RouteSetup', () => ({
  default: ({ shellActiveBrandId, shellBrands }) => (
    <div data-testid="routes-section">Routes section (brand {shellActiveBrandId}, {shellBrands.length} brands)</div>
  ),
}));
vi.mock('./CategorySetup', () => ({
  default: ({ shellActiveBrandId }) => <div data-testid="categories-section">Categories section (brand {shellActiveBrandId})</div>,
}));
vi.mock('./LayoutSettings', () => ({
  default: ({ shellActiveBrandId }) => <div data-testid="layout-section">Layout section (brand {shellActiveBrandId})</div>,
}));

const BRANDS = [{ id: 1, name: 'Nandini' }, { id: 2, name: 'Jersey' }];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockResolvedValue({ data: { data: BRANDS } });
});

describe('DairySettings — brand + section state', () => {
  it('defaults to the Brands section for the first brand', async () => {
    render(<DairySettings />);
    expect(await screen.findByTestId('brands-section')).toHaveTextContent('brand 1');
  });

  it('switches brand tabs and passes the new id down to the active section', async () => {
    render(<DairySettings />);
    await screen.findByTestId('brands-section');
    fireEvent.click(screen.getByText('Jersey'));
    await waitFor(() => expect(screen.getByTestId('brands-section')).toHaveTextContent('brand 2'));
  });

  it('switches sections, keeping the same active brand', async () => {
    render(<DairySettings />);
    await screen.findByTestId('brands-section');
    fireEvent.click(screen.getByText('Jersey'));
    await screen.findByText('brand 2', { exact: false });

    fireEvent.click(screen.getByText('Routes'));
    expect(screen.getByTestId('routes-section')).toHaveTextContent('brand 2');
    expect(screen.getByTestId('routes-section')).toHaveTextContent('2 brands');
    expect(screen.queryByTestId('brands-section')).toBeNull();

    fireEvent.click(screen.getByText('Categories'));
    expect(screen.getByTestId('categories-section')).toHaveTextContent('brand 2');

    fireEvent.click(screen.getByText('Layout'));
    expect(screen.getByTestId('layout-section')).toHaveTextContent('brand 2');
  });

  it('hides the brand tab row when there are no brands, but still shows sections', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [] } });
    render(<DairySettings />);
    // Section content still renders (with a null active brand) — only the
    // brand-tab row itself is conditional on brands.length.
    expect(await screen.findByTestId('brands-section')).toBeInTheDocument();
    expect(screen.getByText('Routes')).toBeInTheDocument();
    expect(screen.queryByText('Nandini')).toBeNull();
  });
});
