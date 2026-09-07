import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import { formatCurrency, getIndiaDateTimeStr, formatDateShortNoYear } from '../../utils/dateUtils';

const BUSINESS = 'Vikas Milk Dairy';

export default function DairyStatementPrint() {
  const [params]  = useSearchParams();
  const from        = params.get('from')        ?? '';
  const to          = params.get('to')          ?? '';
  const brandId     = params.get('brandId')     ?? '';
  const routeNumber = params.get('routeNumber') ?? '';

  const [rows,  setRows]  = useState(null);
  const [brand, setBrand] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get(`/reports/dairy-statement?brandId=${brandId}&from=${from}&to=${to}`),
      api.get('/brands'),
    ]).then(([stmtRes, brandsRes]) => {
      setRows(stmtRes.data.data);
      const b = brandsRes.data.data?.find(b => String(b.id) === String(brandId));
      if (b) setBrand(b.name);
    }).catch(() => setError('Failed to load report'));
  }, [brandId, from, to]);

  useEffect(() => {
    if (rows) setTimeout(() => window.print(), 400);
  }, [rows]);

  const dateLabel   = from === to ? from : `${from} to ${to}`;
  const printedAt   = getIndiaDateTimeStr();
  const totalBill   = rows?.reduce((s, r) => s + r.stockValue + (r.depositValue ?? 0), 0) ?? 0;
  const totalPaid   = rows?.reduce((s, r) => s + r.amountPaid, 0) ?? 0;
  const closing     = rows?.length ? rows[rows.length - 1].closingBalance : 0;
  // Top-ups ADD to the closing balance, so the printed sheet must show them
  // or its own columns won't reconcile. Column appears only when non-zero.
  const totalTopUp  = rows?.reduce((s, r) => s + Number(r.topUpAmount ?? 0), 0) ?? 0;
  const showTopUp   = totalTopUp !== 0;

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
        .total-row td { background: #1e293b !important; color: #fff; font-weight: 700; border-color: #334155; }
        .balance-owing td { background: #fef2f2 !important; }
        .balance-clear td { background: #f0fdf4 !important; }
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
            <div className="title">Dairy Statement</div>
            <div className="sub">{BUSINESS}{brand ? ` — ${brand}` : ''}</div>
            <div className="sub">{dateLabel}</div>
            {routeNumber && (
              <div className="sub" style={{ fontWeight: 600, color: '#059669' }}>Route: {routeNumber}</div>
            )}
          </div>
          <div className="meta">
            <div>Total Bill: <strong>{formatCurrency(totalBill)}</strong></div>
            <div>Total Paid: <strong>{formatCurrency(totalPaid)}</strong></div>
            <div>Closing Balance: <strong style={{ color: closing > 0 ? '#dc2626' : '#059669' }}>{formatCurrency(closing)}</strong></div>
          </div>
        </div>
        <hr />

        {error && <p style={{ color: 'red', padding: 12 }}>{error}</p>}
        {!rows && !error && <p style={{ padding: 12, color: '#6b7280' }}>Loading…</p>}

        {rows && (
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', width: '16%' }}>Date</th>
                <th className="right">Opening (₹)</th>
                <th className="right">Bill (₹)</th>
                {showTopUp && <th className="right">Old Bal (₹)</th>}
                <th className="right">Paid (₹)</th>
                <th className="right">Closing (₹)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const owing = row.closingBalance > 0;
                return (
                  <tr key={i} className={owing ? 'balance-owing' : 'balance-clear'}>
                    <td>{formatDateShortNoYear(row.date)}</td>
                    <td className="right">{formatCurrency(row.openingBalance)}</td>
                    <td className="right">{formatCurrency(row.stockValue + (row.depositValue ?? 0))}</td>
                    {showTopUp && <td className="right">{formatCurrency(Number(row.topUpAmount ?? 0))}</td>}
                    <td className="right">{formatCurrency(row.amountPaid)}</td>
                    <td className="right" style={{ fontWeight: 700, color: owing ? '#dc2626' : '#059669' }}>
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
                <td className="right">{formatCurrency(totalBill)}</td>
                {showTopUp && <td className="right">{formatCurrency(totalTopUp)}</td>}
                <td className="right">{formatCurrency(totalPaid)}</td>
                <td className="right" style={{ color: closing > 0 ? '#fca5a5' : '#86efac' }}>
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
