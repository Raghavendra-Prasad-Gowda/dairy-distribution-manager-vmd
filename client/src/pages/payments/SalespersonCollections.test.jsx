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
  default: ({ isOpen, onSuccess }) => isOpen ? <button onClick={onSuccess}>Confirm PIN</button> : null,
}));

vi.mock('../../components/BulkTopUpModal', () => ({
  default: ({ open }) => open ? <div data-testid="bulk-topup-modal" /> : null,
}));

vi.mock('../../components/ResetLedgerModal', () => ({
  default: ({ open }) => open ? <div data-testid="reset-ledger-modal" /> : null,
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
  vi.clearAllMocks();
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

  it('paginates history beyond 15 rows', async () => {
    const payments = Array.from({ length: 16 }, (_, i) => payment({ id: i + 1, amount: 100 + i }));
    mockApi({ payments });
    await renderPage();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
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
});
