import { useState, useEffect, useMemo } from 'react';
import { Loader2, AlertCircle, Package, Truck, ChevronDown, ChevronRight } from 'lucide-react';
import { getIndiaDate, getFirstDayOfMonth, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

const ROUTE_COLORS = [
  { bg: 'bg-sky-100',     text: 'text-sky-700'     },
  { bg: 'bg-violet-100',  text: 'text-violet-700'  },
  { bg: 'bg-amber-100',   text: 'text-amber-700'   },
  { bg: 'bg-rose-100',    text: 'text-rose-700'    },
  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
];

function DayRow({ row, multiBrand }) {
  const [open, setOpen] = useState(false);
  const hasRoutes = row.receipts.some(r => r.routeNumber);
  const routeNames = [...new Set(row.receipts.map(r => r.routeNumber).filter(Boolean))];
  const routeColorIdx = new Map(routeNames.map((n, i) => [n, i]));
  const dateStr = new Date(row.date + 'T00:00:00').toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', weekday: 'short',
  });

  return (
    <>
      {/* Summary row — always visible, click to expand */}
      <tr
        className="cursor-pointer hover:bg-slate-50/60 transition-colors border-b border-slate-100"
        onClick={() => setOpen(v => !v)}
      >
        <td className="px-4 py-2.5 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {open
              ? <ChevronDown  size={13} className="text-slate-400 flex-shrink-0" />
              : <ChevronRight size={13} className="text-slate-400 flex-shrink-0" />}
            <span className="text-xs font-bold text-slate-700">{dateStr}</span>
          </div>
        </td>
        <td className="px-4 py-2.5">
          {!open && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {row.receipts.length > 0 && (
                <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full tabular-nums">
                  Rcvd {row.receipts.length} item{row.receipts.length !== 1 ? 's' : ''}
                </span>
              )}
              {row.dispatches.length > 0 && (
                <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full tabular-nums">
                  {row.dispatches.length} salesperson{row.dispatches.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </td>
        <td className="px-4 py-2.5 text-right whitespace-nowrap">
          {row.totalReceived > 0
            ? <span className="text-xs font-bold text-blue-700 tabular-nums">{formatCurrency(row.totalReceived)}</span>
            : <span className="text-xs text-slate-300">—</span>}
        </td>
        <td className="px-4 py-2.5 text-right whitespace-nowrap">
          {row.totalDispatched > 0
            ? <span className="text-xs font-bold text-emerald-700 tabular-nums">{formatCurrency(row.totalDispatched)}</span>
            : <span className="text-xs text-slate-300">—</span>}
        </td>
      </tr>

      {/* Expanded detail */}
      {open && (
        <tr>
          <td colSpan={4} className="px-4 py-3 bg-slate-50/60 border-b border-slate-100">
            <div className="space-y-4">

              {/* Receipts */}
              {row.receipts.length > 0 ? (
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-bold text-slate-600 mb-2">
                    <Package size={12} className="text-blue-500" /> Stock Received
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="bg-blue-50 border-b border-blue-200">
                          {multiBrand && <th className="px-3 py-2 text-left text-[11px] font-bold text-blue-700 uppercase tracking-wider">Brand</th>}
                          {hasRoutes  && <th className="px-3 py-2 text-left text-[11px] font-bold text-blue-700 uppercase tracking-wider">Route</th>}
                          <th className="px-3 py-2 text-left text-[11px] font-bold text-blue-700 uppercase tracking-wider">Product</th>
                          <th className="px-3 py-2 text-right text-[11px] font-bold text-blue-700 uppercase tracking-wider">Qty</th>
                          <th className="px-3 py-2 text-right text-[11px] font-bold text-blue-700 uppercase tracking-wider">Price</th>
                          <th className="px-3 py-2 text-right text-[11px] font-bold text-blue-700 uppercase tracking-wider">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {row.receipts.map((r, i) => (
                          <tr key={i} className="hover:bg-blue-50/40">
                            {multiBrand && <td className="px-3 py-2 text-slate-400">{r.brandName}</td>}
                            {hasRoutes && (
                              <td className="px-3 py-2">
                                {r.routeNumber ? (() => {
                                  const c = ROUTE_COLORS[routeColorIdx.get(r.routeNumber) % ROUTE_COLORS.length];
                                  return <span className={`font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>{r.routeNumber}</span>;
                                })() : <span className="text-slate-300">—</span>}
                              </td>
                            )}
                            <td className="px-3 py-2 font-medium text-slate-800">{r.productName}</td>
                            <td className="px-3 py-2 text-right text-slate-600 tabular-nums">{r.quantity}</td>
                            <td className="px-3 py-2 text-right text-slate-400 tabular-nums">₹{r.unitPrice}</td>
                            <td className="px-3 py-2 text-right font-semibold text-blue-700 tabular-nums">{formatCurrency(r.amount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-blue-50 border-t-2 border-blue-200">
                          <td colSpan={2 + (multiBrand ? 1 : 0) + (hasRoutes ? 1 : 0)} className="px-3 py-1.5 text-right text-[10px] font-bold text-blue-500 uppercase tracking-wider">Total Received</td>
                          <td className="px-3 py-1.5 text-right font-extrabold text-blue-700 tabular-nums">{formatCurrency(row.totalReceived)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No receipts for this date</p>
              )}

              {/* Dispatches */}
              {row.dispatches.length > 0 ? (
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-bold text-slate-600 mb-2">
                    <Truck size={12} className="text-emerald-500" /> Dispatched to Salespeople
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="bg-emerald-50 border-b border-emerald-200">
                          <th className="px-3 py-2 text-left text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Salesperson</th>
                          {multiBrand && <th className="px-3 py-2 text-left text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Brand</th>}
                          <th className="px-3 py-2 text-left text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Product</th>
                          <th className="px-3 py-2 text-right text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Qty</th>
                          <th className="px-3 py-2 text-right text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Price</th>
                          <th className="px-3 py-2 text-right text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {row.dispatches.map((d, di) => (
                          <>
                            {d.items.map((item, ii) => (
                              <tr key={`${di}-${ii}`} className="hover:bg-emerald-50/40">
                                <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">
                                  {ii === 0 ? d.salespersonName : ''}
                                </td>
                                {multiBrand && <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{item.brandName}</td>}
                                <td className="px-3 py-2 text-slate-700">{item.productName}</td>
                                <td className="px-3 py-2 text-right text-slate-600 tabular-nums">{item.quantity}</td>
                                <td className="px-3 py-2 text-right text-slate-400 tabular-nums">₹{item.unitPrice}</td>
                                <td className="px-3 py-2 text-right font-semibold text-emerald-700 tabular-nums">{formatCurrency(item.totalAmount)}</td>
                              </tr>
                            ))}
                            <tr className="bg-emerald-50 border-t border-emerald-100">
                              <td colSpan={2 + (multiBrand ? 1 : 0) + 2} className="px-3 py-1 text-right text-[10px] font-semibold text-emerald-600">
                                {d.salespersonName} total
                              </td>
                              <td className="px-3 py-1 text-right font-bold text-emerald-700 tabular-nums">{formatCurrency(d.totalAmount)}</td>
                            </tr>
                          </>
                        ))}
                        <tr className="bg-emerald-700 border-t-2 border-emerald-500">
                          <td colSpan={2 + (multiBrand ? 1 : 0) + 2} className="px-3 py-1.5 text-right text-[10px] font-bold text-emerald-200 uppercase tracking-wider">Total Dispatched</td>
                          <td className="px-3 py-1.5 text-right font-extrabold text-white tabular-nums">{formatCurrency(row.totalDispatched)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No dispatches for this date</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function StockSummary({ shellActiveBrandId, inShell } = {}) {
  const isShell = inShell || shellActiveBrandId != null;
  const [from, setFrom]       = useState(getFirstDayOfMonth());
  const [to, setTo]           = useState(getIndiaDate());
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => { fetchSummary(); }, [from, to, shellActiveBrandId]);

  async function fetchSummary() {
    setLoading(true); setError('');
    try {
      const brandParam = shellActiveBrandId ? `&brandId=${shellActiveBrandId}` : '';
      const r = await api.get(`/reports/stock-summary?from=${from}&to=${to}${brandParam}`);
      setData(r.data.data);
    } catch (e) {
      setError(e.response?.data?.error ?? 'Failed to load summary');
    } finally {
      setLoading(false);
    }
  }

  const multiBrand = !shellActiveBrandId;

  // Aggregate per-product totals across the selected date range
  const productSummary = useMemo(() => {
    if (!data?.rows) return [];

    // brandName → productName → running totals
    const brandMap = new Map();
    const ensure = (brand, product) => {
      if (!brandMap.has(brand)) brandMap.set(brand, new Map());
      const pm = brandMap.get(brand);
      if (!pm.has(product)) pm.set(product, { receivedQty: 0, receivedValue: 0, dispatchedQty: 0, dispatchedValue: 0 });
      return pm.get(product);
    };

    for (const row of data.rows) {
      for (const r of row.receipts) {
        const p = ensure(r.brandName, r.productName);
        p.receivedQty   += r.quantity;
        p.receivedValue += r.amount;
      }
      for (const d of row.dispatches) {
        for (const item of d.items) {
          const p = ensure(item.brandName, item.productName);
          p.dispatchedQty   += item.quantity;
          p.dispatchedValue += item.totalAmount;
        }
      }
    }

    return Array.from(brandMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([brandName, pm]) => {
        const products = Array.from(pm.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([productName, t]) => ({ productName, ...t, remainingQty: t.receivedQty - t.dispatchedQty }));
        return {
          brandName,
          products,
          totalReceivedQty:   products.reduce((s, p) => s + p.receivedQty,   0),
          totalReceivedValue: products.reduce((s, p) => s + p.receivedValue,  0),
          totalDispatchedQty: products.reduce((s, p) => s + p.dispatchedQty,  0),
          totalDispatchedValue: products.reduce((s, p) => s + p.dispatchedValue, 0),
          totalRemaining:     products.reduce((s, p) => s + p.remainingQty,  0),
        };
      });
  }, [data]);

  return (
    <div className="flex flex-col h-full">

      {/* Page header — hidden in shell mode */}
      {!isShell && (
        <div className="flex items-center gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
          <Package size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Stock Summary</h1>
            <p className="text-emerald-300 text-xs">Daily stock received vs dispatched</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">

          {/* Date range picker */}
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-4">
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
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              <AlertCircle size={15} className="flex-shrink-0" /> {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
            </div>
          ) : data ? (
            <div className="space-y-4">

              {/* Summary chips */}
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                  <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wide">Total Received</span>
                  <span className="text-sm font-extrabold text-blue-700 tabular-nums">{formatCurrency(data.grandTotalReceived)}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                  <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wide">Total Dispatched</span>
                  <span className="text-sm font-extrabold text-emerald-700 tabular-nums">{formatCurrency(data.grandTotalDispatched)}</span>
                </div>
                <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 border ${
                  data.grandTotalReceived - data.grandTotalDispatched >= 0
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-red-50 border-red-200'
                }`}>
                  <span className={`text-[10px] font-bold uppercase tracking-wide ${
                    data.grandTotalReceived - data.grandTotalDispatched >= 0 ? 'text-slate-500' : 'text-red-500'
                  }`}>Net</span>
                  <span className={`text-sm font-extrabold tabular-nums ${
                    data.grandTotalReceived - data.grandTotalDispatched >= 0 ? 'text-slate-700' : 'text-red-600'
                  }`}>{formatCurrency(data.grandTotalReceived - data.grandTotalDispatched)}</span>
                </div>
              </div>

              {/* Product-level period summary */}
              {productSummary.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-700 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-white">Period Summary</h2>
                      <p className="text-xs text-slate-400">
                        All products — {data.rows.length} day{data.rows.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm border-separate border-spacing-0">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-200">
                          <th className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Product</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-bold text-blue-600 uppercase tracking-wider whitespace-nowrap">Rcvd Qty</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-bold text-blue-600 uppercase tracking-wider whitespace-nowrap">Rcvd (₹)</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-bold text-amber-600 uppercase tracking-wider whitespace-nowrap">Disp Qty</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-bold text-amber-600 uppercase tracking-wider whitespace-nowrap">Disp (₹)</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Remaining</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productSummary.map(brand => (
                          <>
                            {/* Brand header row */}
                            <tr key={brand.brandName} className="bg-emerald-700">
                              <td className="px-4 py-2 text-xs font-bold text-white uppercase tracking-wider">
                                {brand.brandName}
                                <span className="ml-2 font-normal text-emerald-300 normal-case tracking-normal">
                                  {brand.products.length} product{brand.products.length !== 1 ? 's' : ''}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right text-xs font-bold text-blue-200 tabular-nums">{brand.totalReceivedQty}</td>
                              <td className="px-3 py-2 text-right text-xs font-bold text-blue-200 tabular-nums">{formatCurrency(brand.totalReceivedValue)}</td>
                              <td className="px-3 py-2 text-right text-xs font-bold text-amber-200 tabular-nums">{brand.totalDispatchedQty || '—'}</td>
                              <td className="px-3 py-2 text-right text-xs font-bold text-amber-200 tabular-nums">{brand.totalDispatchedValue > 0 ? formatCurrency(brand.totalDispatchedValue) : '—'}</td>
                              <td className={`px-3 py-2 text-right text-xs font-bold tabular-nums ${brand.totalRemaining > 0 ? 'text-emerald-300' : brand.totalRemaining < 0 ? 'text-red-300' : 'text-slate-400'}`}>
                                {brand.totalRemaining}
                              </td>
                            </tr>
                            {/* Product rows */}
                            {brand.products.map((p, idx) => (
                              <tr
                                key={p.productName}
                                className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}
                              >
                                <td className="px-4 py-2.5 pl-7 text-sm font-medium text-slate-800">{p.productName}</td>
                                <td className="px-3 py-2.5 text-right font-bold text-blue-700 tabular-nums">{p.receivedQty}</td>
                                <td className="px-3 py-2.5 text-right text-blue-600 tabular-nums">{formatCurrency(p.receivedValue)}</td>
                                <td className="px-3 py-2.5 text-right font-bold text-amber-700 tabular-nums">
                                  {p.dispatchedQty > 0 ? p.dispatchedQty : <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-3 py-2.5 text-right text-amber-600 tabular-nums">
                                  {p.dispatchedValue > 0 ? formatCurrency(p.dispatchedValue) : <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-3 py-2.5 text-right font-bold tabular-nums">
                                  <span className={p.remainingQty > 0 ? 'text-emerald-600' : p.remainingQty < 0 ? 'text-red-600' : 'text-slate-400'}>
                                    {p.remainingQty}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Per-day table */}
              {data.rows.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center py-12 gap-2">
                  <AlertCircle size={22} className="text-slate-300" />
                  <p className="text-sm text-slate-400">No data for this period</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-emerald-700">
                        <th className="px-4 py-2.5 text-left text-xs font-bold text-white uppercase tracking-wider w-36">Date</th>
                        <th className="px-4 py-2.5 text-left text-xs font-bold text-white uppercase tracking-wider">Summary</th>
                        <th className="px-4 py-2.5 text-right text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap">Received</th>
                        <th className="px-4 py-2.5 text-right text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap">Dispatched</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map(row => (
                        <DayRow key={row.date} row={row} multiBrand={multiBrand} />
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-emerald-800">
                        <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-emerald-200 uppercase tracking-wider">
                          {data.rows.length} day{data.rows.length !== 1 ? 's' : ''}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-extrabold text-white tabular-nums whitespace-nowrap">
                          {formatCurrency(data.grandTotalReceived)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-extrabold text-white tabular-nums whitespace-nowrap">
                          {formatCurrency(data.grandTotalDispatched)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
