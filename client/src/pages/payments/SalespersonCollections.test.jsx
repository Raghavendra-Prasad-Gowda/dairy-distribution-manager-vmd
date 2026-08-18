/**
 * SalespersonCollections tests.
 *
 * Mirrors DairyPayments' test approach on the salesperson side: sidebar
 * selection, balance tones, collection history filter/pagination, the
 * record/edit/delete flows (edit and delete PIN-gated), and the
 * admin-vs-superadmin gating on Bulk Top-up / Reset Ledger. Child components
 * with their own dedicated tests (BulkTopUpModal, ResetLedgerModal) are
 * stubbed so failures point at this page's own logic.
 */

import React from 'react';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SalespersonCollections from './SalespersonCollections';
import api from '../../api/axios';

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
      <button onClick={() => onSaved({ paymentDate: '2026-08-09', entries: [{ salespersonId: 1, amount: 500 }] })}>
        Confirm Top-up
      </button>
      <button onClick={onClose}>Close Top-up</button>
    </div>
  ) : null,
}));

vi.mock('../../components/ResetLedgerModal', () => ({
  default: ({ open, onConfirm, onClose }) => open ? (
    <div data-testid="reset-ledger-modal">
      <button onClick={() => onConfirm([1])}>Confirm Reset</button>
      <button onClick={onClose}>Close Reset</button>
    </div>
  ) : null,
}));

const SALESPEOPLE = [
  { id: 1, name: 'K Pandu', route: 'Route A' },
  { id: 2, name: 'Mahesh',  route: 'Route B' },
];

// Deliberately un-round, distinct from any payment amount used below.
const BALANCE = { salespersonId: 1, openingBalance: 6100, stockGiven: 8200, amountPaid: 1900, closingBalance: 12400 };

function payment(overrides) {
  return {
    id: 1, amount: 1000, paymentDate: '2026-08-09T00:00:00.000Z',
    paymentMode: 'Cash', reference: '',
    ...overrides,
  };
}

function mockApi({ salespeople = SALESPEOPLE, allBalances = [BALANCE], balance = BALANCE, payments = [] } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/salesperson-balance?')) return Promise.resolve({ data: { data: allBalances } });
    if (url.includes('/salesperson-balance/'))  return Promise.resolve({ data: { data: balance } });
    if (url.includes('/salesperson-payments'))  return Promise.resolve({ data: { data: payments } });
    if (url.includes('/salespeople'))           return Promise.resolve({ data: { data: salespeople } });
    return Promise.resolve({ data: { data: [] } });
  });
}

beforeEach(() => {
  vi.resetAllMocks(); // clearAllMocks alone would leak a mockRejectedValue set by an earlier test
  mockRole = 'admin';
  mockApi();
});

async function renderPage() {
  const utils = render(<SalespersonCollections />);
  // The balance card is gated on real data (`{balance && ...}`), so waiting
  // for it guarantees the detail fetch has actually resolved.
  await screen.findByText('Opening');
  return utils;
}

describe('SalespersonCollections — initial load failure', () => {
  it('notifies an error when the initial salespeople/balance fetch fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));
    render(<SalespersonCollections />);
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Failed to load salespeople', 'error'));
  });
});

