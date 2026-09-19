/**
 * BillGenerator tests.
 *
 * Covers the preview refreshing with the selection, the six-row preview table,
 * the empty-period guard, issuing a bill (optimistic register update + print
 * window), the issued-bill register, delete-with-confirmation, and API errors.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BillGenerator from './BillGenerator';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

vi.mock('../../utils/dateUtils', async () => {
  const actual = await vi.importActual('../../utils/dateUtils');
  return { ...actual, getIndiaDate: () => '2026-08-31', getFirstDayOfMonth: () => '2026-08-01' };
});

const SALESPEOPLE = [
  { id: 1, name: 'Ramesh', route: '220' },
  { id: 2, name: 'Suresh', route: '221' },
];

const LINES = [
  { label: 'MILK',           unit: 'ltr',  quantity: 3325, rate: 52, amount: 172900 },
  { label: 'CURD',           unit: 'ltr',  quantity: 2351, rate: 54, amount: 126954 },
  { label: 'GHEE',           unit: null, quantity: null, rate: null, amount: 0 },
  { label: 'PANNEER / KOVA', unit: null, quantity: null, rate: null, amount: 0 },
  { label: 'BUTTER',         unit: null, quantity: null, rate: null, amount: 0 },
  { label: 'OTHERS',         unit: null, quantity: null, rate: null, amount: 0 },
];

const PREVIEW = {
  salespersonId: 1,
  salespersonName: 'Ramesh',
  from: '2026-08-01',
  to: '2026-08-31',
  lines: LINES,
  totalAmount: 299854,
};

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

const EMPTY_PREVIEW = { ...PREVIEW, lines: LINES.map((l) => ({ ...l, quantity: null, rate: null, unit: null, amount: 0 })), totalAmount: 0 };

function mockApi({ preview = PREVIEW, bills = [] } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url === '/salespeople')    return Promise.resolve({ data: { data: SALESPEOPLE } });
    if (url === '/bills/preview')  return Promise.resolve({ data: { data: preview } });
    if (url === '/bills')          return Promise.resolve({ data: { data: bills } });
    return Promise.resolve({ data: { data: [] } });
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  notify.mockReset();
  mockApi();
  vi.stubGlobal('open', vi.fn());
});

describe('BillGenerator — preview', () => {
  it('loads salespeople and previews the default period', async () => {
    render(<BillGenerator />);
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/bills/preview', {
        params: { salespersonId: '1', from: '2026-08-01', to: '2026-08-31' },
      })
    );
  });

  it('renders all six preview rows with derived rates', async () => {
    render(<BillGenerator />);
    expect(await screen.findByText('MILK')).toBeInTheDocument();
    for (const label of ['CURD', 'GHEE', 'PANNEER / KOVA', 'BUTTER', 'OTHERS']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('52/ltr')).toBeInTheDocument();
    expect(screen.getByText('3325')).toBeInTheDocument();
    expect(screen.getByText('₹2,99,854.00')).toBeInTheDocument();
  });

  it('re-previews when the salesperson changes', async () => {
    render(<BillGenerator />);
    await screen.findByText('MILK');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/bills/preview', {
        params: { salespersonId: '2', from: '2026-08-01', to: '2026-08-31' },
      })
    );
  });

  it('blocks generating and explains when nothing was dispatched', async () => {
    mockApi({ preview: EMPTY_PREVIEW });
    render(<BillGenerator />);

    expect(await screen.findByText(/nothing to bill/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate bill/i })).toBeDisabled();
  });

  it('notifies when the preview fails', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/salespeople') return Promise.resolve({ data: { data: SALESPEOPLE } });
      if (url === '/bills')       return Promise.resolve({ data: { data: [] } });
      return Promise.reject({ response: { data: { error: 'Salesperson not found' } } });
    });

    render(<BillGenerator />);
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Salesperson not found', 'error'));
  });
});

describe('BillGenerator — issuing', () => {
  it('posts the period and opens the printable bill', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: BILL } });
    render(<BillGenerator />);
    await screen.findByText('MILK');

    fireEvent.change(screen.getByPlaceholderText('Ramesh'), { target: { value: 'A.T & S' } });
    fireEvent.change(screen.getByPlaceholderText('Optional'), { target: { value: '798' } });
    fireEvent.click(screen.getByRole('button', { name: /generate bill/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/bills', {
        salespersonId: 1, from: '2026-08-01', to: '2026-08-31', partyName: 'A.T & S', poNumber: '798',
      })
    );
    await waitFor(() => expect(window.open).toHaveBeenCalledWith('/print/bill?id=7', '_blank'));
    expect(notify).toHaveBeenCalledWith('Bill #799 generated', 'success');
  });

  it('omits M/s and PO No when left blank', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: BILL } });
    render(<BillGenerator />);
    await screen.findByText('MILK');

    fireEvent.click(screen.getByRole('button', { name: /generate bill/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/bills', {
        salespersonId: 1, from: '2026-08-01', to: '2026-08-31',
      })
    );
  });

  it('adds the new bill to the register without re-fetching', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: BILL } });
    render(<BillGenerator />);
    await screen.findByText('MILK');

    const getsBefore = vi.mocked(api.get).mock.calls.filter(([url]) => url === '/bills').length;
    fireEvent.click(screen.getByRole('button', { name: /generate bill/i }));

    expect(await screen.findByText('#799')).toBeInTheDocument();
    expect(vi.mocked(api.get).mock.calls.filter(([url]) => url === '/bills').length).toBe(getsBefore);
  });

  it('notifies when issuing fails', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'No stock was dispatched in this period' } } });
    render(<BillGenerator />);
    await screen.findByText('MILK');

    fireEvent.click(screen.getByRole('button', { name: /generate bill/i }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('No stock was dispatched in this period', 'error')
    );
  });
});

describe('BillGenerator — register', () => {
  it('shows an empty state when no bills have been issued', async () => {
    render(<BillGenerator />);
    expect(await screen.findByText('No bills generated yet')).toBeInTheDocument();
  });

  it('lists issued bills with their period and total', async () => {
    mockApi({ bills: [BILL] });
    render(<BillGenerator />);

    expect(await screen.findByText('#799')).toBeInTheDocument();
    expect(screen.getByText('A.T & S')).toBeInTheDocument();
    expect(screen.getByText('1 Aug 2026 – 31 Aug 2026')).toBeInTheDocument();
  });

  it('reprints an issued bill', async () => {
    mockApi({ bills: [BILL] });
    render(<BillGenerator />);
    await screen.findByText('#799');

    fireEvent.click(screen.getByRole('button', { name: /print bill #799/i }));

    expect(window.open).toHaveBeenCalledWith('/print/bill?id=7', '_blank');
  });

  it('deletes a bill after confirmation', async () => {
    mockApi({ bills: [BILL] });
    vi.mocked(api.delete).mockResolvedValue({ data: { data: {} } });
    render(<BillGenerator />);
    await screen.findByText('#799');

    fireEvent.click(screen.getByRole('button', { name: /delete bill #799/i }));

    const dialog = await screen.findByText(/Delete bill #799/i);
    expect(dialog).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/bills/7'));
    await waitFor(() => expect(screen.queryByText('#799')).not.toBeInTheDocument());
    expect(notify).toHaveBeenCalledWith('Bill #799 deleted', 'success');
  });

  it('notifies when deleting fails', async () => {
    mockApi({ bills: [BILL] });
    vi.mocked(api.delete).mockRejectedValue({ response: { data: { error: 'Bill not found' } } });
    render(<BillGenerator />);
    await screen.findByText('#799');

    fireEvent.click(screen.getByRole('button', { name: /delete bill #799/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Bill not found', 'error'));
  });
});
