/**
 * DairyStatement tests.
 *
 * Covers standalone vs shell mode, the date-range refetch, route filtering
 * (which also toggles the Paid/Closing columns and collapses expanded rows),
 * row expand/collapse (single row + Expand/Collapse All), the balance-tone
 * badge, the totals footer, the Print button's URL, and error handling.
 */

import React from 'react';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DairyStatement from './DairyStatement';
import api from '../../api/axios';

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../../utils/dateUtils', async () => {
  const actual = await vi.importActual('../../utils/dateUtils');
  return { ...actual, getIndiaDate: () => '2026-08-09', getFirstDayOfMonth: () => '2026-08-01' };
});

vi.mock('../../components/BrandTabs', () => ({
  default: ({ brands, onChange }) => (
    <div data-testid="brand-tabs">
      {brands.map(b => <button key={b.id} onClick={() => onChange(b.id)}>{b.name}</button>)}
    </div>
  ),
}));

const BRANDS = [{ id: 1, name: 'Nandini' }];
const ROUTES = [{ id: 100, routeNumber: 'R1' }, { id: 200, routeNumber: 'R2' }];

function row(overrides) {
  return {
    date: '2026-08-05', openingBalance: 500, stockValue: 1000, depositValue: 0,
    amountPaid: 800, closingBalance: 700, receipts: [], payments: [],
    ...overrides,
  };
}

function mockApi({ brands = BRANDS, routes = ROUTES, rows = [] } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/brands'))                    return Promise.resolve({ data: { data: brands } });
    if (url.includes('/routes'))                     return Promise.resolve({ data: { data: routes } });
    if (url.includes('/reports/dairy-statement'))    return Promise.resolve({ data: { data: rows } });
    return Promise.resolve({ data: { data: [] } });
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockApi();
  vi.spyOn(window, 'open').mockImplementation(() => {});
});

async function renderPage() {
  const utils = render(<DairyStatement />);
  await screen.findByText('Account Statement');
  return utils;
}

describe('DairyStatement — standalone vs shell mode', () => {
  it('fetches its own brands and shows the page header when standalone', async () => {
    await renderPage();
    expect(screen.getByText('Dairy Statement')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/brands');
  });

  it('uses the shell-provided brand and hides the header/brand-tabs in shell mode', async () => {
    mockApi({ rows: [row()] });
    render(<DairyStatement shellActiveBrandId={7} shellBrands={[{ id: 7, name: 'Gowardhan' }]} />);
    await screen.findByText('Account Statement');
    expect(screen.queryByText('Dairy Statement')).toBeNull();
    expect(screen.queryByTestId('brand-tabs')).toBeNull();
    expect(api.get).not.toHaveBeenCalledWith('/brands');
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('brandId=7'));
  });
});

describe('DairyStatement — listing', () => {
  it('shows "No data for this period" when empty', async () => {
    await renderPage();
    expect(screen.getByText('No data for this period')).toBeInTheDocument();
  });

  it('lists a row with opening/bill/paid/closing figures', async () => {
    mockApi({ rows: [row({ openingBalance: 500, stockValue: 1000, amountPaid: 800, closingBalance: 700 })] });
    render(<DairyStatement />);
    const tr = (await screen.findByText('05 Aug')).closest('tr');
    expect(within(tr).getByText('₹500.00')).toBeInTheDocument();
    expect(within(tr).getByText('₹1,000.00')).toBeInTheDocument();
    expect(within(tr).getByText('₹800.00')).toBeInTheDocument();
    expect(within(tr).getByText('₹700.00')).toBeInTheDocument();
  });

  it('shows the balance badge and totals footer', async () => {
    mockApi({ rows: [row({ stockValue: 1000, amountPaid: 800, closingBalance: 700 })] });
    render(<DairyStatement />);
    await screen.findByText('05 Aug');
    expect(screen.getByText('Balance: ₹700.00')).toBeInTheDocument();
    const footer = screen.getByText('Total').closest('tr');
    expect(within(footer).getByText('₹1,000.00')).toBeInTheDocument();
    expect(within(footer).getByText('₹800.00')).toBeInTheDocument();
  });

  it('refetches when the date range changes', async () => {
    await renderPage();
    const [fromInput] = document.querySelectorAll('input[type="date"]');
    fireEvent.change(fromInput, { target: { value: '2026-07-01' } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('from=2026-07-01')));
  });

  it('shows the server error message on a failed fetch', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands')) return Promise.resolve({ data: { data: BRANDS } });
      if (url.includes('/routes')) return Promise.resolve({ data: { data: [] } });
      return Promise.reject({ response: { data: { error: 'Brand not found' } } });
    });
    render(<DairyStatement />);
    expect(await screen.findByText('Brand not found')).toBeInTheDocument();
  });
});