describe('SalespersonCollections — salesperson selection', () => {
  it('defaults to the first salesperson', async () => {
    await renderPage();
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/salesperson-balance/1'));
  });

  it('switches detail when a different salesperson is selected', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Mahesh'));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/salesperson-balance/2')));
  });

  it('filters the sidebar by name or route', async () => {
    const { container } = await renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Search name or route/i), { target: { value: 'Route B' } });
    // K Pandu is also the default-selected detail panel's own heading, so
    // scope to the sidebar list specifically.
    const sidebar = container.querySelector('.w-64');
    expect(within(sidebar).getByText('Mahesh')).toBeInTheDocument();
    expect(within(sidebar).queryByText('K Pandu')).toBeNull();
  });

  it('filters the sidebar to only Pending / Cleared', async () => {
    mockApi({ allBalances: [
      { ...BALANCE, salespersonId: 1, closingBalance: 500 },
      { ...BALANCE, salespersonId: 2, closingBalance: 0 },
    ] });
    const { container } = await renderPage();
    const sidebar = container.querySelector('.w-64');
    fireEvent.click(screen.getByText('Pending'));
    expect(within(sidebar).getByText('K Pandu')).toBeInTheDocument();
    expect(within(sidebar).queryByText('Mahesh')).toBeNull();

    fireEvent.click(screen.getByText('Cleared'));
    expect(within(sidebar).queryByText('K Pandu')).toBeNull();
    expect(within(sidebar).getByText('Mahesh')).toBeInTheDocument();
  });

  it('the X button clears the sidebar search and restores the full list', async () => {
    const { container } = await renderPage();
    const sidebar = container.querySelector('.w-64');
    const input = screen.getByPlaceholderText(/Search name or route/i);
    fireEvent.change(input, { target: { value: 'Route B' } });
    expect(within(sidebar).queryByText('K Pandu')).toBeNull();

    fireEvent.click(input.parentElement.querySelector('button'));
    expect(input).toHaveValue('');
    expect(within(sidebar).getByText('K Pandu')).toBeInTheDocument();
  });
});

describe('SalespersonCollections — balance card', () => {
  it('marks it Outstanding when owed', async () => {
    mockApi({ balance: { ...BALANCE, closingBalance: 500 } });
    await renderPage();
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
  });

  it('marks it Cleared when settled', async () => {
    mockApi({ balance: { ...BALANCE, closingBalance: 0 } });
    await renderPage();
    // The sidebar's "Cleared" filter button has the same text — the balance
    // badge is the <span>, distinguishing it from that <button>.
    expect(screen.getByText('Cleared', { selector: 'span' })).toBeInTheDocument();
  });

  it('marks it Credit when overpaid', async () => {
    mockApi({ balance: { ...BALANCE, closingBalance: -200 } });
    await renderPage();
    expect(screen.getByText('Credit')).toBeInTheDocument();
  });
});

describe('SalespersonCollections — collection history', () => {
  it('shows "No collections recorded yet" when there are none', async () => {
    await renderPage();
    expect(screen.getByText('No collections recorded yet')).toBeInTheDocument();
  });

  it('lists collections with amount, mode, and reference', async () => {
    mockApi({ payments: [payment({ amount: 4500, paymentMode: 'UPI', reference: 'TXN123' })] });
    await renderPage();
    const row = screen.getByText('₹4,500.00').closest('tr');
    expect(within(row).getByText('UPI')).toBeInTheDocument();
    expect(within(row).getByText('TXN123')).toBeInTheDocument();
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
    // Index 0 is PaymentForm's own "Payment Date" field; the filter panel's
    // From/To are indexes 1 and 2.
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

describe('SalespersonCollections — record collection', () => {
  it('posts a new collection for the selected salesperson and refreshes', async () => {
    await renderPage();
    const amountInput = screen.getByRole('spinbutton');
    fireEvent.change(amountInput, { target: { value: '750' } });
    fireEvent.click(screen.getByRole('button', { name: /Record Payment/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/salesperson-payments', expect.objectContaining({ amount: 750, salespersonId: 1 }))
    );
    expect(notify).toHaveBeenCalledWith('Collection recorded successfully', 'success');
  });

  it('shows the server error, and falls back to a generic message with no server error', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'Stock guard failed' } } });
    await renderPage();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '750' } });
    fireEvent.click(screen.getByRole('button', { name: /Record Payment/i }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Stock guard failed', 'error'));

    // PaymentForm resets its own fields immediately on submit (regardless of
    // outcome), so the amount must be re-entered before retrying.
    vi.mocked(api.post).mockRejectedValue(new Error('network down'));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '750' } });
    fireEvent.click(screen.getByRole('button', { name: /Record Payment/i }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Something went wrong', 'error'));
  });
});

