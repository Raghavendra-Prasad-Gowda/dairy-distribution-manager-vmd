import React from 'react';
import { formatDateShort } from '../utils/dateUtils';
import { numberToWords } from '../utils/numberToWords';
import { DAIRY, formatAmount, formatRate, formatQty } from '../utils/billDisplay';

/**
 * The bill pad layout itself — masthead, Bill No/PO/M-s fields, the
 * Brand → Product line items and the in-words/signature footer.
 *
 * Used for on-screen viewing: the full print page
 * (pages/reports/BillPrint.jsx, printed via the browser's own print engine)
 * and the Bills tab's preview dialog. The shared PDF (utils/billPdf.js) is
 * drawn independently as native vector text/tables rather than a screenshot
 * of this component — a screenshot-in-a-PDF doesn't zoom or print cleanly —
 * but is kept visually in step with it by hand.
 *
 * Every rule is scoped under `.dm-bill-sheet` (never `body` or a bare `*`)
 * so this is safe to mount inside a page that already has its own global
 * styles without leaking into them.
 */
export default function BillSheet({ bill }) {
  return (
    <div className="dm-bill-sheet">
      <style>{`
        .dm-bill-sheet, .dm-bill-sheet *, .dm-bill-sheet *::before, .dm-bill-sheet *::after {
          box-sizing: border-box; margin: 0; padding: 0;
        }
        .dm-bill-sheet {
          position: relative; z-index: 1;
          font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1a1a6e; background: #fff;
        }
        .dm-bill-sheet .watermark {
          position: absolute; inset: 0; z-index: 0;
          display: flex; align-items: center; justify-content: center;
          pointer-events: none;
        }
        .dm-bill-sheet .watermark span { font-size: 260px; line-height: 1; opacity: 0.14; filter: grayscale(1) contrast(0.85); }
        .dm-bill-sheet .identity { position: relative; z-index: 1; border: 2px solid #1a1a6e; padding: 16px 18px; margin-bottom: 14px; background: #fff; }
        .dm-bill-sheet .toprow { display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; margin-bottom: 6px; }
        .dm-bill-sheet .masthead { text-align: center; }
        .dm-bill-sheet .dairy-name { display: inline-block; border: 2px solid #1a1a6e; padding: 3px 14px; font-size: 22px;
                      font-weight: 700; letter-spacing: 0.14em; }
        .dm-bill-sheet .address { font-size: 10px; margin-top: 4px; }
        .dm-bill-sheet .phones  { font-size: 10px; margin-top: 2px; }
        .dm-bill-sheet .meta { margin: 12px 0 0; font-size: 11px; }
        .dm-bill-sheet .meta-line { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 5px; }
        .dm-bill-sheet .field { flex: 1; display: flex; gap: 4px; align-items: baseline; }
        .dm-bill-sheet .field .value { flex: 1; border-bottom: 1px dotted #1a1a6e; font-weight: 700; padding: 0 3px; min-height: 14px; }
        .dm-bill-sheet table { position: relative; z-index: 1; width: 100%; border-collapse: collapse; }
        .dm-bill-sheet th, .dm-bill-sheet td { border: 1px solid #1a1a6e; padding: 6px 8px; }
        .dm-bill-sheet th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; background: #fff; }
        .dm-bill-sheet .desc { font-weight: 500; }
        .dm-bill-sheet .num  { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .dm-bill-sheet .qty  { width: 90px; }
        .dm-bill-sheet .rate { width: 72px; }
        .dm-bill-sheet .amt  { width: 100px; }
        .dm-bill-sheet .brand-row td { background: #eef0fb; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
        .dm-bill-sheet .product-row td { background: #fff; }
        .dm-bill-sheet .product-row .desc { padding-left: 18px; }
        .dm-bill-sheet .total-label { text-align: right; font-weight: 700; border-left: none; }
        .dm-bill-sheet .total-amt   { font-weight: 700; }
        .dm-bill-sheet .total-label, .dm-bill-sheet .total-amt { background: #fff; }
        .dm-bill-sheet .footer { position: relative; z-index: 1; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 10px; font-size: 10px; }
        .dm-bill-sheet .words { flex: 1; font-size: 9px; line-height: 1.6; }
        .dm-bill-sheet .words .value { border-bottom: 1px dotted #1a1a6e; font-weight: 700; min-height: 14px; padding: 0 3px; }
        .dm-bill-sheet .sign { text-align: center; font-size: 10px; }
        .dm-bill-sheet .sign .for { font-weight: 700; margin-bottom: 26px; }
        .dm-bill-sheet .sign .role { border-top: 1px solid #1a1a6e; padding-top: 2px; }
      `}</style>

      <div className="watermark" aria-hidden="true"><span>🐄</span></div>

      {/* ── Masthead, Bill No / dates / M/s ─────────────────────── */}
      <div className="identity">
        <div className="toprow">
          <span>{DAIRY.proprietor}</span>
          <span>Cash / Credit Bill</span>
        </div>
        <div className="masthead">
          <div className="dairy-name">{DAIRY.name}</div>
          {DAIRY.address && <div className="address">{DAIRY.address}</div>}
          {DAIRY.phones && <div className="phones">☎ {DAIRY.phones}</div>}
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
  );
}
