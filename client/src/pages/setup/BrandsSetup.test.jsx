/**
 * BrandsSetup — deposit settings regression test.
 *
 * The brand-level deposit toggle + rate used to live here, was removed
 * entirely in a refactor (commit 89eb717, "Remove deposit settings and brand
 * reorder from brand setup"), and there was no test to catch it — the whole
 * feature silently had no UI for two months before anyone noticed. This test
 * exists specifically so that regression can't happen again unnoticed: it
 * fails if the deposit toggle/rate ever disappears from this page.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BrandsSetup from './BrandsSetup';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

let mockRole = 'superadmin';
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: mockRole } }),
}));

const BRANDS = [
  { id: 1, name: 'Nandini', isActive: true, depositEnabled: true, depositPerLitre: 2.5 },
  { id: 2, name: 'Jersey',  isActive: true, depositEnabled: false, depositPerLitre: 0 },
];

function mockBrandsList(brands = BRANDS) {
  vi.mocked(api.get).mockResolvedValue({ data: { data: brands } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRole = 'superadmin';
});

async function renderPage() {
  render(<BrandsSetup />);
  await waitFor(() => expect(screen.getByText('Nandini')).toBeInTheDocument());
}

describe('BrandsSetup — deposit settings', () => {
  it('shows a deposit-enabled brand with its rate as a badge in the list', async () => {
    mockBrandsList();
    await renderPage();
    expect(screen.getByText('₹2.50/L')).toBeInTheDocument();
  });

  it('does not show a deposit badge for a brand with deposit disabled', async () => {
    mockBrandsList();
    await renderPage();
    // Only Nandini's rate should render — nothing for Jersey.
    expect(screen.queryAllByText(/₹.*\/L/)).toHaveLength(1);
  });

  it('offers a "Deposit settings" control per brand for an admin', async () => {
    mockRole = 'admin';
    mockBrandsList();
    await renderPage();
    expect(screen.getAllByTitle('Deposit settings').length).toBe(BRANDS.length);
  });

  it('offers a "Deposit settings" control per brand for a superadmin too', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    await renderPage();
    expect(screen.getAllByTitle('Deposit settings').length).toBe(BRANDS.length);
  });

  it('opens a modal with an enabled toggle and a rate input, pre-filled from the brand', async () => {
    mockBrandsList();
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Deposit settings')[0]);

    expect(screen.getByText('Deposit Settings')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByPlaceholderText('0.00')).toHaveValue(2.5);
  });

  it('disables the rate input when the toggle is switched off', async () => {
    mockBrandsList();
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Deposit settings')[0]);
    fireEvent.click(screen.getByRole('switch'));

    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByPlaceholderText('0.00')).toBeDisabled();
  });

  it('saves depositEnabled and depositPerLitre via PUT /brands/:id', async () => {
    mockBrandsList();
    vi.mocked(api.put).mockResolvedValue({
      data: { data: { id: 2, name: 'Jersey', isActive: true, depositEnabled: true, depositPerLitre: 1.75 } },
    });
    await renderPage();

    // Jersey (index 1) currently has deposit disabled.
    fireEvent.click(screen.getAllByTitle('Deposit settings')[1]);
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1.75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/brands/2', {
      depositEnabled: true,
      depositPerLitre: 1.75,
    }));
  });

  it('refuses to save when enabling with no rate entered', async () => {
    mockBrandsList();
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Deposit settings')[1]); // Jersey — disabled
    fireEvent.click(screen.getByRole('switch')); // turn on, rate stays blank
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.put).not.toHaveBeenCalled());
  });
});
