import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import { useNotification } from '../../context/NotificationContext';
import { formatDateShort } from '../../utils/dateUtils';
import { numberToWords } from '../../utils/numberToWords';

// The pre-printed masthead of the dairy's bill pad. Kept here beside the
// layout that reproduces it — the same way the other print views hold their
// own `BUSINESS` constant — so the PDF matches the stationery exactly.
const DAIRY = {
  proprietor: 'Pro: K.B. NAGARAJU',
  name:       'VIKAS MILK DAIRY',
  // Mixed case for the signature block, which the pad prints in title case.
  signName:   'Vikas Milk Dairy',
  address:    '15th Cross, M.G.S.Road, NANJANGUD - 571 301',
  phones:     '9845073830, 9900168388, 9845585343',
};

// 1 CSS px == 1/96in == 25.4/96 mm — used to size the shared PDF's page to
// exactly match the sheet's own on-screen dimensions, so the exported
// document is a single page with no forced-fit scaling or pagination logic.
const PX_TO_MM = 25.4 / 96;

/** "52/ltr" — a product's rate, blank when there's nothing to derive it from. */
function formatRate(product) {
  if (product.rate == null) return '';
  return `${product.rate}/${product.unit}`;
}

/** Quantities print whole where they are whole, 2dp otherwise, with their unit. */
function formatQty(product) {
  const qty = Number.isInteger(product.quantity) ? String(product.quantity) : product.quantity.toFixed(2);
  return `${qty} ${product.unit}`;
}

