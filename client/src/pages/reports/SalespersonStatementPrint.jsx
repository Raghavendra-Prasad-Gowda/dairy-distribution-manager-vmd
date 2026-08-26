import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import { formatCurrency, getIndiaDateTimeStr, formatDateShortNoYear } from '../../utils/dateUtils';
import { buildDispatchStockSummary } from '../../utils/salespersonProductStatement';

const BUSINESS = 'Vikas Milk Dairy';

function fmtQty(n) {
  if (n == null) return '—';
  return Number.isInteger(n) ? n : n.toFixed(2);
}

export default function SalespersonStatementPrint() {
  const [params]     = useSearchParams();
  const from         = params.get('from')         ?? '';
  const to           = params.get('to')           ?? '';
  const salespersonId = params.get('salespersonId') ?? '';
  // 'balance' (default) prints the existing opening/given/collected/due
  // statement; 'dispatch' prints the Brand → Category → Product Dispatch
  // Stock Summary — mirrors SalespersonStatement.jsx's view switcher.
  const type          = params.get('type') === 'dispatch' ? 'dispatch' : 'balance';

  const [rows, setRows]           = useState(null);
  const [salesperson, setSalesperson] = useState('');
  const [error, setError]         = useState('');

  useEffect(() => {
    Promise.all([
      api.get(`/reports/salesperson-statement?salespersonId=${salespersonId}&from=${from}&to=${to}`),
      api.get('/salespeople'),
    ]).then(([stmtRes, spRes]) => {
      setRows(stmtRes.data.data);
      const sp = spRes.data.data?.find(s => String(s.id) === String(salespersonId));
      if (sp) setSalesperson(sp.route ? `${sp.name} — ${sp.route}` : sp.name);
    }).catch(() => setError('Failed to load report'));
  }, [salespersonId, from, to]);

  useEffect(() => {
    if (rows) setTimeout(() => window.print(), 400);
  }, [rows]);

  const dateLabel = from === to ? from : `${from} to ${to}`;
  const printedAt = getIndiaDateTimeStr();
  const totalGiven     = rows?.reduce((s, r) => s + r.stockGiven, 0) ?? 0;
  const totalCollected = rows?.reduce((s, r) => s + r.amountPaid, 0) ?? 0;
  const closing         = rows?.length ? rows[rows.length - 1].closingBalance : 0;

  const summary = type === 'dispatch' ? buildDispatchStockSummary(rows ?? []) : null;

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; background: #fff; }
        @media print {
          @page { margin: 12mm 14mm; size: A4 portrait; }
          body { font-size: 9.5px; }
          .no-print { display: none !important; }
        }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f3f4f6; font-size: 9px; font-weight: 700; text-transform: uppercase;
             letter-spacing: 0.05em; padding: 6px 8px; border: 1px solid #d1d5db; }
        td { padding: 5px 8px; border: 1px solid #e5e7eb; vertical-align: middle; }
        tr:nth-child(even) td { background: #f9fafb; }
        .brand-row td { background: #374151 !important; color: #fff; font-weight: 700;
                        font-size: 10px; border-color: #4b5563; }
        .cat-row td   { background: #f0f0f0 !important; font-weight: 700; color: #374151;
                        font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; border-color: #d1d5db; }
        .total-row td { background: #1e293b !important; color: #fff; font-weight: 700; border-color: #334155; }
        .balance-owing td { background: #fef2f2 !important; }
        .balance-clear td { background: #f0fdf4 !important; }
        .balance-credit td { background: #f5f3ff !important; }
        .right { text-align: right; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
        .title  { font-size: 16px; font-weight: 700; margin-bottom: 2px; }
        .sub    { font-size: 11px; color: #6b7280; }
        .meta   { text-align: right; font-size: 11px; line-height: 1.7; }
        .meta strong { font-weight: 700; }
        hr { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
        .print-btn { position: fixed; top: 12px; right: 16px; background: #059669; color: #fff;
                     border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px;
                     font-weight: 600; cursor: pointer; }
        .print-btn:hover { background: #047857; }
      `}</style>

      <button className="no-print print-btn" onClick={() => window.print()}>Print / Save PDF</button>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px' }}>

        <div className="header">
          <div>
            <div className="title">{type === 'dispatch' ? 'Dispatch Stock Summary' : 'Salesperson Statement'}</div>
            <div className="sub">{BUSINESS}{salesperson ? ` — ${salesperson}` : ''}</div>
            <div className="sub">{dateLabel}</div>
          </div>
          <div className="meta">
            {type === 'dispatch' ? (
              <>
                <div>Total Quantity: <strong>{fmtQty(summary?.totalQty)}</strong></div>
                <div>Total Amount: <strong>{formatCurrency(summary?.totalValue)}</strong></div>
              </>
            ) : (
              <>
                <div>Total Given: <strong>{formatCurrency(totalGiven)}</strong></div>
                <div>Total Collected: <strong>{formatCurrency(totalCollected)}</strong></div>
                <div>
                  Closing Balance:{' '}
                  <strong style={{ color: closing > 0 ? '#dc2626' : closing < 0 ? '#7c3aed' : '#059669' }}>
                    {formatCurrency(closing)}
                  </strong>
                </div>
              </>
            )}
          </div>
        </div>
        <hr />

        {error && <p style={{ color: 'red', padding: 12 }}>{error}</p>}
        {!rows && !error && <p style={{ padding: 12, color: '#6b7280' }}>Loading…</p>}

        {rows && type === 'dispatch' && (
          summary.brands.length === 0 ? (
            <p style={{ padding: 12, color: '#6b7280' }}>No dispatch data for this period</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', width: '34%' }}>Product</th>
                  <th className="right">Crates</th>
                  <th className="right">Quantity</th>
                  <th className="right">Liters</th>
                  <th className="right">Kgs</th>
                  <th className="right">Total (₹)</th>
                </tr>
              </thead>
              <tbody>
                {summary.brands.map((brand) => {
                  const multiCat = brand.categories.length > 1;
                  return [
                    <tr key={`brand-${brand.brandName}`} className="brand-row">
                      <td>
                        {brand.brandName}&nbsp;
                        <span style={{ fontWeight: 400, fontSize: 9, opacity: 0.8 }}>
                          ({brand.categories.reduce((s, c) => s + c.products.length, 0)} items)
                        </span>
                      </td>
                      <td className="right">{fmtQty(brand.totalCrates)}</td>
                      <td className="right">{fmtQty(brand.totalQty)}</td>
                      <td className="right">{fmtQty(brand.totalLiters)}</td>
                      <td className="right">{fmtQty(brand.totalKgs)}</td>
                      <td className="right">{formatCurrency(brand.totalValue)}</td>
                    </tr>,

                    ...brand.categories.flatMap((cat) => [
                      multiCat && (
                        <tr key={`cat-${brand.brandName}-${cat.categoryName}`} className="cat-row">
                          <td colSpan={6}>{cat.categoryName}</td>
                        </tr>
                      ),
                      ...cat.products.map((p) => (
                        <tr key={`${brand.brandName}-${cat.categoryName}-${p.productName}`}>
                          <td>{p.productName}</td>
                          <td className="right">{fmtQty(p.totalCrates)}</td>
                          <td className="right">{fmtQty(p.totalQty)}</td>
                          <td className="right">{fmtQty(p.totalLiters)}</td>
                          <td className="right">{fmtQty(p.totalKgs)}</td>
                          <td className="right">{formatCurrency(p.totalValue)}</td>
                        </tr>
                      )),
                    ].filter(Boolean)),
                  ];
                })}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td>GRAND TOTAL</td>
                  <td className="right">{fmtQty(summary.totalCrates)}</td>
                  <td className="right">{fmtQty(summary.totalQty)}</td>
                  <td className="right">{fmtQty(summary.totalLiters)}</td>
                  <td className="right">{fmtQty(summary.totalKgs)}</td>
                  <td className="right">{formatCurrency(summary.totalValue)}</td>
                </tr>
              </tfoot>
            </table>
          )
        )}

        {rows && type === 'balance' && (
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', width: '16%' }}>Date</th>
                <th className="right">Opening (₹)</th>
                <th className="right">Given (₹)</th>
                <th className="right">Collected (₹)</th>
                <th className="right">Due (₹)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const owing  = row.closingBalance > 0;
                const credit = row.closingBalance < 0;
                return (
                  <tr key={i} className={owing ? 'balance-owing' : credit ? 'balance-credit' : 'balance-clear'}>
                    <td>{formatDateShortNoYear(row.date)}</td>
                    <td className="right">{formatCurrency(row.openingBalance)}</td>
                    <td className="right">{formatCurrency(row.stockGiven)}</td>
                    <td className="right">{formatCurrency(row.amountPaid)}</td>
                    <td className="right" style={{ fontWeight: 700, color: owing ? '#dc2626' : credit ? '#7c3aed' : '#059669' }}>
                      {formatCurrency(row.closingBalance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td>TOTAL</td>
                <td />
                <td className="right">{formatCurrency(totalGiven)}</td>
                <td className="right">{formatCurrency(totalCollected)}</td>
                <td className="right" style={{ color: closing > 0 ? '#fca5a5' : closing < 0 ? '#c4b5fd' : '#86efac' }}>
                  {formatCurrency(closing)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#9ca3af' }}>
          <span>{window.location.hostname}</span>
          <span>Printed: {printedAt}</span>
        </div>
      </div>
    </>
  );
}
