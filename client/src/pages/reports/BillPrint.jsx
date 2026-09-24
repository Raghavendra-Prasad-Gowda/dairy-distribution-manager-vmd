import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
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

/** "52/ltr" — the Rate/Qty cell, blank when the row has nothing on it. */
function formatRate(line) {
  if (line.rate == null || !line.unit) return '';
  return `${line.rate}/${line.unit}`;
}

/** Quantities print whole where they are whole, 2dp otherwise. */
function formatQty(line) {
  if (line.quantity == null) return '';
  return Number.isInteger(line.quantity) ? String(line.quantity) : line.quantity.toFixed(2);
}

/** Plain grouped figures — the pad writes amounts without a ₹ symbol. */
function formatAmount(n) {
  if (!n) return '';
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * The faint cow watermark the paper pad prints behind its line-item table.
 * A plain inline SVG (not a CSS background-image) so it always renders when
 * printed — "print background graphics" browser settings only suppress CSS
 * backgrounds, never visible foreground vector content like this.
 */
function CowWatermark() {
  return (
    <svg viewBox="0 0 240 160" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {/* Horns — short curved hooks, not straight antennae */}
        <path d="M44,46 Q36,38 40,28 Q46,32 46,40" />
        <path d="M68,44 Q77,37 74,27 Q68,31 67,39" />
        {/* Ears */}
        <ellipse cx="41" cy="53" rx="11" ry="6" transform="rotate(-25 41 53)" />
        <ellipse cx="69" cy="51" rx="11" ry="6" transform="rotate(20 69 51)" />
        {/* Head + snout */}
        <ellipse cx="55" cy="72" rx="27" ry="25" />
        <ellipse cx="29" cy="80" rx="13" ry="10" />
        {/* Body */}
        <ellipse cx="122" cy="96" rx="72" ry="36" />
        {/* Legs */}
        <path d="M75,128 L72,158" />
        <path d="M102,132 L100,160" />
        <path d="M152,132 L154,160" />
        <path d="M178,128 L182,158" />
        {/* Tail */}
        <path d="M190,88 Q210,102 202,132" />
      </g>
      <g fill="currentColor" stroke="none">
        {/* Nostrils + eye */}
        <circle cx="23" cy="78" r="2" />
        <circle cx="23" cy="84" r="2" />
        <circle cx="52" cy="66" r="3" />
        {/* Body patches */}
        <path d="M92,72 Q104,61 118,70 Q122,83 108,90 Q94,86 92,72 Z" />
        <path d="M142,102 Q158,96 169,107 Q163,121 147,117 Q136,111 142,102 Z" />
        <path d="M97,110 Q105,105 112,111 Q109,119 100,117 Q95,114 97,110 Z" />
        {/* Tail tuft */}
        <circle cx="203" cy="135" r="6" />
      </g>
    </svg>
  );
}

export default function BillPrint() {
  const [params] = useSearchParams();
  const id = params.get('id') ?? '';

  const [bill, setBill] = useState(null);
  const [fetchError, setFetchError] = useState('');
  // A missing id is derivable from the URL, so it's computed here rather than
  // pushed into state from the effect below.
  const error = id ? fetchError : 'No bill specified';

  useEffect(() => {
    if (!id) return;
    api.get(`/bills/${id}`)
      .then((r) => setBill(r.data.data))
      .catch((e) => setFetchError(e.response?.data?.error ?? 'Failed to load bill'));
  }, [id]);

  useEffect(() => {
    if (bill) setTimeout(() => window.print(), 400);
  }, [bill]);

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1a1a6e; background: #fff; }
        @media print {
          @page { margin: 10mm; size: A5 portrait; }
          .no-print { display: none !important; }
          /* On screen the sheet is a fixed-width slip centred below the Print
             button; on paper it fills the A5 page box instead — 520px is
             ~137mm, wider than A5 minus margins, and would otherwise be
             scaled down or clipped by the browser. */
          .sheet { max-width: none; width: 100%; margin: 0; }
        }
        /* Top margin clears the fixed Print button, which would otherwise sit
           on top of the "Cash / Credit Bill" line on this narrow sheet. */
        .sheet { max-width: 520px; margin: 56px auto 0; padding: 18px; border: 2px solid #1a1a6e; }
        .toprow { display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; margin-bottom: 6px; }
        .masthead { text-align: center; }
        .dairy-name { display: inline-block; border: 2px solid #1a1a6e; padding: 3px 14px; font-size: 22px;
                      font-weight: 700; letter-spacing: 0.14em; }
        .address { font-size: 10px; margin-top: 4px; }
        .phones  { font-size: 10px; margin-top: 2px; }
        .meta { margin: 12px 0 8px; font-size: 11px; }
        .meta-line { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 5px; }
        .field { flex: 1; display: flex; gap: 4px; align-items: baseline; }
        .field .value { flex: 1; border-bottom: 1px dotted #1a1a6e; font-weight: 700; padding: 0 3px; min-height: 14px; }
        /* Watermark sits behind the table, the same way the pad's printed cow
           does — an absolutely positioned layer under the (borderless-fill)
           table cells, so it shows through the empty space in every row. */
        .table-wrap { position: relative; }
        .watermark {
          position: absolute; inset: 0; z-index: 0;
          display: flex; align-items: center; justify-content: center;
          pointer-events: none;
        }
        .watermark svg { width: 62%; max-width: 260px; height: auto; color: #1a1a6e; opacity: 0.09; }
        table { position: relative; z-index: 1; width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #1a1a6e; padding: 6px 6px; }
        th { font-size: 10px; font-weight: 700; }
        td { height: 26px; }
        .sl   { width: 34px; text-align: center; font-weight: 700; }
        .desc { font-weight: 700; letter-spacing: 0.03em; }
        .num  { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .rate { width: 72px; }
        .qty  { width: 64px; }
        .amt  { width: 96px; }
        .total-label { text-align: right; font-weight: 700; border-left: none; }
        .total-amt   { font-weight: 700; }
        .no-border { border: none; }
        .footer { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 10px; font-size: 10px; }
        .words { flex: 1; }
        .words { font-size: 9px; line-height: 1.6; }
        .words .value { border-bottom: 1px dotted #1a1a6e; font-weight: 700; min-height: 14px; padding: 0 3px; }
        .sign { text-align: center; font-size: 10px; }
        .sign .for { font-weight: 700; margin-bottom: 26px; }
        .sign .role { border-top: 1px solid #1a1a6e; padding-top: 2px; }
        .print-btn { position: fixed; top: 12px; right: 16px; background: #059669; color: #fff;
                     border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px;
                     font-weight: 600; cursor: pointer; }
        .print-btn:hover { background: #047857; }
        .msg { padding: 24px; text-align: center; color: #6b7280; font-family: Arial, sans-serif; }
      `}</style>

      <button className="no-print print-btn" onClick={() => window.print()}>Print / Save PDF</button>

      {error && <p className="msg" style={{ color: '#dc2626' }}>{error}</p>}
      {!bill && !error && <p className="msg">Loading…</p>}

      {bill && (
        <div className="sheet">

          {/* ── Masthead ─────────────────────────────────────────────── */}
          <div className="toprow">
            <span>{DAIRY.proprietor}</span>
            <span>Cash / Credit Bill</span>
          </div>
          <div className="masthead">
            <div className="dairy-name">{DAIRY.name}</div>
            <div className="address">{DAIRY.address}</div>
            <div className="phones">☎ {DAIRY.phones}</div>
          </div>

          {/* ── Bill No / dates / M/s ────────────────────────────────── */}
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

          {/* ── The six printed rows ─────────────────────────────────── */}
          <div className="table-wrap">
            <div className="watermark"><CowWatermark /></div>
            <table>
              <thead>
                <tr>
                  <th className="sl">Sl.<br />No.</th>
                  <th>Description</th>
                  <th className="rate">Rate/Qty.</th>
                  <th className="qty">Qty.</th>
                  <th className="amt">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.lines.map((line, i) => (
                  <tr key={line.label}>
                    <td className="sl">{i + 1}.</td>
                    <td className="desc">{line.label}</td>
                    <td className="num">{formatRate(line)}</td>
                    <td className="num">{formatQty(line)}</td>
                    <td className="num">{formatAmount(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="no-border" colSpan={2}></td>
                  <td className="total-label" colSpan={2}>Total</td>
                  <td className="num total-amt">{formatAmount(bill.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

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
