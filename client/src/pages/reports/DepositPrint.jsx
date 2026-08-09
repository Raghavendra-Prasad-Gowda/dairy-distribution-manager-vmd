import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import { formatCurrency } from '../../utils/dateUtils';

const BUSINESS = 'Vikas Milk Dairy';

export default function DepositPrint() {
  const [params] = useSearchParams();
  const from    = params.get('from') ?? '';
  const to      = params.get('to')   ?? '';
  const brandId = params.get('brandId') ?? '';

  const [data,  setData]  = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/reports/deposit-summary?brandId=${brandId}&from=${from}&to=${to}`)
      .then(r => setData(r.data.data))
      .catch(() => setError('Failed to load report'));
  }, []);

  useEffect(() => {
    if (data) setTimeout(() => window.print(), 400);
  }, [data]);

  const dateLabel = from === to ? from : `${from} to ${to}`;
  const printedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const depositRows = data?.rows.filter(r => r.dailyDeposit > 0) ?? [];
  const daysWithDeposit = depositRows.length;

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
        .date-row td { background: #374151 !important; color: #fff; font-weight: 700;
                       font-size: 10px; border-color: #4b5563; }
        .cat-row td  { background: #f0f0f0 !important; font-weight: 700; color: #374151;
                       font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; border-color: #d1d5db; }
        .total-row td { background: #1e293b !important; color: #fff; font-weight: 700; border-color: #334155; }
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

        {/* Header */}
        <div className="header">
          <div>
            <div className="title">Deposit Report</div>
            <div className="sub">{BUSINESS}{data?.brandName ? ` — ${data.brandName}` : ''}</div>
            <div className="sub">{dateLabel}</div>
          </div>
          <div className="meta">
            <div>Rate: <strong>₹{data?.depositPerLitre ?? '—'}/L</strong></div>
            <div>Days with Deposit: <strong>{daysWithDeposit}</strong></div>
            <div>Total Deposit: <strong>{formatCurrency(data?.totalDeposit ?? 0)}</strong></div>
          </div>
        </div>
        <hr />

        {error && <p style={{ color: 'red', padding: 12 }}>{error}</p>}
        {!data && !error && <p style={{ padding: 12, color: '#6b7280' }}>Loading…</p>}

        {data && !data.depositEnabled && (
          <p style={{ padding: 12, color: '#b45309' }}>Deposit is not enabled for this brand.</p>
        )}

        {data && data.depositEnabled && (
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', width: '18%' }}>Date</th>
                <th style={{ textAlign: 'left', width: '28%' }}>Product</th>
                <th className="right">Qty</th>
                <th className="right">L / Kg</th>
                <th className="right">Deposit (₹)</th>
                <th className="right">Running Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              {data.openingDeposit > 0 && (
                <tr>
                  <td colSpan={5} style={{ fontStyle: 'italic', color: '#6b7280' }}>
                    Opening deposit carried forward (before {from})
                  </td>
                  <td className="right">{formatCurrency(data.openingDeposit)}</td>
                </tr>
              )}
              {data.rows.map(row => {
                const dateStr    = new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', weekday: 'short' });
                const hasDeposit = row.dailyDeposit > 0;

                if (!hasDeposit) {
                  return (
                    <tr key={row.date}>
                      <td>{dateStr}</td>
                      <td colSpan={4} style={{ color: '#9ca3af', fontStyle: 'italic' }}>No qualifying receipts</td>
                      <td className="right">{formatCurrency(row.runningTotal)}</td>
                    </tr>
                  );
                }

                // Group items by category
                const catGroups = [];
                const catSeen   = new Map();
                for (const it of row.items) {
                  if (!catSeen.has(it.category)) {
                    catSeen.set(it.category, []);
                    catGroups.push({ category: it.category, items: catSeen.get(it.category) });
                  }
                  catSeen.get(it.category).push(it);
                }
                const multiCat = catGroups.length > 1;

                return [
                  // Date summary row
                  <tr key={`${row.date}-hdr`} className="date-row">
                    <td colSpan={4}>{dateStr}&nbsp;<span style={{ fontWeight: 400, fontSize: 9, opacity: 0.8 }}>({row.items.length} product{row.items.length !== 1 ? 's' : ''})</span></td>
                    <td className="right">{formatCurrency(row.dailyDeposit)}</td>
                    <td className="right">{formatCurrency(row.runningTotal)}</td>
                  </tr>,

                  ...catGroups.flatMap(({ category, items: catItems }) => [
                    multiCat && (
                      <tr key={`${row.date}-cat-${category}`} className="cat-row">
                        <td colSpan={6}>{category}</td>
                      </tr>
                    ),
                    ...catItems.map((it, idx) => {
                      if (it.isTopUp) {
                        return (
                          <tr key={`${row.date}-${category}-${idx}`}>
                            <td />
                            <td colSpan={2}>
                              {it.productName}
                              {(it.notes || it.createdBy) && (
                                <span style={{ fontSize: 9, color: '#9ca3af' }}>
                                  {' '}({[it.notes, it.createdBy && `by ${it.createdBy}`].filter(Boolean).join(' · ')})
                                </span>
                              )}
                            </td>
                            <td className="right">—</td>
                            <td className="right">{formatCurrency(it.depositAmount)}</td>
                            <td />
                          </tr>
                        );
                      }
                      const unit    = it.unitType === 'gram' ? 'kg' : 'L';
                      const sizeStr = it.unitType === 'gram' ? `${it.unitSize}g` : `${it.unitSize}ml`;
                      return (
                        <tr key={`${row.date}-${category}-${idx}`}>
                          <td />
                          <td>{it.productName} <span style={{ fontSize: 9, color: '#9ca3af' }}>{sizeStr}</span></td>
                          <td className="right">{it.quantity}</td>
                          <td className="right">{it.volumeOrWeight.toFixed(2)} {unit}</td>
                          <td className="right">{formatCurrency(it.depositAmount)}</td>
                          <td />
                        </tr>
                      );
                    }),
                  ].filter(Boolean)),
                ];
              })}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td colSpan={4}>GRAND TOTAL — {daysWithDeposit} days with deposit</td>
                <td className="right">{formatCurrency(data.totalDeposit)}</td>
                <td className="right">{formatCurrency(data.totalDeposit)}</td>
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
