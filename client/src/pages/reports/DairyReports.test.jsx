/**
 * DairyReports tests.
 *
 * This is a thin shell that fetches brands, then hands `shellActiveBrandId`/
 * `shellBrands` down to whichever section is active. The sections
 * (DairyStatement, StockSummary, DepositReport) have their own dedicated
 * test files, so they're stubbed here to isolate the shell's own logic:
 * brand-tab switching, section-tab switching, and the loading state.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DairyReports from './DairyReports';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}));

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

vi.mock('./DairyStatement', () => ({
  default: ({ shellActiveBrandId }) => <div data-testid="statement-section">Statement for {shellActiveBrandId}</div>,
}));
vi.mock('./StockSummary', () => ({
  default: ({ shellActiveBrandId }) => <div data-testid="stock-section">Stock for {shellActiveBrandId}</div>,
}));
vi.mock('./DepositReport', () => ({
  default: ({ shellActiveBrandId }) => <div data-testid="deposit-section">Deposit for {shellActiveBrandId}</div>,
}));

const BRANDS = [{ id: 1, name: 'Nandini' }, { id: 2, name: 'Jersey' }];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockResolvedValue({ data: { data: BRANDS } });
});

describe('DairyReports — loading', () => {
  it('shows a loader before brands resolve, then the default Statement section', async () => {
    let resolveGet;
    vi.mocked(api.get).mockReturnValue(new Promise(res => { resolveGet = res; }));
    render(<DairyReports />);

    expect(screen.queryByTestId('statement-section')).toBeNull();
    resolveGet({ data: { data: BRANDS } });

    expect(await screen.findByTestId('statement-section')).toHaveTextContent('Statement for 1');
  });

  it('shows a friendly error and no brand tabs when the brand fetch fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));
    render(<DairyReports />);

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Failed to load brands', 'error'));
    expect(screen.queryByText('Nandini')).toBeNull();
    // Section tabs still render even with no brands (mirrors DairySettings' shell behaviour).
    expect(screen.getByText('Stock Summary')).toBeInTheDocument();
  });
});

describe('DairyReports — brand tabs', () => {
  it('defaults to the first brand and switches sections to match on tab click', async () => {
    render(<DairyReports />);
    expect(await screen.findByTestId('statement-section')).toHaveTextContent('Statement for 1');

    fireEvent.click(screen.getByText('Jersey'));
    expect(screen.getByTestId('statement-section')).toHaveTextContent('Statement for 2');
  });
});

describe('DairyReports — section tabs', () => {
  it('switches between Statement, Stock Summary, and Deposit', async () => {
    render(<DairyReports />);
    await screen.findByTestId('statement-section');

    fireEvent.click(screen.getByText('Stock Summary'));
    expect(screen.getByTestId('stock-section')).toBeInTheDocument();
    expect(screen.queryByTestId('statement-section')).toBeNull();

    fireEvent.click(screen.getByText('Deposit'));
    expect(screen.getByTestId('deposit-section')).toBeInTheDocument();
    expect(screen.queryByTestId('stock-section')).toBeNull();

    fireEvent.click(screen.getByText('Statement'));
    expect(screen.getByTestId('statement-section')).toBeInTheDocument();
  });
});
