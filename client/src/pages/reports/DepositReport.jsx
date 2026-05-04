import React, { useState, useEffect } from 'react';
import { Download, ChevronDown, ChevronRight, Loader2, AlertCircle, Droplets } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import { getFirstDayOfMonth, getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

function exportCSV(data) {
  const lines = [
    ['Date', 'Product', 'Category', 'Qty', 'Size (L)', 'Litres', `₹/Litre`, 'Deposit (₹)'].join(','),
  ];
  for (const row of data.rows) {
    const dateStr = new Date(row.date).toLocaleDateString('en-IN');
    if (row.items.length === 0) {
      lines.push([dateStr, '', '', '', '', '', '', '0'].join(','));
    } else {
      for (const item of row.items) {
        lines.push([
          dateStr, item.productName, item.category,
          item.quantity, item.unitSizeL, item.litres,
          item.depositPerLitre, item.depositAmount,
        ].join(','));
      }
    }
    lines.push(['', '', '', '', '', 'Daily Total', '', row.dailyDeposit].join(','));
  }
  lines.push(['', '', '', '', '', 'TOTAL', '', data.totalDeposit].join(','));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `deposit-report-${data.brandName}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export default function DepositReport() {
  const [brands, setBrands]             = useState([]);
  const [activeBrandId, setActiveBrandId] = useState(null);
  const [from, setFrom]                 = useState(getFirstDayOfMonth());
  const [to, setTo]                     = useState(getIndiaDate());
  const [data, setData]                 = useState(null);
  const [loading, setLoading]           = useState(false);
  const [expanded, setExpanded]         = useState({});

  useEffect(() => {
    api.get('/brands').then(r => {
      const list = r.data.data ?? [];
      setBrands(list);
      if (list.length) setActiveBrandId(list[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeBrandId) return;
    setData(null);
    setExpanded({});
    setLoading(true);
    api.get(`/reports/deposit-summary?brandId=${activeBrandId}&from=${from}&to=${to}`)
      .then(r => setData(r.data.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [activeBrandId, from, to]);

  const toggleRow = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const daysWithDeposit = data?.rows.filter(r => r.dailyDeposit > 0).length ?? 0;
  const avgPerDay       = daysWithDeposit > 0 ? (data.totalDeposit / daysWithDeposit) : 0;

  return (
    <div className="bg-slate-100 min-h-screen pb-8">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800">
        <div className="flex items-center gap-2.5">
          <Droplets size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Deposit Report</h1>
            <p className="text-emerald-300 text-xs">Crate deposit charged per litre over time</p>
          </div>
        </div>
        {data && data.depositEnabled && data.rows.length > 0 && (
          <button
            onClick={() => exportCSV(data)}
            className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
          >
            <Download size={13} /> Export CSV
          </button>
        )}
      </div>

      {/* Brand tabs */}
      {brands.length > 0 && (
        <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={setActiveBrandId} />
      )}

      {/* Date range */}
      <div className="mx-4 mt-4 bg-white rounded-2xl border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">From</label>
          <input
            type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">To</label>
          <input
            type="date" value={to} onChange={e => setTo(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        {data && (
          <span className="text-xs text-slate-400 ml-auto">
            Rate: <span className="font-semibold text-slate-600">₹{data.depositPerLitre}/litre</span>
          </span>
        )}
      </div>

      {/* Deposit not enabled */}
      {!loading && data && !data.depositEnabled && (
        <div className="mx-4 mt-4 bg-white border border-amber-200 rounded-2xl px-5 py-6 flex items-start gap-3">
          <AlertCircle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-slate-800">Deposit not enabled for {data.brandName}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Go to <span className="font-semibold text-emerald-700">Setup → Brands</span> to enable deposit and set the rate.
            </p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 text-emerald-600 animate-spin" />
        </div>
      )}

      {/* Summary cards */}
      {!loading && data && data.depositEnabled && (
        <>
          <div className="mx-4 mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Total Deposit',    value: formatCurrency(data.totalDeposit),     color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
              { label: 'Days with Deposit', value: daysWithDeposit,                      color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200' },
              { label: 'Avg / Active Day', value: formatCurrency(avgPerDay),             color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`rounded-2xl border px-4 py-3 ${bg}`}>
                <p className="text-[11px] text-slate-500 font-medium mb-0.5">{label}</p>
                <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          {data.rows.length === 0 ? (
            <div className="mx-4 mt-4 bg-white rounded-2xl border border-slate-200 px-5 py-10 text-center text-slate-400 text-sm">
              No stock receipts found for this period.
            </div>
          ) : (
            <div className="mx-4 mt-4 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm border-separate border-spacing-0" style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th className="bg-emerald-700 px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600">Date</th>
                    <th className="bg-emerald-700 px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600">Products</th>
                    <th className="bg-emerald-700 px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600">Litres</th>
                    <th className="bg-emerald-700 px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600">Daily Deposit</th>
                    <th className="bg-emerald-700 px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Running Total</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {data.rows.map((row, i) => {
                    const key     = row.date;
                    const isOpen  = expanded[key];
                    const dateStr = new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' });
                    const totalL  = row.items.reduce((s, it) => s + it.litres, 0);
                    const hasDeposit = row.dailyDeposit > 0;

                    return (
                      <React.Fragment key={key}>
                        <tr
                          className={`cursor-pointer transition-colors border-b border-slate-100 ${hasDeposit ? 'hover:bg-emerald-50' : 'hover:bg-slate-50'}`}
                          onClick={() => hasDeposit && toggleRow(key)}
                        >
                          <td className="px-4 py-3 border-r border-slate-100">
                            <div className="flex items-center gap-2">
                              {hasDeposit
                                ? isOpen
                                  ? <ChevronDown size={13} className="text-slate-400 flex-shrink-0" />
                                  : <ChevronRight size={13} className="text-slate-400 flex-shrink-0" />
                                : <span className="w-3.5 flex-shrink-0" />
                              }
                              <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">{dateStr}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 border-r border-slate-100">
                            {hasDeposit ? (
                              <div className="flex flex-wrap gap-1">
                                {row.items.map((it, j) => (
                                  <span key={j} className="text-[11px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
                                    {it.productName}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-300">No qualifying receipts</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right border-r border-slate-100">
                            <span className={`text-xs tabular-nums font-semibold ${hasDeposit ? 'text-slate-600' : 'text-slate-300'}`}>
                              {hasDeposit ? totalL.toFixed(1) + ' L' : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right border-r border-slate-100">
                            <span className={`text-sm font-bold tabular-nums ${hasDeposit ? 'text-emerald-700' : 'text-slate-300'}`}>
                              {hasDeposit ? formatCurrency(row.dailyDeposit) : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-bold tabular-nums text-slate-700">
                              {formatCurrency(row.runningTotal)}
                            </span>
                          </td>
                        </tr>

                        {/* Expanded product breakdown */}
                        {isOpen && (
                          <tr className="bg-emerald-50/60 border-b border-emerald-100">
                            <td colSpan={5} className="px-6 py-3">
                              <div className="space-y-1.5">
                                <div className="grid grid-cols-5 text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2 px-2">
                                  <span className="col-span-2">Product</span>
                                  <span className="text-right">Qty × Size</span>
                                  <span className="text-right">Litres</span>
                                  <span className="text-right">Deposit</span>
                                </div>
                                {row.items.map((it, j) => (
                                  <div key={j} className="grid grid-cols-5 text-xs px-2 py-1 bg-white rounded-lg border border-emerald-100">
                                    <span className="col-span-2 font-semibold text-slate-700">{it.productName}
                                      <span className="ml-1 text-[10px] text-slate-400 font-normal">({it.category})</span>
                                    </span>
                                    <span className="text-right tabular-nums text-slate-500">
                                      {it.quantity} × {it.unitSizeL}L
                                    </span>
                                    <span className="text-right tabular-nums text-slate-600 font-medium">
                                      {it.litres.toFixed(2)} L
                                    </span>
                                    <span className="text-right tabular-nums font-bold text-emerald-700">
                                      {formatCurrency(it.depositAmount)}
                                    </span>
                                  </div>
                                ))}
                                <div className="flex items-center justify-between px-2 pt-1 border-t border-emerald-200">
                                  <span className="text-[11px] font-bold text-emerald-700 uppercase">
                                    Total — {row.items.reduce((s, it) => s + it.litres, 0).toFixed(2)} L × ₹{data.depositPerLitre}/L
                                  </span>
                                  <span className="text-sm font-bold text-emerald-700 tabular-nums">
                                    {formatCurrency(row.dailyDeposit)}
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="bg-emerald-800 px-4 py-3 text-xs font-bold text-white border-r border-emerald-700">
                      TOTAL — {data.rows.length} days
                    </td>
                    <td className="bg-emerald-800 px-4 py-3 text-right border-r border-emerald-700">
                      <span className="text-sm font-bold text-amber-300 tabular-nums">{formatCurrency(data.totalDeposit)}</span>
                    </td>
                    <td className="bg-emerald-800 px-4 py-3 text-right">
                      <span className="text-sm font-bold text-amber-300 tabular-nums">{formatCurrency(data.totalDeposit)}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
