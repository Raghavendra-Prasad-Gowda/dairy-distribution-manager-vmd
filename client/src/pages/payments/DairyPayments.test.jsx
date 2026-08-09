/**
 * DairyPayments tests.
 *
 * Covers the page's own logic — brand selection (incl. URL preselect),
 * payment history search/filter/pagination, the record/edit/delete flows
 * (edit and delete both gated behind a PIN), the superadmin-only bulk
 * top-up button, and the "Pay Today's Bill" quick-fill. Child components
 * with their own dedicated tests (BulkTopUpModal, PinModal's real PIN flow)
 * are stubbed here so failures point at DairyPayments' own logic.
 */

import React from 'react';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DairyPayments from './DairyPayments';
import api from '../../api/axios';

let searchParamsValue = '';

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(searchParamsValue)],
}));

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

let mockRole = 'admin';
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: mockRole } }),
}));

vi.mock('../../utils/dateUtils', async () => {
  const actual = await vi.importActual('../../utils/dateUtils');
  return { ...actual, getIndiaDate: () => '2026-08-09' };
});

vi.mock('../../components/PinModal', () => ({
  default: ({ isOpen, onSuccess }) => isOpen ? <button onClick={onSuccess}>Confirm PIN</button> : null,
}));

vi.mock('../../components/BulkTopUpModal', () => ({
  default: ({ open }) => open ? <div data-testid="bulk-topup-modal" /> : null,
}));

const BRANDS = [{ id: 1, name: 'Nandini' }, { id: 2, name: 'Jersey' }];
// Deliberately un-round numbers, distinct from any payment amount used
// below, so a balance-card figure can never accidentally match a payment
// row's amount in a text query.
const BALANCE = { openingBalance: 6100, stockValue: 8200, depositValue: 0, amountPaid: 1900, closingBalance: 12400 };

function payment(overrides) {
  return {
    id: 1, amount: 1000, paymentDate: '2026-08-09T00:00:00.000Z',
    paymentMode: 'Cash', reference: '',
    ...overrides,
  };
}

function mockApi({ brands = BRANDS, balance = BALANCE, payments = [], breakdown = [] } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/brands'))               return Promise.resolve({ data: { data: brands } });
    if (url.includes('/dairy-balance/route-breakdown')) return Promise.resolve({ data: { data: breakdown } });
    if (url.includes('/dairy-balance/'))        return Promise.resolve({ data: { data: balance } });
    if (url.includes('/dairy-payments'))        return Promise.resolve({ data: { data: payments } });
    return Promise.resolve({ data: { data: [] } });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParamsValue = '';
  mockRole = 'admin';
  mockApi();
});

async function renderPage() {
  const utils = render(<DairyPayments />);
  // `loading` defaults to false, so the whole layout (including the payment
  // form) renders on the very first paint, before any fetch has even been
  // issued — "Record Payment" is on screen immediately regardless of data.
  // The balance card is the one thing gated on real data (`{balance && ...}`),
  // so waiting for it guarantees fetchAll's response has actually landed.
  await screen.findByText('Opening');
  return utils;
}

describe('DairyPayments — brand selection', () => {
  it('defaults to the first brand', async () => {
    await renderPage();
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/dairy-balance/1'));
  });

  it('preselects the brand from the ?brandId= URL param', async () => {
    searchParamsValue = 'brandId=2';
    await renderPage();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/dairy-balance/2')));
  });

  it('falls back to the first brand when the URL brandId does not match any brand', async () => {
    searchParamsValue = 'brandId=999';
    await renderPage();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/dairy-balance/1')));
  });
});

describe('DairyPayments — balance card', () => {
  it('shows the closing balance and marks it Outstanding when owed', async () => {
    mockApi({ balance: { ...BALANCE, closingBalance: 2500 } });
    await renderPage();
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
    expect(screen.getByText('₹2,500.00')).toBeInTheDocument();
  });

  it('marks it Cleared when the balance is exactly zero', async () => {
    mockApi({ balance: { ...BALANCE, closingBalance: 0 } });
    await renderPage();
    expect(screen.getByText('Cleared')).toBeInTheDocument();
  });

  it('marks it Credit when the balance is negative (overpaid)', async () => {
    mockApi({ balance: { ...BALANCE, closingBalance: -300 } });
    await renderPage();
    expect(screen.getByText('Credit')).toBeInTheDocument();
  });
});

