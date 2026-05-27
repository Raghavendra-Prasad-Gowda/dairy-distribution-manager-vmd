import { useEffect, useState } from 'react';
import { Download, AlertCircle, Droplets, ChevronDown, ChevronRight, Printer } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import BrandedLoader from '../../components/ui/BrandedLoader';
import { getYesterday, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

function exportCSV(data) {
  const lines = [
    ['Date', 'Product', 'Category', 'Qty', 'Size', 'L / kg', `₹/unit`, 'Deposit (₹)', 'Running Total (₹)'].join(','),
  ];
  let running = 0;
  for (const row of data.rows) {
    const dateStr = new Date(row.date).toLocaleDateString('en-IN');
    if (row.items.length === 0) {
      lines.push([dateStr, '—', '—', '', '', '', '', '0', running].join(','));
    } else {
      row.items.forEach((item, i) => {
        const sizeStr = item.unitType === 'gram' ? `${item.unitSize}g` : `${item.unitSize}ml`;
        running += i === row.items.length - 1 ? row.dailyDeposit : 0;
        lines.push([
          i === 0 ? dateStr : '',
          item.productName, item.category,
          item.quantity, sizeStr,
          item.volumeOrWeight, item.depositPerLitre, item.depositAmount,
          i === row.items.length - 1 ? running : '',
        ].join(','));
      });
    }
  }
  lines.push(['', 'TOTAL', '', '', '', '', '', data.totalDeposit, ''].join(','));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `deposit-report-${data.brandName}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export default function DepositReport({ shellActiveBrandId, shellBrands } = {}) {
  const inShell = shellActiveBrandId != null;
  const [brands, setBrands]               = useState(shellBrands ?? []);
  const [activeBrandId, setActiveBrandId] = useState(shellActiveBrandId ?? null);
  const [from, setFrom]                   = useState(getYesterday());
  const [to, setTo]                       = useState(getYesterday());
  const [data, setData]                   = useState(null);
  const [loading, setLoading]             = useState(false);
  const [collapsed, setCollapsed]         = useState(new Set());

  useEffect(() => {
    if (inShell) return;
    api.get('/brands').then(r => {
      const list = r.data.data ?? [];
      setBrands(list);
      if (list.length) setActiveBrandId(list[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (inShell) { setActiveBrandId(shellActiveBrandId); setBrands(shellBrands ?? []); }
  }, [shellActiveBrandId]);

  useEffect(() => {
    if (!activeBrandId) return;
    setData(null);
    setCollapsed(new Set());
    setLoading(true);
    api.get(`/reports/deposit-summary?brandId=${activeBrandId}&from=${from}&to=${to}`)
      .then(r => {
        const d = r.data.data;
        setData(d);
        // Collapse all by default when viewing more than one day
        if (from !== to) {
          setCollapsed(new Set((d?.rows ?? []).filter(r => r.dailyDeposit > 0).map(r => r.date)));
        }
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [activeBrandId, from, to]);

  const daysWithDeposit = data?.rows.filter(r => r.dailyDeposit > 0).length ?? 0;
  const avgPerDay       = daysWithDeposit > 0 ? (data.totalDeposit / daysWithDeposit) : 0;

  const depositRows     = data?.rows.filter(r => r.dailyDeposit > 0) ?? [];
  const allCollapsed    = depositRows.length > 0 && depositRows.every(r => collapsed.has(r.date));

  function toggleRow(dateKey) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(dateKey) ? next.delete(dateKey) : next.add(dateKey);
      return next;
    });
  }

  function collapseAll() {
    setCollapsed(new Set(depositRows.map(r => r.date)));
  }

  function expandAll() {
    setCollapsed(new Set());
  }

  return (
    <div className={inShell ? 'h-full overflow-y-auto bg-slate-100 pb-8' : 'bg-slate-100 min-h-screen pb-8'}>

      {/* Header — hidden in shell mode */}
      {!inShell && (
        <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800">
          <div className="flex items-center gap-2.5">
            <Droplets size={17} className="text-emerald-300 flex-shrink-0" />
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">Deposit Report</h1>
              <p className="text-emerald-300 text-xs">Deposit per litre over time</p>
            </div>
          </div>
          {data && data.depositEnabled && data.rows.some(r => r.dailyDeposit > 0) && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportCSV(data)}
                className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
              >
                <Download size={13} /> Export CSV
              </button>
              <button
                onClick={() => window.open(`/print/deposit?brandId=${activeBrandId}&from=${from}&to=${to}`, '_blank')}
                className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
              >
                <Printer size={13} /> Print
              </button>
            </div>
          )}
        </div>
      )}

      {/* Brand tabs — hidden in shell mode */}
      {!inShell && brands.length > 0 && (
        <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={setActiveBrandId} />
      )}

      {/* Date range */}
      <div className="mx-4 mt-4 bg-white rounded-2xl border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        {data && (
          <span className="text-xs text-slate-400 ml-auto">
            Rate: <span className="font-semibold text-slate-600">₹{data.depositPerLitre}/L</span>
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
      {loading && <BrandedLoader />}

      {/* Summary cards */}
      {!loading && data && data.depositEnabled && (
        <>
          <div className="mx-4 mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Total Deposit',     value: formatCurrency(data.totalDeposit), color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
              { label: 'Days with Deposit', value: daysWithDeposit,                   color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200' },
              { label: 'Avg / Active Day',  value: formatCurrency(avgPerDay),         color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200' },
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
              {/* Expand / Collapse all */}
              {depositRows.length > 0 && (
                <div className="flex justify-end px-3 py-2 border-b border-slate-100 bg-slate-50">
                  <button
                    onClick={allCollapsed ? expandAll : collapseAll}
                    className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 transition"
                  >
                    {allCollapsed
                      ? <><ChevronDown size={13} /> Expand All</>
                      : <><ChevronRight size={13} /> Collapse All</>
                    }
                  </button>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-separate border-spacing-0" style={{ minWidth: 520 }}>
                      <thead className="sticky top-0 z-10">
                        <tr>
                          <th className="bg-emerald-700 px-3 py-3 text-left text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 whitespace-nowrap">Date</th>
                          <th className="bg-emerald-700 px-3 py-3 text-left text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600">Product</th>
                          <th className="bg-emerald-700 px-3 py-3 text-right text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 whitespace-nowrap">Qty</th>
                          <th className="bg-emerald-700 px-3 py-3 text-right text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 whitespace-nowrap">L / Kg</th>
                          <th className="bg-emerald-700 px-3 py-3 text-right text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 whitespace-nowrap">Deposit</th>
                          <th className="bg-emerald-700 px-3 py-3 text-right text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap">Running Total</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {data.rows.map((row) => {
                          const dateKey    = row.date;
                          const dateStr    = new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', weekday: 'short' });
                          const hasDeposit = row.dailyDeposit > 0;
                          const isCollapsed = collapsed.has(dateKey);

                          if (!hasDeposit) {
                            return (
                              <tr key={dateKey} className="border-b border-slate-100">
                                <td className="px-3 py-2.5 border-r border-slate-100">
                                  <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">{dateStr}</span>
                                </td>
                                <td colSpan={4} className="px-3 py-2.5 border-r border-slate-100">
                                  <span className="text-xs text-slate-300 italic">No qualifying receipts</span>
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  <span className="text-xs tabular-nums text-slate-400">{formatCurrency(row.runningTotal)}</span>
                                </td>
                              </tr>
                            );
                          }

                          // Summary row (always shown for deposit days)
                          const summaryRow = (
                            <tr
                              key={`${dateKey}-summary`}
                              className="border-b border-slate-100 cursor-pointer hover:bg-emerald-50/30 transition-colors"
                              onClick={() => toggleRow(dateKey)}
                            >
                              <td className="px-3 py-2.5 border-r border-slate-100 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  {isCollapsed
                                    ? <ChevronRight size={13} className="text-slate-400 flex-shrink-0" />
                                    : <ChevronDown  size={13} className="text-slate-400 flex-shrink-0" />
                                  }
                                  <span className="text-xs font-bold text-slate-700">{dateStr}</span>
                                </div>
                              </td>
                              <td colSpan={3} className="px-3 py-2.5 border-r border-slate-100">
                                {isCollapsed && (
                                  <span className="text-xs text-slate-400">
                                    {row.items.length} product{row.items.length !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right border-r border-slate-100">
                                <span className="text-xs tabular-nums font-bold text-emerald-700">{formatCurrency(row.dailyDeposit)}</span>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className="text-sm tabular-nums font-bold text-slate-700">{formatCurrency(row.runningTotal)}</span>
                              </td>
                            </tr>
                          );

                          if (isCollapsed) return summaryRow;

                          // Group items by category (order preserved from backend sort)
                          const catGroups = [];
                          const catSeen = new Map();
                          for (const it of row.items) {
                            if (!catSeen.has(it.category)) {
                              catSeen.set(it.category, []);
                              catGroups.push({ category: it.category, items: catSeen.get(it.category) });
                            }
                            catSeen.get(it.category).push(it);
                          }

                          let globalIdx = 0;
                          return [
                            summaryRow,
                            ...catGroups.map(({ category, items: catItems }) => (
                              [
                                <tr key={`${dateKey}-cat-${category}`} className="border-b border-slate-50">
                                  <td className="px-3 py-1 border-r border-slate-100 whitespace-nowrap" />
                                  <td colSpan={5} className="px-3 py-1 bg-slate-50">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{category}</span>
                                  </td>
                                </tr>,
                                ...catItems.map((it) => {
                                  const localIdx = globalIdx++;
                                  const unit    = it.unitType === 'gram' ? 'kg' : 'L';
                                  const sizeStr = it.unitType === 'gram' ? `${it.unitSize}g` : `${it.unitSize}ml`;
                                  const volCell = <span className="text-xs tabular-nums font-medium text-slate-700">{it.volumeOrWeight.toFixed(2)} {unit}</span>;

                                  return (
                                    <tr key={`${dateKey}-${localIdx}`} className="border-b border-slate-50 hover:bg-emerald-50/40 transition-colors">
                                      <td className="px-3 py-2 border-r border-slate-100 whitespace-nowrap" />
                                      <td className="px-3 py-2 border-r border-slate-100">
                                        <span className="text-xs font-semibold text-slate-800">{it.productName}</span>
                                        <span className="ml-1.5 text-[10px] text-slate-400">{sizeStr}</span>
                                      </td>
                                      <td className="px-3 py-2 text-right border-r border-slate-100">
                                        <span className="text-xs tabular-nums text-slate-600">{it.quantity}</span>
                                      </td>
                                      <td className="px-3 py-2 text-right border-r border-slate-100">
                                        {volCell}
                                      </td>
                                      <td className="px-3 py-2 text-right border-r border-slate-100">
                                        <span className="text-xs tabular-nums font-bold text-emerald-700">{formatCurrency(it.depositAmount)}</span>
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        <span className="text-xs text-slate-200">—</span>
                                      </td>
                                    </tr>
                                  );
                                }),
                              ]
                            )),
                          ];
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={4} className="bg-emerald-800 px-3 py-3 text-xs font-bold text-white border-r border-emerald-700">
                            TOTAL — {daysWithDeposit} days with deposit
                          </td>
                          <td className="bg-emerald-800 px-3 py-3 text-right border-r border-emerald-700">
                            <span className="text-sm font-bold text-amber-300 tabular-nums">{formatCurrency(data.totalDeposit)}</span>
                          </td>
                          <td className="bg-emerald-800 px-3 py-3 text-right">
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