describe('SalespersonCollections — edit flow (PIN gated)', () => {
  it('requires PIN confirmation before showing the edit form', async () => {
    mockApi({ payments: [payment({ amount: 1500 })] });
    await renderPage();
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.queryByText('Edit Collection')).toBeNull();

    fireEvent.click(screen.getByText('Confirm PIN'));
    expect(await screen.findByText('Edit Collection')).toBeInTheDocument();
  });

  it('saves the edited amount via PUT', async () => {
    mockApi({ payments: [payment({ id: 7, amount: 1500 })] });
    await renderPage();
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.click(screen.getByText('Confirm PIN'));
    await screen.findByText('Edit Collection');

    const amountInput = screen.getByDisplayValue('1500');
    fireEvent.change(amountInput, { target: { value: '1800' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/salesperson-payments/7', expect.objectContaining({ amount: 1800 }))
    );
  });

  it('editing the date, mode, and reference fields updates the save payload', async () => {
    mockApi({ payments: [payment({ id: 7, amount: 1500, paymentMode: 'Cash', reference: '' })] });
    await renderPage();
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.click(screen.getByText('Confirm PIN'));
    await screen.findByText('Edit Collection');

    const modal = screen.getByText('Edit Collection').closest('div.bg-white');
    fireEvent.change(within(modal).getByDisplayValue('2026-08-09'), { target: { value: '2026-08-05' } });
    fireEvent.change(within(modal).getByDisplayValue('Cash'), { target: { value: 'UPI' } });
    fireEvent.change(screen.getByPlaceholderText('UPI ref / cheque no.'), { target: { value: 'TXN-99' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/salesperson-payments/7', expect.objectContaining({
      paymentDate: '2026-08-05', paymentMode: 'UPI', reference: 'TXN-99',
    })));
  });

  it('shows the server error, and falls back to a generic message with no server error', async () => {
    mockApi({ payments: [payment({ id: 7, amount: 1500 })] });
    vi.mocked(api.put).mockRejectedValue({ response: { data: { error: 'Locked' } } });
    await renderPage();
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.click(screen.getByText('Confirm PIN'));
    await screen.findByText('Edit Collection');
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Locked', 'error'));

    vi.mocked(api.put).mockRejectedValue(new Error('network down'));
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Something went wrong', 'error'));
  });

  it('the X button and Cancel both close the edit modal without saving', async () => {
    mockApi({ payments: [payment({ id: 7, amount: 1500 })] });
    await renderPage();
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.click(screen.getByText('Confirm PIN'));
    await screen.findByText('Edit Collection');

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Edit Collection')).not.toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.click(screen.getByText('Confirm PIN'));
    await screen.findByText('Edit Collection');
    // The X button is the lone icon-only button next to the "Edit Collection" heading.
    fireEvent.click(screen.getByText('Edit Collection').parentElement.querySelector('button'));
    expect(screen.queryByText('Edit Collection')).not.toBeInTheDocument();
  });

  it('cancelling the PIN prompt never reaches the edit form', async () => {
    mockApi({ payments: [payment({ id: 7 })] });
    await renderPage();
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.click(screen.getByText('Cancel PIN'));
    expect(screen.queryByText('Confirm PIN')).not.toBeInTheDocument();
    expect(screen.queryByText('Edit Collection')).not.toBeInTheDocument();
  });
});