describe('DairyPayments — payment history', () => {
  it('shows "No payments recorded yet" when there are none', async () => {
    await renderPage();
    expect(screen.getByText('No payments recorded yet')).toBeInTheDocument();
  });

  it('lists recorded payments with amount, mode, and reference', async () => {
    mockApi({ payments: [payment({ amount: 4500, paymentMode: 'UPI', reference: 'TXN123' })] });
    await renderPage();
    const row = screen.getByText('₹4,500.00').closest('tr');
    // "UPI" also labels a mode-picker button in the Record Payment form
    // above, so scope this to the history row specifically.
    expect(within(row).getByText('UPI')).toBeInTheDocument();
    expect(within(row).getByText('TXN123')).toBeInTheDocument();
  });

  it('searches across amount, mode, and reference', async () => {
    mockApi({
      payments: [
        payment({ id: 1, amount: 1000, paymentMode: 'Cash', reference: 'AAA' }),
        payment({ id: 2, amount: 2000, paymentMode: 'UPI',  reference: 'BBB' }),
      ],
    });
    await renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Search by amount/i), { target: { value: 'BBB' } });
    expect(screen.getByText('₹2,000.00')).toBeInTheDocument();
    expect(screen.queryByText('₹1,000.00')).toBeNull();
  });

  it('shows "no payments match" when a search excludes everything', async () => {
    mockApi({ payments: [payment()] });
    await renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Search by amount/i), { target: { value: 'nonexistent' } });
    expect(screen.getByText('No payments match the current filters')).toBeInTheDocument();
  });

  it('filters by date range via the filter panel', async () => {
    mockApi({
      payments: [
        payment({ id: 1, amount: 1000, paymentDate: '2026-08-01T00:00:00.000Z' }),
        payment({ id: 2, amount: 2000, paymentDate: '2026-08-09T00:00:00.000Z' }),
      ],
    });
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Filter'));
    // The From/To labels aren't associated to their inputs via htmlFor, so
    // query date inputs by position instead. Index 0 is PaymentForm's own
    // "Payment Date" field (it renders above the filter panel); the filter
    // panel's From/To are indexes 1 and 2.
    const [, fromInput] = container.querySelectorAll('input[type="date"]');
    fireEvent.change(fromInput, { target: { value: '2026-08-05' } });
    expect(screen.queryByText('₹1,000.00')).toBeNull();
    expect(screen.getByText('₹2,000.00')).toBeInTheDocument();
  });

  it('filters by mode via the filter panel', async () => {
    mockApi({
      payments: [
        payment({ id: 1, amount: 1000, paymentMode: 'Cash' }),
        payment({ id: 2, amount: 2000, paymentMode: 'UPI' }),
      ],
    });
    await renderPage();
    fireEvent.click(screen.getByText('Filter'));
    fireEvent.change(screen.getByDisplayValue('All'), { target: { value: 'UPI' } });
    expect(screen.queryByText('₹1,000.00')).toBeNull();
    expect(screen.getByText('₹2,000.00')).toBeInTheDocument();
  });

  it('"Clear all filters" resets every active filter', async () => {
    mockApi({
      payments: [
        payment({ id: 1, amount: 1000, paymentMode: 'Cash' }),
        payment({ id: 2, amount: 2000, paymentMode: 'UPI' }),
      ],
    });
    await renderPage();
    fireEvent.click(screen.getByText('Filter'));
    fireEvent.change(screen.getByDisplayValue('All'), { target: { value: 'UPI' } });
    expect(screen.queryByText('₹1,000.00')).toBeNull();

    fireEvent.click(screen.getByText('Clear all filters'));
    expect(screen.getByText('₹1,000.00')).toBeInTheDocument();
    expect(screen.getByText('₹2,000.00')).toBeInTheDocument();
  });

  it('paginates history beyond 15 rows', async () => {
    const payments = Array.from({ length: 16 }, (_, i) => payment({ id: i + 1, amount: 100 + i }));
    mockApi({ payments });
    await renderPage();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('Next')).not.toBeDisabled();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });
});

