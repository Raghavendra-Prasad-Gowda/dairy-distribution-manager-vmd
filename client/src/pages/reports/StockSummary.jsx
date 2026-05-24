import { useState, useEffect, useMemo } from 'react';
import { AlertCircle, Package, ChevronRight, ChevronDown } from 'lucide-react';
import BrandedLoader from '../../components/ui/BrandedLoader';
import { getIndiaDate, getFirstDayOfMonth, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

function fmtCrates(qty, upc) {
  const c = upc ? qty / upc : qty;
  return Number.isInteger(c) ? String(c) : c.toFixed(1);
}

function fmtPrice(p) {
  if (!p) return '—';
  return `₹${p % 1 === 0 ? p : p.toFixed(2)}`;
}

export default function StockSummary({ shellActiveBrandId, inShell } = {}) {
  const isShell = inShell || shellActiveBrandId != null;
  const [from, setFrom]       = useState(getFirstDayOfMonth());
  const [to, setTo]           = useState(getIndiaDate());
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [expanded, setExpanded] = useState(new Set());

  useEffect(() => { fetchSummary(); }, [from, to, shellActiveBrandId]);

  async function fetchSummary() {
    setLoading(true); setError('');
    setExpanded(new Set());
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

  function toggle(key) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // Aggregate by brand → product (with nested routes)
  const productSummary = useMemo(() => {
    if (!data?.rows) return [];

    // brandName → productName → { routes[], upc, costPrice }
    const brandMap = new Map();
    const ensureProd = (brand, productName) => {
      if (!brandMap.has(brand)) brandMap.set(brand, new Map());
      const bm = brandMap.get(brand);
      if (!bm.has(productName)) bm.set(productName, { routes: new Map(), upc: null, costPrice: null, displayOrder: 0 });
      return bm.get(productName);
    };

    for (const row of data.rows) {
      for (const r of row.receipts) {
        const prod = ensureProd(r.brandName, r.productName);
        if (!prod.upc && r.unitsPerContainer)    prod.upc = r.unitsPerContainer;
        if (!prod.costPrice && r.costPrice)      prod.costPrice = r.costPrice;
        if (r.displayOrder != null)              prod.displayOrder = r.displayOrder;

        const rk = r.routeNumber ?? '';
        if (!prod.routes.has(rk)) prod.routes.set(rk, { routeNumber: r.routeNumber ?? null, qty: 0, value: 0 });
        const rt = prod.routes.get(rk);
        rt.qty   += r.quantity;
        rt.value += r.amount;
      }
    }

    return Array.from(brandMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([brandName, bm]) => {
        const products = Array.from(bm.entries())
          .sort(([nameA, a], [nameB, b]) => a.displayOrder - b.displayOrder || nameA.localeCompare(nameB))
          .map(([productName, pd]) => {
            const routes = Array.from(pd.routes.values())
              .sort((a, b) => (a.routeNumber ?? '').localeCompare(b.routeNumber ?? ''))
              .map(rt => ({
                routeNumber: rt.routeNumber,
                qty:    rt.qty,
                value:  rt.value,
                crates: fmtCrates(rt.qty, pd.upc),
              }));

            const totalQty   = routes.reduce((s, r) => s + r.qty,   0);
            const totalValue = routes.reduce((s, r) => s + r.value,  0);
            return {
              productName,
              routes,
              upc:         pd.upc,
              unitPrice:   pd.costPrice ?? 0,
              totalQty,
              totalValue,
              totalCrates: fmtCrates(totalQty, pd.upc),
            };
          });

        const totalQty    = products.reduce((s, p) => s + p.totalQty,   0);
        const totalValue  = products.reduce((s, p) => s + p.totalValue,  0);
        const totalCrates = products.reduce((s, p) => s + (p.upc ? p.totalQty / p.upc : p.totalQty), 0);
        return { brandName, products, totalQty, totalValue, totalCrates };
      });
  }, [data]);

  const grandTotalCrates = productSummary.reduce((s, b) => s + b.totalCrates, 0);

  return (
    <div className="flex flex-col h-full">

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
            <BrandedLoader />
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
                    ? 'bg-slate-50 border-slate-200' : 'bg-red-50 border-red-200'
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
                      {data.rows.length} day{data.rows.length !== 1 ? 's' : ''} · stock received from dairy · tap a product to see route breakdown
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm border-separate border-spacing-0">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-200">
                          <th className="px-4 py-2.5 text-left  text-[11px] font-bold text-slate-500 uppercase tracking-wider">Product</th>
                          <th className="px-3 py-2.5 text-left  text-[11px] font-bold text-slate-500 uppercase tracking-wider">Route</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Total Crates</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Quantity</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Unit Price</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Total Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productSummary.map(brand => (
                          <>
                            {/* Brand header */}
                            <tr key={brand.brandName} className="bg-emerald-700">
                              <td colSpan={2} className="px-4 py-2 text-xs font-bold text-white uppercase tracking-wider">
                                {brand.brandName}
                                <span className="ml-2 font-normal text-emerald-300 normal-case tracking-normal">
                                  {brand.products.length} product{brand.products.length !== 1 ? 's' : ''}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right text-xs font-bold text-emerald-200 tabular-nums">
                                {Number.isInteger(brand.totalCrates) ? brand.totalCrates : brand.totalCrates.toFixed(1)}
                              </td>
                              <td className="px-3 py-2 text-right text-xs font-bold text-emerald-200 tabular-nums">{brand.totalQty}</td>
                              <td className="px-3 py-2 text-right text-xs text-emerald-500">—</td>
                              <td className="px-3 py-2 text-right text-xs font-bold text-emerald-200 tabular-nums">{formatCurrency(brand.totalValue)}</td>
                            </tr>

                            {/* Product rows (collapsed by default) */}
                            {brand.products.map((p, idx) => {
                              const expandKey   = `${brand.brandName}::${p.productName}`;
                              const isOpen      = expanded.has(expandKey);
                              const multiRoute  = p.routes.length > 1;
                              const singleRoute = p.routes.length === 1 ? p.routes[0].routeNumber : null;

                              return (
                                <>
                                  {/* Product summary row */}
                                  <tr
                                    key={expandKey}
                                    onClick={() => multiRoute && toggle(expandKey)}
                                    className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} ${multiRoute ? 'cursor-pointer hover:bg-emerald-50/40' : ''}`}
                                  >
                                    <td className="px-4 py-2.5 pl-5">
                                      <div className="flex items-center gap-1.5">
                                        {multiRoute
                                          ? (isOpen
                                              ? <ChevronDown  size={13} className="text-emerald-500 flex-shrink-0" />
                                              : <ChevronRight size={13} className="text-emerald-500 flex-shrink-0" />)
                                          : <span className="w-[13px] flex-shrink-0" />}
                                        <span className="text-sm font-medium text-slate-800">{p.productName}</span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2.5">
                                      {multiRoute
                                        ? <span className="text-[11px] text-slate-400">{p.routes.length} routes</span>
                                        : singleRoute
                                          ? <span className="inline-block bg-emerald-100 text-emerald-700 text-[11px] font-bold px-2 py-0.5 rounded-full">{singleRoute}</span>
                                          : <span className="text-slate-300 text-xs">—</span>}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-bold text-slate-700 tabular-nums">{p.totalCrates}</td>
                                    <td className="px-3 py-2.5 text-right font-bold text-slate-700 tabular-nums">{p.totalQty}</td>
                                    <td className="px-3 py-2.5 text-right text-slate-500 tabular-nums">{fmtPrice(p.unitPrice)}</td>
                                    <td className="px-3 py-2.5 text-right font-bold text-emerald-700 tabular-nums">{formatCurrency(p.totalValue)}</td>
                                  </tr>

                                  {/* Route sub-rows — shown only when expanded */}
                                  {isOpen && p.routes.map(rt => (
                                    <tr
                                      key={`${expandKey}::${rt.routeNumber ?? ''}`}
                                      className="bg-emerald-50/60 border-b border-emerald-100"
                                    >
                                      <td className="px-4 py-2 pl-10 text-xs text-slate-500 italic">{p.productName}</td>
                                      <td className="px-3 py-2">
                                        {rt.routeNumber
                                          ? <span className="inline-block bg-emerald-100 text-emerald-700 text-[11px] font-bold px-2 py-0.5 rounded-full">{rt.routeNumber}</span>
                                          : <span className="text-slate-300 text-xs">—</span>}
                                      </td>
                                      <td className="px-3 py-2 text-right text-xs font-semibold text-slate-600 tabular-nums">{rt.crates}</td>
                                      <td className="px-3 py-2 text-right text-xs font-semibold text-slate-600 tabular-nums">{rt.qty}</td>
                                      <td className="px-3 py-2 text-right text-xs text-slate-400 tabular-nums">{fmtPrice(p.unitPrice)}</td>
                                      <td className="px-3 py-2 text-right text-xs font-semibold text-emerald-700 tabular-nums">{formatCurrency(rt.value)}</td>
                                    </tr>
                                  ))}
                                </>
                              );
                            })}
                          </>
                        ))}
                      </tbody>

                      {/* Grand total footer */}
                      <tfoot>
                        <tr className="bg-slate-800">
                          <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-slate-300 uppercase tracking-wider">Grand Total</td>
                          <td className="px-3 py-2.5 text-right text-xs font-bold text-white tabular-nums">
                            {Number.isInteger(grandTotalCrates) ? grandTotalCrates : grandTotalCrates.toFixed(1)}
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