describe('SalespersonCollections — delete flow (PIN gated)', () => {
  it('requires PIN confirmation before showing the delete confirmation', async () => {
    mockApi({ payments: [payment()] });
    await renderPage();
    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.queryByText('Delete collection record?')).toBeNull();

    fireEvent.click(screen.getByText('Confirm PIN'));
    expect(await screen.findByText('Delete collection record?')).toBeInTheDocument();
  });

  it('deletes the payment on confirm', async () => {
    mockApi({ payments: [payment({ id: 9 })] });
    await renderPage();
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByText('Confirm PIN'));
    await screen.findByText('Delete collection record?');

    const modal = screen.getByRole('dialog');
    fireEvent.click(within(modal).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/salesperson-payments/9'));
    expect(notify).toHaveBeenCalledWith('Record deleted', 'success');
  });

  it('the X (close dialog) button also dismisses the delete confirmation', async () => {
    mockApi({ payments: [payment({ id: 9 })] });
    await renderPage();
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByText('Confirm PIN'));
    await screen.findByText('Delete collection record?');

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByText('Delete collection record?')).not.toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('Cancel closes the confirmation without deleting', async () => {
    mockApi({ payments: [payment({ id: 9 })] });
    await renderPage();
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByText('Confirm PIN'));
    await screen.findByText('Delete collection record?');

    const modal = screen.getByRole('dialog');
    fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Delete collection record?')).not.toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('shows an error notification when the delete fails', async () => {
    mockApi({ payments: [payment({ id: 9 })] });
    vi.mocked(api.delete).mockRejectedValue(new Error('network down'));
    await renderPage();
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByText('Confirm PIN'));
    await screen.findByText('Delete collection record?');
    const modal = screen.getByRole('dialog');
    fireEvent.click(within(modal).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Something went wrong', 'error'));
  });
});

describe('SalespersonCollections — admin vs superadmin toolbar', () => {
  it('hides both bulk actions for a non-admin (defensive — route itself already blocks salesmen)', async () => {
    mockRole = 'salesman';
    await renderPage();
    expect(screen.queryByText('Bulk Top-up')).toBeNull();
    expect(screen.queryByText('Reset Ledger')).toBeNull();
  });

  it('shows Bulk Top-up but not Reset Ledger for a plain admin', async () => {
    mockRole = 'admin';
    await renderPage();
    expect(screen.getByText('Bulk Top-up')).toBeInTheDocument();
    expect(screen.queryByText('Reset Ledger')).toBeNull();
  });

  it('shows both Bulk Top-up and Reset Ledger for a superadmin', async () => {
    mockRole = 'superadmin';
    await renderPage();
    expect(screen.getByText('Bulk Top-up')).toBeInTheDocument();
    expect(screen.getByText('Reset Ledger')).toBeInTheDocument();
  });

  it('opens the Bulk Top-up modal and confirming posts the top-up and refreshes', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { count: 1, total: 500 } } });
    await renderPage();
    fireEvent.click(screen.getByText('Bulk Top-up'));
    expect(screen.getByTestId('bulk-topup-modal')).toBeInTheDocument();

    const priorBalanceCalls = vi.mocked(api.get).mock.calls.filter(c => c[0].includes('/salesperson-balance?')).length;
    fireEvent.click(screen.getByText('Confirm Top-up'));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/salesperson-payments/bulk-topup', {
      paymentDate: '2026-08-09', entries: [{ salespersonId: 1, amount: 500 }],
    }));
    await waitFor(() => {
      const newCalls = vi.mocked(api.get).mock.calls.filter(c => c[0].includes('/salesperson-balance?')).length;
      expect(newCalls).toBeGreaterThan(priorBalanceCalls);
    });
  });

  it('opens the Reset Ledger modal and confirming resets and refreshes', async () => {
    mockRole = 'superadmin';
    vi.mocked(api.post).mockResolvedValue({ data: { data: { count: 1 } } });
    await renderPage();
    fireEvent.click(screen.getByText('Reset Ledger'));
    expect(screen.getByTestId('reset-ledger-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Confirm Reset'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/salespeople/reset-ledger', { salespersonIds: [1] }));
  });

  it('closing the Bulk Top-up and Reset Ledger modals dismisses them without side effects', async () => {
    mockRole = 'superadmin';
    await renderPage();
    fireEvent.click(screen.getByText('Bulk Top-up'));
    fireEvent.click(screen.getByText('Close Top-up'));
    expect(screen.queryByTestId('bulk-topup-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Reset Ledger'));
    fireEvent.click(screen.getByText('Close Reset'));
    expect(screen.queryByTestId('reset-ledger-modal')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
