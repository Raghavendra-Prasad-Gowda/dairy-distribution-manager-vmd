import { formatDateShort } from './dateUtils';
import { numberToWords } from './numberToWords';
import { DAIRY, formatAmount, formatRate, formatQty } from './billDisplay';

// A4 in mm, matching the pad's own print margins (@page in BillSheet's print
// CSS uses the same 12/14mm).
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 14;
const MARGIN_TOP = 12;
const MARGIN_BOTTOM = 14;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const NAVY = [26, 26, 110]; // #1a1a6e
const BRAND_FILL = [238, 240, 251]; // #eef0fb

const QTY_W  = 28;
const RATE_W = 26;
const AMT_W  = 32;
const DESC_W = CONTENT_W - QTY_W - RATE_W - AMT_W;

/**
 * Rasterizes just the 🐄 watermark glyph via the plain Canvas 2D API (not
 * html2canvas) — this needs actual emoji font rendering, which jsPDF's own
 * built-in fonts can't do, but nothing else in the document does, so only
 * this one small image is a raster; everything else below is native vector
 * text/lines, which is what actually fixes the cropping, blurriness and
 * missing-space rendering a full-page html2canvas screenshot kept hitting on
 * some devices. The low opacity is baked into the canvas itself.
 */
function renderWatermarkPng() {
  const size = 400;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.filter = 'grayscale(1) contrast(0.85)';
  ctx.globalAlpha = 0.11;
  ctx.font = `${size * 0.6}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🐄', size / 2, size / 2 + size * 0.04);
  return canvas.toDataURL('image/png');
}

/** Draws one dotted-underline field: a label, its bold value, and the dots trailing to the field's right edge. */
function drawField(doc, x, y, width, label, value) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text(label, x, y);
  const labelW = doc.getTextWidth(label) + 1.5;

  doc.setDrawColor(...NAVY);
  doc.setLineDashPattern([0.4, 0.8], 0);
  doc.setLineWidth(0.15);
  doc.line(x + labelW, y + 0.8, x + width, y + 0.8);
  doc.setLineDashPattern([], 0);

  if (value) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(String(value), x + labelW + 1, y);
  }
}

/** Draws the table's header row (Description/Qty/Rate/Amount) at the given y, returns the y just below it. */
function drawTableHeader(doc, y) {
  const rowH = 7;
  // Opaque, like every other row — otherwise the watermark, drawn first,
  // would show through wherever it happens to land as the bill grows.
  doc.setFillColor(255, 255, 255);
  doc.rect(MARGIN_X, y, CONTENT_W, rowH, 'F');
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.2);
  doc.rect(MARGIN_X, y, CONTENT_W, rowH);
  const cols = [
    { w: DESC_W, label: 'DESCRIPTION' },
    { w: QTY_W,  label: 'QTY.' },
    { w: RATE_W, label: 'RATE' },
    { w: AMT_W,  label: 'AMOUNT' },
  ];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...NAVY);
  let x = MARGIN_X;
  cols.forEach((col, i) => {
    if (i > 0) doc.line(x, y, x, y + rowH);
    doc.text(col.label, x + col.w / 2, y + rowH / 2 + 1.2, { align: 'center' });
    x += col.w;
  });
  return y + rowH;
}

/** Builds the full bill as a jsPDF document — native vector text/lines/tables, not a screenshot. */
function buildBillDoc(jsPDF, bill) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const watermark = renderWatermarkPng();
  const wmSize = 90;

  function drawWatermark() {
    doc.addImage(watermark, 'PNG', (PAGE_W - wmSize) / 2, (PAGE_H - wmSize) / 2, wmSize, wmSize);
  }

  drawWatermark();

  // ── Masthead, Bill No / dates / M/s ──────────────────────────────────
  const boxTop = MARGIN_TOP;
  let y = boxTop + 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text(DAIRY.proprietor, MARGIN_X + 3, y);
  doc.text('Cash / Credit Bill', PAGE_W - MARGIN_X - 3, y, { align: 'right' });
  y += 7;

  // Letter-spaced by hand (real spaces) rather than a font feature — always
  // renders the same regardless of jsPDF/font version, and is easy to
  // center via a plain getTextWidth. The pad's own name's word-separating
  // space naturally becomes a wider gap this way (one join space either
  // side of it), which is the look we want anyway.
  const nameText = DAIRY.name.split('').join(' ');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  const nameW = doc.getTextWidth(nameText) + 14;
  const nameBoxX = (PAGE_W - nameW) / 2;
  const nameBoxH = 9.5;
  doc.setLineWidth(0.4);
  doc.rect(nameBoxX, y, nameW, nameBoxH);
  doc.text(nameText, PAGE_W / 2, y + nameBoxH / 2 + 2, { align: 'center' });
  y += nameBoxH + 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(DAIRY.address, PAGE_W / 2, y, { align: 'center' });
  y += 4;
  doc.text(`Ph: ${DAIRY.phones}`, PAGE_W / 2, y, { align: 'center' });
  y += 7;

  // Inset from the outer box's own edge, so field text/lines never touch it.
  const boxPad = 3;
  const innerX = MARGIN_X + boxPad;
  const innerW = CONTENT_W - boxPad * 2;
  const fieldGap = 8;
  const fieldW = (innerW - fieldGap) / 2;
  drawField(doc, innerX, y, fieldW, 'Bill No.', bill.billNumber);
  drawField(doc, innerX + fieldW + fieldGap, y, fieldW, 'Date', `${formatDateShort(bill.fromDate)} to`);
  y += 6.5;
  drawField(doc, innerX, y, fieldW, 'PO No.', bill.poNumber ?? '');
  drawField(doc, innerX + fieldW + fieldGap, y, fieldW, 'Date', formatDateShort(bill.toDate));
  y += 6.5;
  drawField(doc, innerX, y, innerW, 'M/s', bill.partyName);
  y += 5;

  doc.setLineWidth(0.4);
  doc.rect(MARGIN_X, boxTop, CONTENT_W, y - boxTop);

  y += 6;

  // ── Line items — Brand → Product ─────────────────────────────────────
  y = drawTableHeader(doc, y);

  function ensureSpace(rowH) {
    if (y + rowH > PAGE_H - MARGIN_BOTTOM) {
      doc.addPage();
      drawWatermark();
      y = MARGIN_TOP;
      y = drawTableHeader(doc, y);
    }
  }

  // Opaque, like the header row — otherwise the watermark, drawn once
  // behind everything, would bleed through wherever it lands as the table
  // grows, rather than staying confined to the page's blank margins.
  function drawRowBorders(rowH, fillColor = [255, 255, 255]) {
    doc.setFillColor(...fillColor);
    doc.rect(MARGIN_X, y, CONTENT_W, rowH, 'F');
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.15);
    doc.rect(MARGIN_X, y, CONTENT_W, rowH);
    let x = MARGIN_X + DESC_W;
    doc.line(x, y, x, y + rowH);
    x += QTY_W;
    doc.line(x, y, x, y + rowH);
    x += RATE_W;
    doc.line(x, y, x, y + rowH);
  }

  bill.lines.forEach((brand) => {
    const brandRowH = 6.5;
    ensureSpace(brandRowH);
    drawRowBorders(brandRowH, BRAND_FILL);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text(brand.brandName.toUpperCase(), MARGIN_X + 2, y + brandRowH / 2 + 1.2);
    y += brandRowH;

    brand.products.forEach((product) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const descLines = doc.splitTextToSize(product.productName, DESC_W - 6);
      const rowH = Math.max(7, descLines.length * 4 + 2.5);
      ensureSpace(rowH); // may flip the font to bold via the continuation header
      drawRowBorders(rowH);

      // Re-assert — ensureSpace's page-break path draws the header in bold.
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const textY = y + (rowH - (descLines.length - 1) * 4) / 2 + 1.2;
      doc.text(descLines, MARGIN_X + 3, textY, { lineHeightFactor: 1.3 });

      const midY = y + rowH / 2 + 1.2;
      doc.text(formatQty(product), MARGIN_X + DESC_W + QTY_W - 2, midY, { align: 'right' });
      doc.text(formatRate(product), MARGIN_X + DESC_W + QTY_W + RATE_W - 2, midY, { align: 'right' });
      doc.text(formatAmount(product.amount), MARGIN_X + CONTENT_W - 2, midY, { align: 'right' });
      y += rowH;
    });
  });

  // ── Total ──────────────────────────────────────────────────────────
  const totalRowH = 7.5;
  ensureSpace(totalRowH);
  doc.setFillColor(255, 255, 255);
  doc.rect(MARGIN_X, y, CONTENT_W, totalRowH, 'F');
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.2);
  doc.rect(MARGIN_X, y, DESC_W + QTY_W + RATE_W, totalRowH);
  doc.rect(MARGIN_X + DESC_W + QTY_W + RATE_W, y, AMT_W, totalRowH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('Total', MARGIN_X + DESC_W + QTY_W + RATE_W - 2, y + totalRowH / 2 + 1.2, { align: 'right' });
  doc.text(formatAmount(bill.totalAmount), MARGIN_X + CONTENT_W - 2, y + totalRowH / 2 + 1.2, { align: 'right' });
  y += totalRowH + 6;

  // ── In words + signature ──────────────────────────────────────────────
  const wordsLabel = 'in words ';
  const wordsText = numberToWords(bill.totalAmount);
  const signW = 55;
  ensureSpace(16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(wordsLabel, MARGIN_X, y);
  const wordsLabelW = doc.getTextWidth(wordsLabel);
  doc.setFont('helvetica', 'bold');
  const wordsLines = doc.splitTextToSize(wordsText, CONTENT_W - signW - wordsLabelW - 4);
  doc.text(wordsLines, MARGIN_X + wordsLabelW, y, { lineHeightFactor: 1.4 });
  if (wordsLines.length === 1) {
    const lineW = doc.getTextWidth(wordsLines[0]);
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.15);
    doc.line(MARGIN_X + wordsLabelW, y + 1, MARGIN_X + wordsLabelW + lineW, y + 1);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`For ${DAIRY.signName}`, PAGE_W - MARGIN_X, y, { align: 'right' });
  const signY = y + 9;
  doc.setLineWidth(0.15);
  doc.line(PAGE_W - MARGIN_X - signW, signY, PAGE_W - MARGIN_X, signY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Proprietor', PAGE_W - MARGIN_X - signW / 2, signY + 3.5, { align: 'center' });

  return doc;
}

/** Renders the bill to a PDF Blob — genuine A4 pages of native vector text/tables, not a screenshot. */
export function renderBillPdf(bill) {
  return import('jspdf').then(({ jsPDF }) => buildBillDoc(jsPDF, bill).output('blob'));
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
 * delay. Omit it to render fresh right now.
 */
export async function shareBillPdf({ bill, pdfPromise, notify }) {
  try {
    const blob = await (pdfPromise ?? renderBillPdf(bill));
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