describe('DairyStatement — row expand/collapse', () => {
  it('expands a row to show receipts and payments, then collapses it', async () => {
    mockApi({ rows: [row({
      receipts: [{ productName: 'Toned Milk', quantity: 10, unitPrice: 20, amount: 200 }],
      payments: [{ amount: 800, mode: 'UPI' }],
    })] });
    render(<DairyStatement />);
    await screen.findByText('05 Aug');

    fireEvent.click(screen.getByText('05 Aug').closest('tr'));
    expect(screen.getByText('Stock Received')).toBeInTheDocument();
    expect(screen.getByText('Toned Milk')).toBeInTheDocument();
    expect(screen.getByText('₹800.00 via UPI')).toBeInTheDocument();

    fireEvent.click(screen.getByText('05 Aug').closest('tr'));
    expect(screen.queryByText('Stock Received')).toBeNull();
  });

  it('groups receipts by route when routeNumber is present', async () => {
    mockApi({ rows: [row({
      receipts: [
        { productName: 'Toned Milk', quantity: 10, unitPrice: 20, amount: 200, routeNumber: 'R1', routeId: 100 },
        { productName: 'Curd 200g', quantity: 5, unitPrice: 10, amount: 50, routeNumber: 'R2', routeId: 200 },
      ],
    })] });
    render(<DairyStatement />);
    await screen.findByText('05 Aug');
    fireEvent.click(screen.getByText('05 Aug').closest('tr'));
    // "R1"/"R2" also appear as <option>s in the route filter select, so scope
    // to the group-header <span> the receipts detail renders them into.
    const groupHeader = (text) => screen.getAllByText(text).find(el => el.tagName === 'SPAN');
    expect(groupHeader('R1')).toBeInTheDocument();
    expect(groupHeader('R2')).toBeInTheDocument();
  });

  it('Expand All / Collapse All toggles every expandable row', async () => {
    mockApi({ rows: [
      row({ date: '2026-08-05', payments: [{ amount: 800, mode: 'Cash' }] }),
      row({ date: '2026-08-06', payments: [{ amount: 300, mode: 'Cash' }] }),
    ] });
    render(<DairyStatement />);
    await screen.findByText('05 Aug');

    fireEvent.click(screen.getByText('Expand All'));
    expect(screen.getAllByText('Payments Made')).toHaveLength(2);

    fireEvent.click(screen.getByText('Collapse All'));
    expect(screen.queryByText('Payments Made')).toBeNull();
  });
});

describe('DairyStatement — route filter', () => {
  it('filters rows to only dates with receipts for the selected route, and hides Paid/Closing', async () => {
    mockApi({ rows: [
      row({ date: '2026-08-05', receipts: [{ productName: 'Toned Milk', quantity: 1, unitPrice: 20, amount: 20, routeId: 100 }] }),
      row({ date: '2026-08-06', receipts: [{ productName: 'Curd 200g', quantity: 1, unitPrice: 10, amount: 10, routeId: 200 }] }),
    ] });
    render(<DairyStatement />);
    await screen.findByText('05 Aug');
    expect(screen.getByText('06 Aug')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('All Routes'), { target: { value: '100' } });

    expect(screen.getByText('05 Aug')).toBeInTheDocument();
    expect(screen.queryByText('06 Aug')).toBeNull();
    expect(screen.queryByText('Paid')).toBeNull();
    expect(screen.queryByText('Closing')).toBeNull();
  });
});

describe('DairyStatement — print', () => {
  it('opens the print URL with the current filters', async () => {
    mockApi({ rows: [row()] });
    render(<DairyStatement />);
    await screen.findByText('05 Aug');
    fireEvent.click(screen.getByText('Print'));
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('/print/dairy-statement?brandId=1&from=2026-08-01&to=2026-08-09'),
      '_blank'
    );
  });
});
