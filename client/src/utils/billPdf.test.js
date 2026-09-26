/**
 * billPdf tests — the html2canvas + jsPDF render pipeline and the
 * navigator.share()-with-fallback flow shared by the bill print page and
 * the Bills tab's inline share action.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { renderBillPdf, shareBillPdf } from './billPdf';

function fakeCanvas() {
  return { toBlob: (cb) => cb(new Blob(['fake-image'], { type: 'image/png' })), toDataURL: () => 'data:image/png;base64,fake' };
}

function fakePdfDoc() {
  return { addImage: vi.fn(), output: () => new Blob(['fake-pdf'], { type: 'application/pdf' }) };
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

/** A DOM-shaped stand-in for the sheet element — just needs offsetWidth/offsetHeight. */
function fakeSheetEl({ width = 760, height = 400 } = {}) {
  return { offsetWidth: width, offsetHeight: height };
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
  it('sizes the PDF page to the sheet element itself, in portrait when it is taller than wide', async () => {
    await renderBillPdf(fakeSheetEl({ width: 400, height: 800 }));
    const call = jsPDF.mock.calls[0][0];
    expect(call.orientation).toBe('portrait');
    expect(call.format[0]).toBeCloseTo(400 * 25.4 / 96, 5);
    expect(call.format[1]).toBeCloseTo(800 * 25.4 / 96, 5);
  });

  it('switches to landscape instead of letting jsPDF silently swap width/height for a wide, short sheet', async () => {
    await renderBillPdf(fakeSheetEl({ width: 760, height: 400 }));
    const call = jsPDF.mock.calls[0][0];
    expect(call.orientation).toBe('landscape');
    expect(call.format[0]).toBeCloseTo(760 * 25.4 / 96, 5);
    expect(call.format[1]).toBeCloseTo(400 * 25.4 / 96, 5);
  });

  it('draws the captured canvas into the page at full size and returns the PDF blob', async () => {
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
