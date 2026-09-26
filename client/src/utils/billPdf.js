import { formatDateShort } from './dateUtils';
import { DAIRY, formatAmount } from './billDisplay';

// The sheet's own design width (matches BillPrint.jsx's on-screen .sheet
// max-width). Capturing at this fixed width — via html2canvas's windowWidth,
// regardless of whatever the real device viewport happens to be — is the
// point: the table's Qty/Rate/Amount columns need this much room, and on a
// phone the sheet's on-screen width shrinks well below it (BillPrint has no
// min-width, and the preview dialog is narrower still), which doesn't shrink
// the table's own fixed-width columns to match — it just overflows them past
// the sheet's bounding box, and html2canvas crops to that box, silently
// cutting the overflow off. Rendering at a fixed width sidesteps the whole
// problem regardless of screen size.
const CONTENT_WIDTH_PX = 760;

/**
 * Renders a mounted BillSheet DOM node to a PDF Blob on real A4 pages —
 * one page for a normal bill, spilling onto further A4 pages the same way
 * printing does if the bill is unusually long, rather than one arbitrarily
 * tall custom-sized page.
 */
export function renderBillPdf(sheetEl) {
  return Promise.all([import('html2canvas'), import('jspdf')])
    .then(([{ default: html2canvas }, { jsPDF }]) =>
      html2canvas(sheetEl, {
        scale: 2,
        backgroundColor: '#ffffff',
        windowWidth: CONTENT_WIDTH_PX,
      }).then((canvas) => {
        const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        const pageWidthMm  = doc.internal.pageSize.getWidth();
        const pageHeightMm = doc.internal.pageSize.getHeight();
        const imgData   = canvas.toDataURL('image/png');
        const imgHeightMm = (canvas.height * pageWidthMm) / canvas.width;

        // The same full-height image is placed on each page at a
        // progressively higher negative offset, so each page's fixed A4
        // viewport shows the next slice — the standard html2canvas+jsPDF
        // pagination trick (no per-row page-break awareness, but good
        // enough here since a bill only rarely runs past one page).
        let heightLeft = imgHeightMm;
        let position = 0;
        doc.addImage(imgData, 'PNG', 0, position, pageWidthMm, imgHeightMm);
        heightLeft -= pageHeightMm;
        while (heightLeft > 0) {
          position = heightLeft - imgHeightMm;
          doc.addPage();
          doc.addImage(imgData, 'PNG', 0, position, pageWidthMm, imgHeightMm);
          heightLeft -= pageHeightMm;
        }
        return doc.output('blob');
      })
    );
}

/**
 * Hands a bill's PDF to the OS share sheet — one tap, WhatsApp (or anything
 * else) already in the list of destinations, and it lands there as a proper
 * document rather than a photo. Falls back to downloading the PDF and
 * opening web.whatsapp.com/wa.me with a caption pre-filled when the platform
 * can't share files directly (mainly desktop browsers) — WhatsApp's own
 * click-to-chat link has no way to attach a file, so the user pastes in the
 * PDF that's already open.
 *
 * `pdfPromise` lets a caller that pre-rendered the PDF (see BillPrint.jsx)
 * hand over the already-resolved (or in-flight) render instead of starting
 * a fresh one — reusing it, rather than rendering fresh at tap time, is what
 * keeps the eventual navigator.share() call close enough to the tap for
 * browsers (notably iOS Safari) that revoke its permission after any real
 * delay. Omit it to render fresh from `sheetEl` right now.
 */
export async function shareBillPdf({ bill, sheetEl, pdfPromise, notify }) {
  try {
    const blob = await (pdfPromise ?? renderBillPdf(sheetEl));
    const fileName = `bill-${bill.billNumber}.pdf`;
    const file = new File([blob], fileName, { type: 'application/pdf' });
    const caption = `Bill #${bill.billNumber} — ${DAIRY.name} — ${formatDateShort(bill.fromDate)} to ${formatDateShort(bill.toDate)} — Total ₹${formatAmount(bill.totalAmount)}`;

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `Bill #${bill.billNumber}`, text: caption });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, '_blank');
      notify('Bill PDF downloaded — attach it in the WhatsApp chat that just opened', 'success');
    }
  } catch (e) {
    // AbortError just means the user closed the native share sheet without
    // picking anything — not a failure worth surfacing.
    if (e?.name !== 'AbortError') {
      notify('Could not prepare the bill PDF — try again, or use Print / Save PDF instead', 'error');
    }
  }
}
