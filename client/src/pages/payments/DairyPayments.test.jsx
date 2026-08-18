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
  default: ({ isOpen, onSuccess, onClose }) => isOpen ? (
    <>
      <button onClick={onSuccess}>Confirm PIN</button>
      <button onClick={onClose}>Cancel PIN</button>
    </>
  ) : null,
}));

vi.mock('../../components/BulkTopUpModal', () => ({
  default: ({ open, onSaved, onClose }) => open ? (
    <div data-testid="bulk-topup-modal">
      <button onClick={() => onSaved({ paymentDate: '2026-08-09', entries: [{ brandId: 1, amount: 500 }] })}>
        Confirm Top-up
      </button>
      <button onClick={onClose}>Close Top-up</button>
    </div>
  ) : null,
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
  vi.resetAllMocks(); // clearAllMocks alone would leak a mockRejectedValue set by an earlier test
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

describe('DairyPayments — initial load failure', () => {
  it('notifies an error when the brands fetch fails', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands')) return Promise.reject(new Error('network down'));
      return Promise.resolve({ data: { data: [] } });
    });
    render(<DairyPayments />);
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Failed to load brands', 'error'));
  });

  it('degrades to an empty breakdown (no crash) when the route-breakdown fetch fails', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands'))                        return Promise.resolve({ data: { data: BRANDS } });
      if (url.includes('/dairy-balance/route-breakdown'))  return Promise.reject(new Error('network down'));
      if (url.includes('/dairy-balance/'))                 return Promise.resolve({ data: { data: BALANCE } });
      if (url.includes('/dairy-payments'))                 return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: { data: [] } });
    });
    await renderPage();
    expect(screen.queryByText('Route Breakdown')).not.toBeInTheDocument();
  });
});

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

  it('the X button clears the search and restores the full list', async () => {
    mockApi({
      payments: [
        payment({ id: 1, amount: 1000, reference: 'AAA' }),
        payment({ id: 2, amount: 2000, reference: 'BBB' }),
      ],
    });
    await renderPage();
    const input = screen.getByPlaceholderText(/Search by amount/i);
    fireEvent.change(input, { target: { value: 'BBB' } });
    expect(screen.queryByText('₹1,000.00')).toBeNull();

    fireEvent.click(input.parentElement.querySelector('button'));
    expect(input).toHaveValue('');
    expect(screen.getByText('₹1,000.00')).toBeInTheDocument();
    expect(screen.getByText('₹2,000.00')).toBeInTheDocument();
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

  it('paginates history beyond 15 rows, Prev/Next both work', async () => {
    const payments = Array.from({ length: 16 }, (_, i) => payment({ id: i + 1, amount: 100 + i }));
    mockApi({ payments });
    await renderPage();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('Next')).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Prev' })).toBeDisabled();

    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    fireEvent.click(screen.getByText('Prev'));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('filters by "To" date via the filter panel', async () => {
    mockApi({
      payments: [
        payment({ id: 1, amount: 1000, paymentDate: '2026-08-01T00:00:00.000Z' }),
        payment({ id: 2, amount: 2000, paymentDate: '2026-08-09T00:00:00.000Z' }),
      ],
    });
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Filter'));
    // date inputs: [0] PaymentForm's own date, [1] From, [2] To
    const [, , toInput] = container.querySelectorAll('input[type="date"]');
    fireEvent.change(toInput, { target: { value: '2026-08-05' } });
    expect(screen.getByText('₹1,000.00')).toBeInTheDocument();
    expect(screen.queryByText('₹2,000.00')).toBeNull();
  });

  it('filters by reference text, and the X button clears it', async () => {
    mockApi({
      payments: [
        payment({ id: 1, amount: 1000, reference: 'CHQ-100' }),
        payment({ id: 2, amount: 2000, reference: 'UPI-XYZ' }),
      ],
    });
    await renderPage();
    fireEvent.click(screen.getByText('Filter'));
    const refInput = screen.getByPlaceholderText('Search…');
    fireEvent.change(refInput, { target: { value: 'chq' } });
    expect(screen.getByText('₹1,000.00')).toBeInTheDocument();
    expect(screen.queryByText('₹2,000.00')).toBeNull();

    fireEvent.click(refInput.parentElement.querySelector('button'));
    expect(refInput).toHaveValue('');
    expect(screen.getByText('₹2,000.00')).toBeInTheDocument();
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

  it('shows an error toast when recording fails, falling back to a generic message with no server error', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'Server exploded' } } });
    await renderPage();
    const amountInput = screen.getByRole('spinbutton') ?? screen.getByPlaceholderText(/amount/i);
    fireEvent.change(amountInput, { target: { value: '750' } });
    fireEvent.click(screen.getByRole('button', { name: /Record Payment/i }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Server exploded', 'error'));

    // PaymentForm resets its own fields on every submit regardless of
    // outcome, so the amount must be re-entered before retrying.
    vi.mocked(api.post).mockRejectedValue(new Error('network down'));
    fireEvent.change(amountInput, { target: { value: '750' } });
    fireEvent.click(screen.getByRole('button', { name: /Record Payment/i }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Something went wrong', 'error'));
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

  it('editing the mode, date, and reference fields updates the save payload', async () => {
    mockApi({ payments: [payment({ id: 7, amount: 1500, paymentMode: 'Cash', reference: '' })] });
    await renderPage();
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.click(screen.getByText('Confirm PIN'));
    await screen.findByText('Edit Payment');

    const modal = screen.getByText('Edit Payment').closest('div.bg-white');
    fireEvent.click(within(modal).getByRole('button', { name: 'UPI' }));
    fireEvent.change(within(modal).getByDisplayValue('2026-08-09'), { target: { value: '2026-08-05' } });
    fireEvent.change(within(modal).getByPlaceholderText('Txn / cheque no.'), { target: { value: 'TXN-99' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/dairy-payments/7', expect.objectContaining({
      paymentMode: 'UPI', paymentDate: '2026-08-05', reference: 'TXN-99',
    })));
  });

  it('shows the server error, and falls back to a generic message with no server error', async () => {
    mockApi({ payments: [payment({ id: 7, amount: 1500 })] });
    vi.mocked(api.put).mockRejectedValue({ response: { data: { error: 'Locked' } } });
    await renderPage();
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.click(screen.getByText('Confirm PIN'));
    await screen.findByText('Edit Payment');
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Locked', 'error'));

    vi.mocked(api.put).mockRejectedValue(new Error('network down'));
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Something went wrong', 'error'));
  });

  it('the X button and Cancel both close the edit modal without saving', async () => {
    mockApi({ payments: [payment({ id: 7, amount: 1500 })] });
    await renderPage();
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.click(screen.getByText('Confirm PIN'));
    await screen.findByText('Edit Payment');

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Edit Payment')).not.toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.click(screen.getByText('Confirm PIN'));
    await screen.findByText('Edit Payment');
    fireEvent.click(screen.getByText('Edit Payment').closest('div.bg-emerald-800').querySelector('button'));
    expect(screen.queryByText('Edit Payment')).not.toBeInTheDocument();
  });

  it('clicking the backdrop also closes the edit modal without saving', async () => {
    mockApi({ payments: [payment({ id: 7, amount: 1500 })] });
    await renderPage();
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.click(screen.getByText('Confirm PIN'));
    await screen.findByText('Edit Payment');

    // The backdrop is the modal's fixed-inset outer div — its own onClick
    // fires only when the click target is the backdrop itself, not the
    // card, matching real click-outside-to-close behavior.
    fireEvent.click(screen.getByText('Edit Payment').closest('.fixed.inset-0'));
    expect(screen.queryByText('Edit Payment')).not.toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('cancelling the PIN prompt never reaches the edit form', async () => {
    mockApi({ payments: [payment({ id: 7 })] });
    await renderPage();
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.click(screen.getByText('Cancel PIN'));
    expect(screen.queryByText('Confirm PIN')).not.toBeInTheDocument();
    expect(screen.queryByText('Edit Payment')).not.toBeInTheDocument();
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

  it('Cancel closes the confirmation without deleting', async () => {
    mockApi({ payments: [payment({ id: 9 })] });
    await renderPage();
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByText('Confirm PIN'));
    await screen.findByText('Delete Payment?');

    const modal = screen.getByRole('dialog');
    fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Delete Payment?')).not.toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('the X (close dialog) button also dismisses the delete confirmation', async () => {
    mockApi({ payments: [payment({ id: 9 })] });
    await renderPage();
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByText('Confirm PIN'));
    await screen.findByText('Delete Payment?');

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByText('Delete Payment?')).not.toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('shows an error notification when the delete fails', async () => {
    mockApi({ payments: [payment({ id: 9 })] });
    vi.mocked(api.delete).mockRejectedValue(new Error('network down'));
    await renderPage();
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByText('Confirm PIN'));
    await screen.findByText('Delete Payment?');
    const modal = screen.getByRole('dialog');
    fireEvent.click(within(modal).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Something went wrong', 'error'));
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

  it('opens the modal and confirming posts the top-up and refreshes', async () => {
    mockRole = 'superadmin';
    vi.mocked(api.post).mockResolvedValue({ data: { data: { count: 1, total: 500 } } });
    await renderPage();
    fireEvent.click(screen.getByText('Bulk Top-up'));
    expect(screen.getByTestId('bulk-topup-modal')).toBeInTheDocument();

    const priorCalls = vi.mocked(api.get).mock.calls.filter(c => c[0].includes('/dairy-payments?')).length;
    fireEvent.click(screen.getByText('Confirm Top-up'));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/dairy-payments/bulk-topup', {
      paymentDate: '2026-08-09', entries: [{ brandId: 1, amount: 500 }],
    }));
    await waitFor(() => {
      const newCalls = vi.mocked(api.get).mock.calls.filter(c => c[0].includes('/dairy-payments?')).length;
      expect(newCalls).toBeGreaterThan(priorCalls);
    });
  });

  it('closing the modal dismisses it without posting', async () => {
    mockRole = 'superadmin';
    await renderPage();
    fireEvent.click(screen.getByText('Bulk Top-up'));
    fireEvent.click(screen.getByText('Close Top-up'));
    expect(screen.queryByTestId('bulk-topup-modal')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
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
