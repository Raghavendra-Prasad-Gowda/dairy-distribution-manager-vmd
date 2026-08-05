import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

const BUSINESS = 'Vikas Milk Dairy';

export default function MyStatementPrint() {
  const [params]   = useSearchParams();
  const from       = params.get('from') ?? '';
  const to         = params.get('to')   ?? '';
  const { user }   = useAuth();

  const [rows, setRows]   = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/salesperson-statement/me?from=${from}&to=${to}`)
      .then(r => setRows(r.data.data))
      .catch(() => setError('Failed to load statement'));
  }, []);

  useEffect(() => {
    if (rows) setTimeout(() => window.print(), 400);
  }, [rows]);

  const spName         = user?.salespersonName ?? '';
  const dateLabel      = from === to ? from : `${from} to ${to}`;
  const printedAt      = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const totalGiven     = rows?.reduce((s, r) => s + r.stockGiven, 0) ?? 0;
  const totalCollected = rows?.reduce((s, r) => s + r.amountPaid, 0) ?? 0;
  const closing        = rows?.length ? rows[rows.length - 1].closingBalance : 0;

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
        .balance-owing  td { background: #fef2f2 !important; }
        .balance-clear  td { background: #f0fdf4 !important; }
        .balance-credit td { background: #f5f3ff !important; }
        .right  { text-align: right; }
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

      <button className="no-print print-btn" onClick={() => window.print()}>
        Print / Save PDF
      </button>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px' }}>

        <div className="header">
          <div>
            <div className="title">My Account Statement</div>
            <div className="sub">{BUSINESS}{spName ? ` — ${spName}` : ''}</div>
            <div className="sub">{dateLabel}</div>
          </div>
          <div className="meta">
            <div>Total Billed: <strong>{formatCurrency(totalGiven)}</strong></div>
            <div>Total Paid: <strong>{formatCurrency(totalCollected)}</strong></div>
            <div>
              Balance:{' '}
              <strong style={{ color: closing > 0 ? '#dc2626' : closing < 0 ? '#7c3aed' : '#059669' }}>
                {formatCurrency(closing)}
              </strong>
            </div>
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
                <th className="right">Billed (₹)</th>
                <th className="right">Paid (₹)</th>
                <th className="right">Balance (₹)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const owing  = row.closingBalance > 0;
                const credit = row.closingBalance < 0;
                return (
                  <tr key={i} className={owing ? 'balance-owing' : credit ? 'balance-credit' : 'balance-clear'}>
                    <td>
                      {new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </td>
                    <td className="right">{formatCurrency(row.openingBalance)}</td>
                    <td className="right">{formatCurrency(row.stockGiven)}</td>
                    <td className="right">{formatCurrency(row.amountPaid)}</td>
                    <td
                      className="right"
                      style={{
                        fontWeight: 700,
                        color: owing ? '#dc2626' : credit ? '#7c3aed' : '#059669',
                      }}
                    >
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
                <td
                  className="right"
                  style={{ color: closing > 0 ? '#fca5a5' : closing < 0 ? '#c4b5fd' : '#86efac' }}
                >
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
