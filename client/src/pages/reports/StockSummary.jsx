import { useState, useEffect, useMemo } from 'react';
import { Loader2, AlertCircle, Package } from 'lucide-react';
import { getIndiaDate, getFirstDayOfMonth, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

function fmtCrates(qty, upc) {
  if (!upc) return null;
  const c = qty / upc;
  return Number.isInteger(c) ? String(c) : c.toFixed(1);
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

  // Aggregate per-product received totals across the selected date range
  const productSummary = useMemo(() => {
    if (!data?.rows) return [];

    // brandName → productName → running totals
    const brandMap = new Map();
    const ensure = (brand, product) => {
      if (!brandMap.has(brand)) brandMap.set(brand, new Map());
      const pm = brandMap.get(brand);
      if (!pm.has(product)) pm.set(product, { qty: 0, value: 0, upc: null });
      return pm.get(product);
    };

    for (const row of data.rows) {
      for (const r of row.receipts) {
        const p = ensure(r.brandName, r.productName);
        p.qty   += r.quantity;
        p.value += r.amount;
        if (!p.upc && r.unitsPerContainer) p.upc = r.unitsPerContainer;
      }
    }

    return Array.from(brandMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([brandName, pm]) => {
        const products = Array.from(pm.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([productName, t]) => ({
            productName,
            qty:       t.qty,
            value:     t.value,
            upc:       t.upc,
            crates:    fmtCrates(t.qty, t.upc),
            unitPrice: t.qty > 0 ? t.value / t.qty : 0,
          }));

        const totalQty   = products.reduce((s, p) => s + p.qty,   0);
        const totalValue = products.reduce((s, p) => s + p.value,  0);
        const totalCrates = products.every(p => p.upc)
          ? products.reduce((s, p) => s + p.qty / p.upc, 0)
          : null;

        return { brandName, products, totalQty, totalValue, totalCrates };
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
            <p className="text-emerald-300 text-xs">Stock received by product for any date range</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">

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

              {/* Period chips */}
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

              {/* Product summary table */}
              {productSummary.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center py-12 gap-2">
                  <AlertCircle size={22} className="text-slate-300" />
                  <p className="text-sm text-slate-400">No data for this period</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-700">
                    <h2 className="text-sm font-bold text-white">Period Summary</h2>
                    <p className="text-xs text-slate-400">
                      {data.rows.length} day{data.rows.length !== 1 ? 's' : ''} · stock received from dairy
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm border-separate border-spacing-0">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-200">
                          <th className="px-4 py-2.5 text-left   text-[11px] font-bold text-slate-500 uppercase tracking-wider">Product</th>
                          <th className="px-3 py-2.5 text-right  text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Total Crates</th>
                          <th className="px-3 py-2.5 text-right  text-[11px] font-bold text-slate-500 uppercase tracking-wider">Quantity</th>
                          <th className="px-3 py-2.5 text-right  text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Unit Price</th>
                          <th className="px-3 py-2.5 text-right  text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Total Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productSummary.map(brand => (
                          <>
                            {/* Brand header */}
                            <tr key={brand.brandName} className="bg-emerald-700">
                              <td className="px-4 py-2 text-xs font-bold text-white uppercase tracking-wider">
                                {brand.brandName}
                                <span className="ml-2 font-normal text-emerald-300 normal-case tracking-normal">
                                  {brand.products.length} product{brand.products.length !== 1 ? 's' : ''}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right text-xs font-bold text-emerald-200 tabular-nums">
                                {brand.totalCrates != null
                                  ? (Number.isInteger(brand.totalCrates) ? brand.totalCrates : brand.totalCrates.toFixed(1))
                                  : '—'}
                              </td>
                              <td className="px-3 py-2 text-right text-xs font-bold text-emerald-200 tabular-nums">{brand.totalQty}</td>
                              <td className="px-3 py-2 text-right text-xs text-emerald-400">—</td>
                              <td className="px-3 py-2 text-right text-xs font-bold text-emerald-200 tabular-nums">{formatCurrency(brand.totalValue)}</td>
                            </tr>

                            {/* Product rows */}
                            {brand.products.map((p, idx) => (
                              <tr
                                key={p.productName}
                                className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}
                              >
                                <td className="px-4 py-2.5 pl-7 text-sm font-medium text-slate-800">{p.productName}</td>
                                <td className="px-3 py-2.5 text-right font-bold text-slate-700 tabular-nums">
                                  {p.crates ?? <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-3 py-2.5 text-right font-bold text-slate-700 tabular-nums">{p.qty}</td>
                                <td className="px-3 py-2.5 text-right text-slate-500 tabular-nums">
                                  {p.unitPrice > 0 ? `₹${p.unitPrice % 1 === 0 ? p.unitPrice : p.unitPrice.toFixed(2)}` : '—'}
                                </td>
                                <td className="px-3 py-2.5 text-right font-bold text-emerald-700 tabular-nums">{formatCurrency(p.value)}</td>
                              </tr>
                            ))}
                          </>
                        ))}
                      </tbody>

                      {/* Grand total footer */}
                      <tfoot>
                        <tr className="bg-slate-800">
                          <td className="px-4 py-2.5 text-xs font-bold text-slate-300 uppercase tracking-wider">Grand Total</td>
                          <td className="px-3 py-2.5 text-right text-xs font-bold text-white tabular-nums">
                            {(() => {
                              const tc = productSummary.reduce((s, b) => b.totalCrates != null ? s + b.totalCrates : s, 0);
                              return productSummary.some(b => b.totalCrates != null) ? (Number.isInteger(tc) ? tc : tc.toFixed(1)) : '—';
                            })()}
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs font-bold text-white tabular-nums">
                            {productSummary.reduce((s, b) => s + b.totalQty, 0)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-500">—</td>
                          <td className="px-3 py-2.5 text-right text-sm font-extrabold text-white tabular-nums">
                            {formatCurrency(productSummary.reduce((s, b) => s + b.totalValue, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
