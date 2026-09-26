/**
 * billPdf tests — the html2canvas + jsPDF render pipeline and the
 * navigator.share()-with-fallback flow shared by the bill print page and
 * the Bills tab's inline share action.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { renderBillPdf, shareBillPdf } from './billPdf';

/** width/height are the captured canvas's own pixel dimensions (post-scale). */
function fakeCanvas({ width = 1520, height = 800 } = {}) {
  return {
    width, height,
    toBlob: (cb) => cb(new Blob(['fake-image'], { type: 'image/png' })),
    toDataURL: () => 'data:image/png;base64,fake',
  };
}

function fakePdfDoc() {
  return {
    addImage: vi.fn(),
    addPage: vi.fn(),
    output: () => new Blob(['fake-pdf'], { type: 'application/pdf' }),
    // A4 in mm, matching jsPDF's own real `format: 'a4'` page size.
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
  };
}

vi.mock('html2canvas', () => ({
  default: vi.fn(() => Promise.resolve(fakeCanvas())),
}));

vi.mock('jspdf', () => ({
  // jsPDF is invoked with `new` — an arrow-function implementation isn't
  // constructible, so this needs a real `function`.
  jsPDF: vi.fn(function FakeJsPDF() { return fakePdfDoc(); }),
}));

const BILL = {
  billNumber: 799,
  fromDate: '2026-08-01',
  toDate: '2026-08-31',
  totalAmount: 299854,
};

/** A DOM-shaped stand-in for the sheet element passed to html2canvas. */
function fakeSheetEl() {
  return {};
}

const notify = vi.fn();

/** Defines (or removes) navigator.canShare/share for a test — jsdom has neither by default. */
function setShareSupport({ canShare, share } = {}) {
  Object.defineProperty(navigator, 'canShare', { value: canShare, configurable: true });
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(html2canvas).mockResolvedValue(fakeCanvas());
  vi.mocked(jsPDF).mockImplementation(function () { return fakePdfDoc(); });
  vi.spyOn(window, 'open').mockImplementation(() => {});
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  window.URL.revokeObjectURL = vi.fn();
  setShareSupport({ canShare: undefined, share: undefined });
});

describe('renderBillPdf', () => {
  it('captures at a fixed content width regardless of the sheet\'s actual on-screen width — a narrow phone viewport must not crop the Qty/Rate/Amount columns', async () => {
    await renderBillPdf(fakeSheetEl());
    const call = html2canvas.mock.calls[0][1];
    expect(call.windowWidth).toBe(760);
  });

  it('creates a standard A4 page rather than a custom size', async () => {
    await renderBillPdf(fakeSheetEl());
    const call = jsPDF.mock.calls[0][0];
    expect(call.format).toBe('a4');
    expect(call.orientation).toBe('portrait');
    expect(call.unit).toBe('mm');
  });

  it('fits a normal-length bill on a single page', async () => {
    vi.mocked(html2canvas).mockResolvedValue(fakeCanvas({ width: 1520, height: 800 }));
    const doc = fakePdfDoc();
    vi.mocked(jsPDF).mockImplementation(function () { return doc; });

    await renderBillPdf(fakeSheetEl());

    expect(doc.addImage).toHaveBeenCalledTimes(1);
    expect(doc.addPage).not.toHaveBeenCalled();
  });

  it('spills onto further A4 pages for an unusually long bill instead of squeezing it onto one', async () => {
    // A canvas much taller than it is wide, relative to A4's own aspect
    // ratio — once scaled to the page width this is several page-heights tall.
    vi.mocked(html2canvas).mockResolvedValue(fakeCanvas({ width: 1520, height: 6000 }));
    const doc = fakePdfDoc();
    vi.mocked(jsPDF).mockImplementation(function () { return doc; });

    await renderBillPdf(fakeSheetEl());

    expect(doc.addPage).toHaveBeenCalled();
    expect(doc.addImage.mock.calls.length).toBeGreaterThan(1);
    // Every page draws the identical full image, just at a different
    // (page-sized) vertical offset — not a re-render per page.
    expect(html2canvas).toHaveBeenCalledTimes(1);
  });

  it('draws the captured canvas into the page and returns the PDF blob', async () => {
    const blob = await renderBillPdf(fakeSheetEl());
    expect(blob.type).toBe('application/pdf');
  });
});

describe('shareBillPdf', () => {
  it('shares the bill as a PDF via the native share sheet when the platform supports file sharing', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShareSupport({ canShare: vi.fn(() => true), share });

    await shareBillPdf({ bill: BILL, sheetEl: fakeSheetEl(), notify });

    expect(share).toHaveBeenCalled();
    const call = share.mock.calls[0][0];
    expect(call.title).toBe('Bill #799');
    expect(call.text).toContain('Bill #799');
    expect(call.text).toContain('2,99,854.00');
    expect(call.files[0].name).toBe('bill-799.pdf');
    expect(call.files[0].type).toBe('application/pdf');
  });

  it('reuses a passed-in pdfPromise instead of rendering fresh from sheetEl', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShareSupport({ canShare: vi.fn(() => true), share });
    const pdfPromise = Promise.resolve(new Blob(['prewarmed'], { type: 'application/pdf' }));

    await shareBillPdf({ bill: BILL, pdfPromise, notify });

    expect(html2canvas).not.toHaveBeenCalled();
    expect(share).toHaveBeenCalled();
  });

  it('falls back to downloading the PDF and opening wa.me when file sharing is unsupported', async () => {
    await shareBillPdf({ bill: BILL, sheetEl: fakeSheetEl(), notify });

    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/?text='), '_blank');
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('downloaded'), 'success');
  });

  it('falls back the same way when canShare exists but says files are not shareable', async () => {
    setShareSupport({ canShare: vi.fn(() => false), share: vi.fn() });

    await shareBillPdf({ bill: BILL, sheetEl: fakeSheetEl(), notify });

    expect(window.open).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('downloaded'), 'success');
  });

  it('stays silent when the user just closes the native share sheet', async () => {
    const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    setShareSupport({ canShare: vi.fn(() => true), share: vi.fn().mockRejectedValue(abortError) });

    await shareBillPdf({ bill: BILL, sheetEl: fakeSheetEl(), notify });

    expect(notify).not.toHaveBeenCalled();
  });

  it('notifies on a real sharing failure', async () => {
    setShareSupport({ canShare: vi.fn(() => true), share: vi.fn().mockRejectedValue(new Error('boom')) });

    await shareBillPdf({ bill: BILL, sheetEl: fakeSheetEl(), notify });

    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Could not prepare'), 'error');
  });
});
