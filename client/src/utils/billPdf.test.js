/**
 * billPdf tests — the native jsPDF drawing pipeline (masthead, dotted
 * fields, Brand → Product table with pagination, total, in-words/signature
 * footer, and the small rasterized watermark) plus the
 * navigator.share()-with-fallback flow shared by the bill print page, the
 * Bills tab's inline row action and its preview dialog.
 *
 * The PDF used to be a full-page html2canvas screenshot embedded in a
 * custom-sized page — cropped on some devices, blurry, and multi-megabyte.
 * It's now built as native vector text/lines/tables via jsPDF directly, so
 * these tests exercise the actual drawing calls rather than mocking jsPDF
 * away entirely (a thin fake would hide layout bugs like the one this
 * rewrite fixed — see git history).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderBillPdf, shareBillPdf } from './billPdf';

// jsPDF runs fine under jsdom; only the watermark's Canvas 2D rendering
// isn't meaningful there, so canvas.getContext + toDataURL are stubbed —
// jsPDF actually decodes the PNG it's handed (to re-embed the raw pixel
// data), so this has to be a real, valid 1x1 PNG, not an arbitrary string.
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillText: vi.fn(),
  }));
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => TINY_PNG);
});

const BILL = {
  billNumber: 799,
  poNumber: '798',
  partyName: 'A.T & S',
  fromDate: '2026-08-01',
  toDate: '2026-08-31',
  totalAmount: 299854,
  lines: [
    {
      brandName: 'Nandini',
      products: [
        { productName: 'Toned Milk 500ml', unit: 'ltr', quantity: 3325, rate: 52, amount: 172900 },
        { productName: 'Curd 500ml',       unit: 'ltr', quantity: 2351, rate: 54, amount: 126954 },
      ],
      amount: 299854,
    },
  ],
};

/** Builds a bill with `count` products in one brand, to force pagination. */
function longBill(count) {
  return {
    ...BILL,
    lines: [{
      brandName: 'Nandini',
      products: Array.from({ length: count }, (_, i) => ({
        productName: `Product ${i + 1}`, unit: 'ltr', quantity: 10, rate: 10, amount: 100,
      })),
      amount: count * 100,
    }],
    totalAmount: count * 100,
  };
}

const notify = vi.fn();

/** Defines (or removes) navigator.canShare/share for a test — jsdom has neither by default. */
function setShareSupport({ canShare, share } = {}) {
  Object.defineProperty(navigator, 'canShare', { value: canShare, configurable: true });
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
}

beforeEach(() => {
  notify.mockClear();
  vi.spyOn(window, 'open').mockImplementation(() => {});
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  window.URL.revokeObjectURL = vi.fn();
  setShareSupport({ canShare: undefined, share: undefined });
});

describe('renderBillPdf', () => {
  it('renders a real, non-empty single-page PDF for a normal bill', async () => {
    const blob = await renderBillPdf(BILL);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(1000);
  });

  it('produces a standard A4 page — not a custom size shaped to the content', async () => {
    const blob = await renderBillPdf(BILL);
    const text = await blob.text();
    // A4 in PDF points (595.28 x 841.89) appears in the page's own MediaBox.
    expect(text).toMatch(/MediaBox \[0 0 595\.27\d* 841\.88\d*\]/);
  });

  it('spills a long bill onto further A4 pages instead of squeezing everything onto one', async () => {
    const shortBlob = await renderBillPdf(BILL);
    const longBlob = await renderBillPdf(longBill(60));
    // jsPDF emits one /Type /Page object per page — a crude but reliable
    // page count without a full PDF parser.
    const countPages = (text) => (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    const shortPages = countPages(await shortBlob.text());
    const longPages  = countPages(await longBlob.text());
    expect(shortPages).toBe(1);
    expect(longPages).toBeGreaterThan(1);
  });

  it('does not throw on a bill with a zero rate/amount product (a real dispatched-for-free case)', async () => {
    const bill = {
      ...BILL,
      lines: [{
        brandName: 'Jersey',
        products: [{ productName: 'Sample 490ml', unit: 'ltr', quantity: 5, rate: 0, amount: 0 }],
        amount: 0,
      }],
    };
    await expect(renderBillPdf(bill)).resolves.toBeInstanceOf(Blob);
  });

  it('handles a bill with no PO number', async () => {
    await expect(renderBillPdf({ ...BILL, poNumber: null })).resolves.toBeInstanceOf(Blob);
  });
});

describe('shareBillPdf', () => {
  it('shares the bill as a PDF via the native share sheet when the platform supports file sharing', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShareSupport({ canShare: vi.fn(() => true), share });

    await shareBillPdf({ bill: BILL, notify });

    expect(share).toHaveBeenCalled();
    const call = share.mock.calls[0][0];
    expect(call.title).toBe('Bill #799');
    expect(call.text).toContain('Bill #799');
    expect(call.text).toContain('2,99,854.00');
    expect(call.files[0].name).toBe('bill-799.pdf');
    expect(call.files[0].type).toBe('application/pdf');
  });

  it('reuses a passed-in pdfPromise instead of rendering fresh', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShareSupport({ canShare: vi.fn(() => true), share });
    const prewarmed = new Blob(['prewarmed'], { type: 'application/pdf' });
    const pdfPromise = Promise.resolve(prewarmed);

    await shareBillPdf({ bill: BILL, pdfPromise, notify });

    expect(share).toHaveBeenCalled();
    expect(share.mock.calls[0][0].files[0].size).toBe(prewarmed.size);
  });

  it('falls back to downloading the PDF and opening wa.me when file sharing is unsupported', async () => {
    await shareBillPdf({ bill: BILL, notify });

    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/?text='), '_blank');
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('downloaded'), 'success');
  });

  it('falls back the same way when canShare exists but says files are not shareable', async () => {
    setShareSupport({ canShare: vi.fn(() => false), share: vi.fn() });

    await shareBillPdf({ bill: BILL, notify });

    expect(window.open).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('downloaded'), 'success');
  });

  it('stays silent when the user just closes the native share sheet', async () => {
    const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    setShareSupport({ canShare: vi.fn(() => true), share: vi.fn().mockRejectedValue(abortError) });

    await shareBillPdf({ bill: BILL, notify });

    expect(notify).not.toHaveBeenCalled();
  });

  it('notifies on a real sharing failure', async () => {
    setShareSupport({ canShare: vi.fn(() => true), share: vi.fn().mockRejectedValue(new Error('boom')) });

    await shareBillPdf({ bill: BILL, notify });

    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Could not prepare'), 'error');
  });
});