/** Plain grouped figures — the pad writes amounts without a ₹ symbol. */
function formatAmount(n) {
  if (!n) return '';
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BillPrint() {
  const { notify } = useNotification();
  const [params] = useSearchParams();
  const id = params.get('id') ?? '';

  const [bill, setBill] = useState(null);
  const [fetchError, setFetchError] = useState('');
  const [sharing, setSharing] = useState(false);
  const sheetRef = useRef(null);
  // Holds the in-flight/resolved render so a click can reuse it instead of
  // starting a fresh one — see the pre-warming effect below.
  const renderPromiseRef = useRef(null);
  // A missing id is derivable from the URL, so it's computed here rather than
  // pushed into state from the effect below.
  const error = id ? fetchError : 'No bill specified';

  useEffect(() => {
    if (!id) return;
    api.get(`/bills/${id}`)
      .then((r) => setBill(r.data.data))
      .catch((e) => setFetchError(e.response?.data?.error ?? 'Failed to load bill'));
  }, [id]);

  // No auto-print-on-load here (unlike the other *Print.jsx pages) — this
  // page's whole point is handing the bill to a salesperson to send on, and
  // an OS print dialog popping up unasked is exactly what left them unsure
  // what to do next. Sharing and printing are both one explicit tap away
  // instead, with sharing as the obvious first move.

  /** Renders the bill sheet to a single-page PDF Blob, sized to the sheet itself. */
  function renderBillPdf() {
    return Promise.all([import('html2canvas'), import('jspdf')])
      .then(([{ default: html2canvas }, { jsPDF }]) => {
        const widthMm  = sheetRef.current.offsetWidth  * PX_TO_MM;
        const heightMm = sheetRef.current.offsetHeight * PX_TO_MM;
        return html2canvas(sheetRef.current, {
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

  // Pre-renders the share PDF in the background as soon as the bill is on
  // screen, instead of waiting for the tap. iOS Safari ties navigator.share()
  // to the click that triggered it and silently refuses it (canShare comes
  // back false) once anything slower than a microtask runs first — an
  // html2canvas capture plus the html2canvas/jsPDF chunks' own dynamic import
  // easily blows past that window. Starting the render early means the
  // click handler usually just awaits an already-resolved promise, so the
  // share-sheet call stays inside the gesture.
  useEffect(() => {
    if (!bill) return;
    const promise = renderBillPdf();
    renderPromiseRef.current = promise;
    promise.catch(() => {
      if (renderPromiseRef.current === promise) renderPromiseRef.current = null;
    });
  }, [bill]);

  /**
   * Hands the (usually already-rendered) bill PDF to the OS share sheet —
   * one tap, WhatsApp (or anything else) already in the list of
   * destinations, and it lands there as a proper document rather than a
   * photo. Falls back to downloading the PDF and opening
   * web.whatsapp.com/wa.me with a caption pre-filled when the platform can't
   * share files directly (mainly desktop browsers) — WhatsApp's own
   * click-to-chat link has no way to attach a file, so the user pastes in
   * the PDF that's already open.
   */
  async function shareOnWhatsApp() {
    if (!bill) return;
    setSharing(true);
    try {
      const blob = await (renderPromiseRef.current ?? renderBillPdf());
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
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1a1a6e; background: #fff; }
        @media print {
          /* A4, not the pad's own small A5 slip — the bill now lists every
             product actually supplied instead of six pre-printed rows, so
             its length varies with how much was dispatched and needs the
             extra room; a long bill flows onto further A4 pages normally. */
          @page { margin: 12mm 14mm; size: A4 portrait; }
          .no-print { display: none !important; }
          .sheet { max-width: none; width: 100%; margin: 0; }
          /* Repeats once per printed page like a letterhead, instead of the
             screen/capture behaviour of sitting once inside the sheet. */
          .watermark { position: fixed; }
        }
        /* Top margin clears the fixed action bar. */
        .sheet { max-width: 760px; margin: 56px auto 0; position: relative; z-index: 1; }
        /* On screen (and so in the captured share image) the watermark is
           one layer inside the sheet, scaling with however tall it is —
           simplest way to have it show up in both the live page and the
           html2canvas capture without duplicating markup. */
        .watermark {
          position: absolute; inset: 0; z-index: 0;
          display: flex; align-items: center; justify-content: center;
          pointer-events: none;
        }
        .watermark span { font-size: 260px; line-height: 1; opacity: 0.14; filter: grayscale(1) contrast(0.85); }
        .identity { position: relative; z-index: 1; border: 2px solid #1a1a6e; padding: 16px 18px; margin-bottom: 14px; background: #fff; }
        .toprow { display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; margin-bottom: 6px; }
        .masthead { text-align: center; }
        .dairy-name { display: inline-block; border: 2px solid #1a1a6e; padding: 3px 14px; font-size: 22px;
                      font-weight: 700; letter-spacing: 0.14em; }
        .address { font-size: 10px; margin-top: 4px; }
        .phones  { font-size: 10px; margin-top: 2px; }
        .meta { margin: 12px 0 0; font-size: 11px; }
        .meta-line { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 5px; }
        .field { flex: 1; display: flex; gap: 4px; align-items: baseline; }
        .field .value { flex: 1; border-bottom: 1px dotted #1a1a6e; font-weight: 700; padding: 0 3px; min-height: 14px; }
        table { position: relative; z-index: 1; width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #1a1a6e; padding: 6px 8px; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; background: #fff; }
        .desc { font-weight: 500; }
        .num  { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .qty  { width: 90px; }
        .rate { width: 72px; }
        .amt  { width: 100px; }
        .brand-row td { background: #eef0fb; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
        .product-row td { background: #fff; }
        .product-row .desc { padding-left: 18px; }
        .total-label { text-align: right; font-weight: 700; border-left: none; }
        .total-amt   { font-weight: 700; }
        .total-label, .total-amt { background: #fff; }
        .no-border { border: none; }
        .footer { position: relative; z-index: 1; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 10px; font-size: 10px; }
        .words { flex: 1; font-size: 9px; line-height: 1.6; }
        .words .value { border-bottom: 1px dotted #1a1a6e; font-weight: 700; min-height: 14px; padding: 0 3px; }
        .sign { text-align: center; font-size: 10px; }
        .sign .for { font-weight: 700; margin-bottom: 26px; }
        .sign .role { border-top: 1px solid #1a1a6e; padding-top: 2px; }
        .actions { position: fixed; top: 12px; right: 16px; z-index: 2; display: flex; gap: 8px; }
        .action-btn { border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px;
                      font-weight: 600; cursor: pointer; font-family: Arial, Helvetica, sans-serif; }
        .action-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .whatsapp-btn { background: #25d366; color: #fff; }
        .whatsapp-btn:hover:not(:disabled) { background: #1fb957; }
        .print-btn { background: #fff; color: #1a1a6e; border: 1px solid #c7cbe8 !important; }
        .print-btn:hover { background: #f4f5fb; }
        .msg { padding: 24px; text-align: center; color: #6b7280; font-family: Arial, sans-serif; }
      `}</style>

      <div className="no-print actions">
        <button className="action-btn whatsapp-btn" onClick={shareOnWhatsApp} disabled={!bill || sharing}>
          {sharing ? 'Preparing…' : '📤 Share on WhatsApp'}
        </button>
        <button className="action-btn print-btn" onClick={() => window.print()} disabled={!bill}>
          Print / Save PDF
        </button>
      </div>

      {error && <p className="msg" style={{ color: '#dc2626' }}>{error}</p>}
      {!bill && !error && <p className="msg">Loading…</p>}

      {bill && (
        <div className="sheet" ref={sheetRef}>

          <div className="watermark" aria-hidden="true"><span>🐄</span></div>

          {/* ── Masthead, Bill No / dates / M/s ─────────────────────── */}
          <div className="identity">
            <div className="toprow">
              <span>{DAIRY.proprietor}</span>
              <span>Cash / Credit Bill</span>
            </div>
            <div className="masthead">
              <div className="dairy-name">{DAIRY.name}</div>
              <div className="address">{DAIRY.address}</div>
              <div className="phones">☎ {DAIRY.phones}</div>
            </div>

            <div className="meta">
              <div className="meta-line">
                <span className="field">Bill No.<span className="value">{bill.billNumber}</span></span>
                <span className="field">Date<span className="value">{formatDateShort(bill.fromDate)} to</span></span>
              </div>
              <div className="meta-line">
                <span className="field">PO No.<span className="value">{bill.poNumber ?? ''}</span></span>
                <span className="field">Date<span className="value">{formatDateShort(bill.toDate)}</span></span>
              </div>
              <div className="meta-line">
                <span className="field">M/s<span className="value">{bill.partyName}</span></span>
              </div>
            </div>
          </div>

          {/* ── Line items — Brand → Product ─────────────────────────── */}
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th className="qty">Qty.</th>
                <th className="rate">Rate</th>
                <th className="amt">Amount</th>
              </tr>
            </thead>
            <tbody>
              {bill.lines.map((brand) => (
                <React.Fragment key={brand.brandName}>
                  <tr className="brand-row">
                    <td colSpan={4}>{brand.brandName}</td>
                  </tr>
                  {brand.products.map((product) => (
                    <tr key={product.productName} className="product-row">
                      <td className="desc">{product.productName}</td>
                      <td className="num">{formatQty(product)}</td>
                      <td className="num">{formatRate(product)}</td>
                      <td className="num">{formatAmount(product.amount)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="total-label" colSpan={3}>Total</td>
                <td className="num total-amt">{formatAmount(bill.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>

          {/* ── In words + signature ─────────────────────────────────── */}
          <div className="footer">
            <div className="words">
              in words <span className="value">{numberToWords(bill.totalAmount)}</span>
            </div>
            <div className="sign">
              <div className="for">For {DAIRY.signName}</div>
              <div className="role">Proprietor</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
