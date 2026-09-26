/**
 * BillPrint tests.
 *
 * Covers reading the bill id from the query string, rendering the fetched
 * bill (via BillSheet — its own tests cover the pad's content in depth),
 * loading/error states, manual print, and how this page wires up the
 * WhatsApp share flow: pre-rendering the PDF in the background as soon as
 * the bill loads (rather than at tap time — see utils/billPdf.js for why),
 * and handing that off to shareBillPdf. shareBillPdf's own branches (native
 * share vs. download+wa.me fallback, error handling) are covered by
 * utils/billPdf.test.js, not repeated here.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BillPrint from './BillPrint';
import api from '../../api/axios';
import { renderBillPdf, shareBillPdf } from '../../utils/billPdf';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}));

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

vi.mock('../../utils/billPdf', () => ({
  renderBillPdf: vi.fn(() => Promise.resolve(new Blob(['fake-pdf'], { type: 'application/pdf' }))),
  shareBillPdf: vi.fn(() => Promise.resolve()),
}));

const LINES = [
  {
    brandName: 'Nandini',
    products: [
      { productName: 'Toned Milk 500ml', unit: 'ltr', quantity: 3325, rate: 52, amount: 172900 },
      { productName: 'Curd 500ml',       unit: 'ltr', quantity: 2351, rate: 54, amount: 126954 },
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
  vi.mocked(renderBillPdf).mockReturnValue(Promise.resolve(new Blob(['fake-pdf'], { type: 'application/pdf' })));
  vi.mocked(shareBillPdf).mockResolvedValue(undefined);
  vi.spyOn(window, 'print').mockImplementation(() => {});
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

describe('BillPrint — renders the fetched bill', () => {
  it('renders the bill sheet once the bill loads', async () => {
    renderWithParams('id=7');
    expect(await screen.findByText('VIKAS MILK DAIRY')).toBeInTheDocument();
    expect(screen.getByText('799')).toBeInTheDocument();
    expect(screen.getByText('Nandini')).toBeInTheDocument();
    expect(screen.getByText('Toned Milk 500ml')).toBeInTheDocument();
  });
});

describe('BillPrint — printing', () => {
  it('does not auto-print on load — sharing is the primary action here, not the OS print dialog', async () => {
    renderWithParams('id=7');
    await screen.findByText('VIKAS MILK DAIRY');
    expect(window.print).not.toHaveBeenCalled();
  });

  it('prints when the Print / Save PDF button is clicked', async () => {
    renderWithParams('id=7');
    const btn = await screen.findByRole('button', { name: /print \/ save pdf/i });
    btn.click();
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('disables both action buttons until the bill has loaded', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    renderWithParams('id=7');
    expect(screen.getByRole('button', { name: /share on whatsapp/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /print \/ save pdf/i })).toBeDisabled();
  });
});

describe('BillPrint — sharing on WhatsApp', () => {
  it('pre-renders the share PDF in the background as soon as the bill loads, before any click', async () => {
    renderWithParams('id=7');
    await screen.findByText('VIKAS MILK DAIRY');
    await waitFor(() => expect(renderBillPdf).toHaveBeenCalledTimes(1));
  });

  it('reuses the pre-rendered PDF instead of re-rendering on click — the render must not start at tap time, or a slow one can outlast the tap on browsers that tie navigator.share() to it', async () => {
    renderWithParams('id=7');
    await waitFor(() => expect(renderBillPdf).toHaveBeenCalledTimes(1));

    const btn = await screen.findByRole('button', { name: /share on whatsapp/i });
    btn.click();

    await waitFor(() => expect(shareBillPdf).toHaveBeenCalled());
    // Only the background pre-render called renderBillPdf — the click
    // handed shareBillPdf that same in-flight/resolved promise instead of
    // triggering a second render.
    expect(renderBillPdf).toHaveBeenCalledTimes(1);
    const call = shareBillPdf.mock.calls[0][0];
    expect(call.bill.billNumber).toBe(799);
    expect(call.pdfPromise).toBeInstanceOf(Promise);
  });

  it('shows "Preparing…" and disables the button until shareBillPdf resolves', async () => {
    let resolveShare;
    vi.mocked(shareBillPdf).mockReturnValue(new Promise((r) => { resolveShare = r; }));

    renderWithParams('id=7');
    const btn = await screen.findByRole('button', { name: /share on whatsapp/i });
    btn.click();

    const preparingBtn = await screen.findByRole('button', { name: /preparing/i });
    expect(preparingBtn).toBeDisabled();

    resolveShare();
    await waitFor(() => expect(screen.getByRole('button', { name: /share on whatsapp/i })).not.toBeDisabled());
  });
});
