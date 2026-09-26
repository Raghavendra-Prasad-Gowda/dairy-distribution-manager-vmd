/**
 * BillPrint tests.
 *
 * Covers reading the bill id from the query string, rendering the frozen
 * Brand → Product line items, the pad's masthead, the total and the amount
 * in words, loading/error states, manual print, and the WhatsApp share flow
 * (native file share when supported, download + wa.me fallback otherwise,
 * and the background pre-render that keeps the share call close enough to
 * the tap for browsers that revoke it after any real delay).
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import BillPrint from './BillPrint';
import api from '../../api/axios';
import html2canvas from 'html2canvas';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}));

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

function fakeCanvas() {
  return { toBlob: (cb) => cb(new Blob(['fake-image'], { type: 'image/png' })) };
}

vi.mock('html2canvas', () => ({
  default: vi.fn(() => Promise.resolve(fakeCanvas())),
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

/** Defines (or removes) navigator.canShare/share for a test — jsdom has neither by default. */
function setShareSupport({ canShare, share } = {}) {
  Object.defineProperty(navigator, 'canShare', { value: canShare, configurable: true });
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
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
  vi.mocked(html2canvas).mockResolvedValue(fakeCanvas());
  vi.spyOn(window, 'print').mockImplementation(() => {});
  vi.spyOn(window, 'open').mockImplementation(() => {});
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  window.URL.revokeObjectURL = vi.fn();
  setShareSupport({ canShare: undefined, share: undefined });
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

  it('renders each product under its brand', async () => {
    renderWithParams('id=7');
    expect(await screen.findByText('Nandini')).toBeInTheDocument();
    expect(screen.getByText('Toned Milk 500ml')).toBeInTheDocument();
    expect(screen.getByText('Curd 500ml')).toBeInTheDocument();
  });

  it('lists a second brand as its own section, separate from the first', async () => {
    mockBill({
      ...BILL,
      lines: [
        ...LINES,
        { brandName: 'Jersey', products: [{ productName: 'HTM 1L', unit: 'ltr', quantity: 10, rate: 45, amount: 450 }], amount: 450 },
      ],
      totalAmount: 300304,
    });
    renderWithParams('id=7');
    expect(await screen.findByText('Jersey')).toBeInTheDocument();
    expect(screen.getByText('HTM 1L')).toBeInTheDocument();
    // The first brand's own products are still there, unaffected.
    expect(screen.getByText('Toned Milk 500ml')).toBeInTheDocument();
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
        products: [{ productName: 'Ghee 500ml', unit: 'kg', quantity: 12.5, rate: 640, amount: 8000 }],
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
  it('pre-renders the share image in the background as soon as the bill loads, before any click', async () => {
    renderWithParams('id=7');
    await screen.findByText('VIKAS MILK DAIRY');
    await waitFor(() => expect(html2canvas).toHaveBeenCalledTimes(1));
  });

  it('reuses the pre-rendered image instead of re-rendering on click — the render must not start at tap time, or a slow one can outlast the tap on browsers that tie navigator.share() to it', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShareSupport({ canShare: vi.fn(() => true), share });

    renderWithParams('id=7');
    await waitFor(() => expect(html2canvas).toHaveBeenCalledTimes(1));

    const btn = await screen.findByRole('button', { name: /share on whatsapp/i });
    btn.click();

    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(html2canvas).toHaveBeenCalledTimes(1);
  });

  it('shares the bill as an image via the native share sheet when the platform supports file sharing', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShareSupport({ canShare: vi.fn(() => true), share });

    renderWithParams('id=7');
    const btn = await screen.findByRole('button', { name: /share on whatsapp/i });
    btn.click();

    await waitFor(() => expect(share).toHaveBeenCalled());
    const call = share.mock.calls[0][0];
    expect(call.title).toBe('Bill #799');
    expect(call.text).toContain('Bill #799');
    expect(call.text).toContain('2,99,854.00');
    expect(call.files[0].name).toBe('bill-799.png');
    expect(call.files[0].type).toBe('image/png');
  });

  it('shows "Preparing…" and disables the button while the image is being captured', async () => {
    let resolveCanvas;
    vi.mocked(html2canvas).mockReturnValue(new Promise((r) => { resolveCanvas = r; }));
    setShareSupport({ canShare: vi.fn(() => true), share: vi.fn().mockResolvedValue(undefined) });

    renderWithParams('id=7');
    const btn = await screen.findByRole('button', { name: /share on whatsapp/i });
    btn.click();

    const preparingBtn = await screen.findByRole('button', { name: /preparing/i });
    expect(preparingBtn).toBeDisabled();

    resolveCanvas(fakeCanvas());
    await waitFor(() => expect(screen.getByRole('button', { name: /share on whatsapp/i })).not.toBeDisabled());
  });

  it('falls back to downloading the image and opening wa.me when file sharing is unsupported', async () => {
    setShareSupport({ canShare: undefined, share: undefined });

    renderWithParams('id=7');
    const btn = await screen.findByRole('button', { name: /share on whatsapp/i });
    btn.click();

    await waitFor(() => expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('https://wa.me/?text='), '_blank'
    ));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('downloaded'), 'success');
  });

  it('falls back the same way when canShare exists but says files are not shareable', async () => {
    setShareSupport({ canShare: vi.fn(() => false), share: vi.fn() });

    renderWithParams('id=7');
    const btn = await screen.findByRole('button', { name: /share on whatsapp/i });
    btn.click();

    await waitFor(() => expect(window.open).toHaveBeenCalled());
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('downloaded'), 'success');
  });

  it('stays silent when the user just closes the native share sheet', async () => {
    const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    setShareSupport({ canShare: vi.fn(() => true), share: vi.fn().mockRejectedValue(abortError) });

    renderWithParams('id=7');
    const btn = await screen.findByRole('button', { name: /share on whatsapp/i });
    btn.click();

    await waitFor(() => expect(btn).not.toBeDisabled());
    expect(notify).not.toHaveBeenCalled();
  });

  it('notifies on a real sharing failure', async () => {
    setShareSupport({ canShare: vi.fn(() => true), share: vi.fn().mockRejectedValue(new Error('boom')) });

    renderWithParams('id=7');
    const btn = await screen.findByRole('button', { name: /share on whatsapp/i });
    btn.click();

    await waitFor(() => expect(notify).toHaveBeenCalledWith(
      expect.stringContaining('Could not prepare'), 'error'
    ));
  });
});
