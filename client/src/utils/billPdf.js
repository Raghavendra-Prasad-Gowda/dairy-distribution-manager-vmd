import { formatDateShort } from './dateUtils';
import { DAIRY, formatAmount } from './billDisplay';

// 1 CSS px == 1/96in == 25.4/96 mm — used to size the PDF's page to exactly
// match the sheet's own on-screen dimensions, so the exported document is a
// single page with no forced-fit scaling or pagination logic.
const PX_TO_MM = 25.4 / 96;

/** Renders a mounted BillSheet DOM node to a single-page PDF Blob, sized to the sheet itself. */
export function renderBillPdf(sheetEl) {
  return Promise.all([import('html2canvas'), import('jspdf')])
    .then(([{ default: html2canvas }, { jsPDF }]) => {
      const widthMm  = sheetEl.offsetWidth  * PX_TO_MM;
      const heightMm = sheetEl.offsetHeight * PX_TO_MM;
      return html2canvas(sheetEl, {
        scale: Math.min(window.devicePixelRatio || 1, 2) + 1,
        backgroundColor: '#ffffff',
      }).then((canvas) => {
        // jsPDF's default ('portrait') orientation silently swaps a custom
        // format's width/height when width > height, which would distort
        // this: a short bill is wider than it is tall. Matching the
        // orientation to the sheet's own aspect ratio keeps it as-is.
        const doc = new jsPDF({
          unit: 'mm',
          format: [widthMm, heightMm],
          orientation: widthMm > heightMm ? 'landscape' : 'portrait',
        });
        doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, widthMm, heightMm);
        return doc.output('blob');
      });
    });
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
