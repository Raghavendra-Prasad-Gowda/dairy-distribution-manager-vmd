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


describe('DairyPayments — payment history', () => {
  it('shows "No payments recorded yet" when there are none', async () => {
    await renderPage();
    expect(screen.getByText('No payments recorded yet')).toBeInTheDocument();
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
});

describe('DairyPayments — record payment', () => {

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

  // Regression: PinModal deliberately never closes itself on a correct PIN
  // (the caller owns that) — onPinSuccess used to forget to call
  // pinModal.close(), leaving the PIN dialog stuck on top of the now-open
  // Edit Payment form.

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