describe('DairyPayments — record payment', () => {
  it('posts a new payment for the active brand and refreshes', async () => {
    await renderPage();
    fireEvent.change(screen.getByPlaceholderText(/txn/i), { target: { value: '' } });
    const amountInput = screen.getByRole('spinbutton') ?? screen.getByPlaceholderText(/amount/i);
    fireEvent.change(amountInput, { target: { value: '750' } });
    fireEvent.click(screen.getByRole('button', { name: /Record Payment/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/dairy-payments', expect.objectContaining({ amount: 750, brandId: 1 }))
    );
    expect(notify).toHaveBeenCalledWith('Payment recorded successfully', 'success');
  });

  it('shows an error toast when recording fails', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'Server exploded' } } });
    await renderPage();
    const amountInput = screen.getByRole('spinbutton') ?? screen.getByPlaceholderText(/amount/i);
    fireEvent.change(amountInput, { target: { value: '750' } });
    fireEvent.click(screen.getByRole('button', { name: /Record Payment/i }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Server exploded', 'error'));
  });
});

describe('DairyPayments — edit flow (PIN gated)', () => {
  it('requires PIN confirmation before showing the edit form', async () => {
    mockApi({ payments: [payment({ amount: 1500 })] });
    await renderPage();
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.queryByText('Edit Payment')).toBeNull();

    fireEvent.click(screen.getByText('Confirm PIN'));
    expect(await screen.findByText('Edit Payment')).toBeInTheDocument();
  });

  it('saves the edited amount via PUT', async () => {
    mockApi({ payments: [payment({ id: 7, amount: 1500 })] });
    await renderPage();
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.click(screen.getByText('Confirm PIN'));
    await screen.findByText('Edit Payment');

    const amountInputs = screen.getAllByDisplayValue('1500');
    fireEvent.change(amountInputs[0], { target: { value: '1800' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/dairy-payments/7', expect.objectContaining({ amount: 1800 }))
    );
  });
});

describe('DairyPayments — delete flow (PIN gated)', () => {
  it('requires PIN confirmation before showing the delete confirmation', async () => {
    mockApi({ payments: [payment()] });
    await renderPage();
    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.queryByText('Delete Payment?')).toBeNull();

    fireEvent.click(screen.getByText('Confirm PIN'));
    expect(await screen.findByText('Delete Payment?')).toBeInTheDocument();
  });

  it('deletes the payment on confirm', async () => {
    mockApi({ payments: [payment({ id: 9 })] });
    await renderPage();
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByText('Confirm PIN'));
    await screen.findByText('Delete Payment?');

    // The row's own delete icon button also has accessible name "Delete"
    // (from its title attribute), so scope to the confirm modal (role="dialog").
    const modal = screen.getByRole('dialog');
    fireEvent.click(within(modal).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/dairy-payments/9'));
    expect(notify).toHaveBeenCalledWith('Payment deleted', 'success');
  });
});

describe('DairyPayments — superadmin-only bulk top-up', () => {
  it('hides the Bulk Top-up button for a plain admin', async () => {
    mockRole = 'admin';
    await renderPage();
    expect(screen.queryByText('Bulk Top-up')).toBeNull();
  });

  it('shows the Bulk Top-up button for a superadmin', async () => {
    mockRole = 'superadmin';
    await renderPage();
    expect(screen.getByText('Bulk Top-up')).toBeInTheDocument();
  });
});

describe('DairyPayments — route breakdown & Pay Today\'s Bill', () => {
  it('shows the route breakdown and a working "Pay Today\'s Bill" quick-fill', async () => {
    mockApi({
      balance: { ...BALANCE, closingBalance: 500 },
      breakdown: [{ routeId: 1, routeNumber: 'R1', totalAmount: 300 }],
    });
    await renderPage();
    expect(await screen.findByText('R1')).toBeInTheDocument();

    // grandTotal (300) < closingBalance (500) → quick-fill uses the smaller figure.
    const payButton = screen.getByText(/Pay Today's Bill/);
    fireEvent.click(payButton);

    const amountInputs = screen.getAllByDisplayValue('300.00');
    expect(amountInputs.length).toBeGreaterThan(0);
  });
});
