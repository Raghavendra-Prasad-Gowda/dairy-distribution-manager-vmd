/**
 * BillPrint tests.
 *
 * Covers reading the bill id from the query string, rendering the frozen
 * Brand → Category → Product line items, the pad's masthead, the total and
 * the amount in words, loading/error states, and auto/manual print.
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import BillPrint from './BillPrint';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}));

const LINES = [
  {
    brandName: 'Nandini',
    categories: [
      { categoryName: 'Milk', products: [{ productName: 'Toned Milk 500ml', unit: 'ltr', quantity: 3325, rate: 52, amount: 172900 }], amount: 172900 },
      { categoryName: 'Curd', products: [{ productName: 'Curd 500ml',       unit: 'ltr', quantity: 2351, rate: 54, amount: 126954 }], amount: 126954 },
    ],
    amount: 299854,
  },
];

const BILL = {
  id: 7,
  billNumber: 799,
  poNumber: '798',
  partyName: 'A.T & S',
  salespersonName: 'Ramesh',
  fromDate: '2026-08-01',
  toDate: '2026-08-31',
  totalAmount: 299854,
  lines: LINES,
};

function mockBill(bill = BILL) {
  vi.mocked(api.get).mockResolvedValue({ data: { data: bill } });
}

function renderWithParams(qs) {
  return render(
    <MemoryRouter initialEntries={[`/print/bill?${qs}`]}>
      <BillPrint />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mockBill();
  vi.spyOn(window, 'print').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BillPrint — fetch', () => {
  it('reads the bill id from the query string', async () => {
    renderWithParams('id=7');
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/bills/7'));
  });

  it('shows an error and fetches nothing when no id is given', async () => {
    renderWithParams('');
    expect(await screen.findByText('No bill specified')).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('surfaces the API error message', async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { data: { error: 'Bill not found' } } });
    renderWithParams('id=99');
    expect(await screen.findByText('Bill not found')).toBeInTheDocument();
  });

  it('shows a loading state before the bill lands', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    renderWithParams('id=7');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });
});

describe('BillPrint — the printed bill', () => {
  it('renders the dairy masthead', async () => {
    renderWithParams('id=7');
    expect(await screen.findByText('VIKAS MILK DAIRY')).toBeInTheDocument();
    expect(screen.getByText('15th Cross, M.G.S.Road, NANJANGUD - 571 301')).toBeInTheDocument();
    expect(screen.getByText('Pro: K.B. NAGARAJU')).toBeInTheDocument();
    expect(screen.getByText('Cash / Credit Bill')).toBeInTheDocument();
  });

  it('renders the bill number, PO number and M/s', async () => {
    renderWithParams('id=7');
    expect(await screen.findByText('799')).toBeInTheDocument();
    expect(screen.getByText('798')).toBeInTheDocument();
    expect(screen.getByText('A.T & S')).toBeInTheDocument();
  });

  it('renders the supply period as two dates', async () => {
    renderWithParams('id=7');
    expect(await screen.findByText('1 Aug 2026 to')).toBeInTheDocument();
    expect(screen.getByText('31 Aug 2026')).toBeInTheDocument();
  });

  it('renders each product under its category and brand', async () => {
    renderWithParams('id=7');
    expect(await screen.findByText('Nandini')).toBeInTheDocument();
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('Curd')).toBeInTheDocument();
    expect(screen.getByText('Toned Milk 500ml')).toBeInTheDocument();
    expect(screen.getByText('Curd 500ml')).toBeInTheDocument();
  });

  it('lists a second brand as its own section, separate from the first', async () => {
    mockBill({
      ...BILL,
      lines: [
        ...LINES,
        { brandName: 'Jersey', categories: [{ categoryName: 'Milk', products: [{ productName: 'HTM 1L', unit: 'ltr', quantity: 10, rate: 45, amount: 450 }], amount: 450 }], amount: 450 },
      ],
      totalAmount: 300304,
    });
    renderWithParams('id=7');
    expect(await screen.findByText('Jersey')).toBeInTheDocument();
    expect(screen.getByText('HTM 1L')).toBeInTheDocument();
    // Two separate "Milk" category headers, one per brand.
    expect(screen.getAllByText('Milk')).toHaveLength(2);
  });

  it('renders rate, quantity and amount for a product', async () => {
    renderWithParams('id=7');
    expect(await screen.findByText('52/ltr')).toBeInTheDocument();
    expect(screen.getByText('3325 ltr')).toBeInTheDocument();
    expect(screen.getByText('1,72,900.00')).toBeInTheDocument();
    expect(screen.getByText('54/ltr')).toBeInTheDocument();
  });

  it('renders the total and the amount in words', async () => {
    renderWithParams('id=7');
    expect(await screen.findByText('2,99,854.00')).toBeInTheDocument();
    expect(
      screen.getByText('Two Lakh Ninety Nine Thousand Eight Hundred Fifty Four Rupees Only')
    ).toBeInTheDocument();
  });

  it('prints a fractional quantity to 2dp', async () => {
    mockBill({
      ...BILL,
      lines: [{
        brandName: 'Nandini',
        categories: [{ categoryName: 'Ghee', products: [{ productName: 'Ghee 500ml', unit: 'kg', quantity: 12.5, rate: 640, amount: 8000 }], amount: 8000 }],
        amount: 8000,
      }],
      totalAmount: 8000,
    });
    renderWithParams('id=7');
    expect(await screen.findByText('12.50 kg')).toBeInTheDocument();
    expect(screen.getByText('640/kg')).toBeInTheDocument();
  });

  it('leaves M/s blank-safe when there is no PO number', async () => {
    mockBill({ ...BILL, poNumber: null });
    renderWithParams('id=7');
    expect(await screen.findByText('A.T & S')).toBeInTheDocument();
    expect(screen.queryByText('798')).not.toBeInTheDocument();
  });
});

describe('BillPrint — printing', () => {
  it('auto-prints once the bill has rendered', async () => {
    vi.useFakeTimers();
    renderWithParams('id=7');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(window.print).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(400));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('prints again when the Print button is clicked', async () => {
    renderWithParams('id=7');
    const btn = await screen.findByRole('button', { name: /print \/ save pdf/i });
    // A real (non-fake-timer) setTimeout from an earlier test's auto-print can
    // still be pending and fire mid-suite — clear the count right before the
    // assertion so this test only measures its own click.
    vi.mocked(window.print).mockClear();
    btn.click();
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
