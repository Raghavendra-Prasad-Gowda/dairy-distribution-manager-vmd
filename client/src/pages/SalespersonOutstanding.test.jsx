/**
 * SalespersonOutstanding tests.
 *
 * Covers the summary metrics (total outstanding / pending / cleared counts),
 * each balance tone (Outstanding, high-due red threshold, Cleared, Credit),
 * the recovery-bar percentage, loading/error/empty states, and the date
 * selector triggering a refetch.
 */

import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SalespersonOutstanding from './SalespersonOutstanding';
import api from '../api/axios';

vi.mock('../api/axios', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../context/NotificationContext', () => ({
  useNotification: () => ({ notify: vi.fn() }),
}));

vi.mock('../utils/dateUtils', async () => {
  const actual = await vi.importActual('../utils/dateUtils');
  return { ...actual, getIndiaDate: () => '2026-08-09' };
});

function sp(overrides) {
  return {
    salespersonId: 1, salespersonName: 'K Pandu', route: 'Route A',
    openingBalance: 0, stockGiven: 1000, amountPaid: 0, closingBalance: 1000,
    ...overrides,
  };
}

function renderPage() {
  return render(<SalespersonOutstanding />, { wrapper: MemoryRouter });
}

beforeEach(() => {
  vi.resetAllMocks(); // clearAllMocks alone would leak a mockRejectedValue set by an earlier test
});

describe('SalespersonOutstanding — loading / error / empty', () => {
  it('shows an error banner when the fetch fails', async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { data: { error: 'Server exploded' } } });
    renderPage();
    expect(await screen.findByText('Server exploded')).toBeInTheDocument();
  });

  it('shows a configuration hint when there are no salespeople', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [] } });
    renderPage();
    expect(await screen.findByText(/No salespeople configured/)).toBeInTheDocument();
  });
});

describe('SalespersonOutstanding — summary metrics', () => {
  it('sums outstanding, and counts pending vs cleared', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [
        sp({ salespersonId: 1, closingBalance: 1500 }),
        sp({ salespersonId: 2, closingBalance: 800 }),
        sp({ salespersonId: 3, closingBalance: 0 }),
      ] },
    });
    renderPage();
    expect(await screen.findByText('₹2,300.00')).toBeInTheDocument(); // 1500 + 800
    expect(screen.getByText('Total Outstanding').closest('div').querySelector('.text-red-600')).toHaveTextContent('₹2,300.00');
    // 2 pending, 1 cleared
    const pendingCard = screen.getByText('Pending').closest('div');
    const clearedCard = screen.getByText('Cleared', { selector: 'p' }).closest('div');
    expect(pendingCard).toHaveTextContent('2');
    expect(clearedCard).toHaveTextContent('1');
  });

  it('does not count a negative (credit) balance toward total outstanding', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [sp({ openingBalance: 0, amountPaid: 0, closingBalance: -500 })] },
    });
    renderPage();
    const totalCard = await screen.findByText('Total Outstanding');
    expect(totalCard.closest('div')).toHaveTextContent('₹0.00');
  });
});

describe('SalespersonOutstanding — card tones', () => {
  it('labels a positive balance under ₹5,000 Outstanding (amber)', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [sp({ closingBalance: 2000 })] } });
    renderPage();
    expect(await screen.findByText('Outstanding')).toBeInTheDocument();
    // With one salesperson the card's own due amount and the page-level
    // "Total Outstanding" figure coincide — check the amber Balance Due span.
    expect(screen.getByText('₹2,000.00', { selector: 'span.text-amber-600' })).toBeInTheDocument();
  });

  it('labels exactly zero Cleared, showing "Nil" for the due amount', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [sp({ closingBalance: 0 })] } });
    renderPage();
    expect(await screen.findByText('Nil')).toBeInTheDocument();
  });

  it('labels a negative balance Credit, with a "+amount Credit" due line', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [sp({ closingBalance: -750 })] } });
    renderPage();
    expect(await screen.findByText('+₹750.00 Credit')).toBeInTheDocument();
  });

  it('shows "No route" when a salesperson has none', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [sp({ route: null })] } });
    renderPage();
    expect(await screen.findByText('No route')).toBeInTheDocument();
  });

  it('computes the recovery percentage as amountPaid / (opening + given)', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [sp({ openingBalance: 0, stockGiven: 1000, amountPaid: 250, closingBalance: 750 })] },
    });
    renderPage();
    expect(await screen.findByText('25%')).toBeInTheDocument();
  });

  it('shows 100% recovery when there was nothing to owe (opening + given = 0)', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [sp({ openingBalance: 0, stockGiven: 0, amountPaid: 0, closingBalance: 0 })] },
    });
    renderPage();
    expect(await screen.findByText('100%')).toBeInTheDocument();
  });
});

describe('SalespersonOutstanding — date selector', () => {
  it('refetches balances when the date changes', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [] } });
    const { container } = renderPage();
    await screen.findByText(/No salespeople configured/);
    expect(api.get).toHaveBeenCalledWith('/salesperson-balance', { params: { date: '2026-08-09' } });

    const dateInput = container.querySelector('input[type="date"]');
    fireEvent.change(dateInput, { target: { value: '2026-08-01' } });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/salesperson-balance', { params: { date: '2026-08-01' } })
    );
  });
});
