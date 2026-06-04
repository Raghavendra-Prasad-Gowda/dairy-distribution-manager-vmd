import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, Package, ChevronRight, ChevronDown, Printer } from 'lucide-react';
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

function fmtLiters(qty, unitSize) {
  if (!unitSize) return null;
  const l = (qty * unitSize) / 1000;
  return Number.isInteger(l) ? String(l) : l.toFixed(2);
}

function fmtKgs(qty, unitSizeGrams) {
  if (!unitSizeGrams) return null;
  const k = (qty * unitSizeGrams) / 1000;
  return Number.isInteger(k) ? String(k) : k.toFixed(2);
}

export default function StockSummary({ shellActiveBrandId, inShell } = {}) {
  const isShell = inShell || shellActiveBrandId != null;
  const [from, setFrom]             = useState(getFirstDayOfMonth());
  const [to, setTo]                 = useState(getIndiaDate());
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [expanded, setExpanded]     = useState(new Set());
  const [routes, setRoutes]         = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState('');

  useEffect(() => {
    const brandParam = shellActiveBrandId ? `?brandId=${shellActiveBrandId}` : '';
    api.get(`/routes${brandParam}`)
      .then(r => setRoutes(r.data.data ?? []))
      .catch(() => {});
  }, [shellActiveBrandId]);

  useEffect(() => { fetchSummary(); }, [from, to, shellActiveBrandId, selectedRouteId]);

  async function fetchSummary() {
    setLoading(true); setError('');
    setExpanded(new Set());
    try {
      const brandParam = shellActiveBrandId ? `&brandId=${shellActiveBrandId}` : '';
      const routeParam = selectedRouteId   ? `&routeId=${selectedRouteId}`     : '';
      const r = await api.get(`/reports/stock-summary?from=${from}&to=${to}${brandParam}${routeParam}`);
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

  // Aggregate by brand → category → product (with nested routes), respecting layout display order
  const productSummary = useMemo(() => {
    if (!data?.rows) return [];

    const brandMap = new Map();

    const ensureProd = (brandName, brandDisplayOrder, catName, catDisplayOrder, productName) => {
      if (!brandMap.has(brandName)) {
        brandMap.set(brandName, { brandDisplayOrder, categories: new Map() });
      }
      const bm = brandMap.get(brandName);
      if (!bm.categories.has(catName)) {
        bm.categories.set(catName, { categoryDisplayOrder: catDisplayOrder, products: new Map() });
      }
      const cm = bm.categories.get(catName);
      if (!cm.products.has(productName)) {
        cm.products.set(productName, { routes: new Map(), upc: null, containerType: null, unitSize: null, unitSizeGrams: null, costPrice: null, displayOrder: 0 });
      }
      return cm.products.get(productName);
    };

    for (const row of data.rows) {
      for (const r of row.receipts) {
        const catName = r.category ?? 'General';
        const prod = ensureProd(
          r.brandName,
          r.brandDisplayOrder ?? 0,
          catName,
          r.categoryDisplayOrder ?? 999,
          r.productName,
        );
        if (!prod.upc && r.unitsPerContainer)           prod.upc = r.unitsPerContainer;
        if (!prod.containerType && r.containerType)     prod.containerType = r.containerType;
        if (!prod.unitSize && r.unitSize)               prod.unitSize = r.unitSize;
        if (!prod.unitSizeGrams && r.unitSizeGrams)     prod.unitSizeGrams = r.unitSizeGrams;
        if (!prod.costPrice && r.costPrice)             prod.costPrice = r.costPrice;
        if (r.displayOrder != null)            prod.displayOrder = r.displayOrder;

        const rk = r.routeNumber ?? '';
        if (!prod.routes.has(rk)) prod.routes.set(rk, { routeNumber: r.routeNumber ?? null, qty: 0, value: 0 });
        const rt = prod.routes.get(rk);
        rt.qty   += r.quantity;
        rt.value += r.amount;
      }
    }

    return Array.from(brandMap.entries())
      .sort(([nameA, a], [nameB, b]) => a.brandDisplayOrder - b.brandDisplayOrder || nameA.localeCompare(nameB))
      .map(([brandName, bdata]) => {
        const categories = Array.from(bdata.categories.entries())
          .sort(([nameA, a], [nameB, b]) => a.categoryDisplayOrder - b.categoryDisplayOrder || nameA.localeCompare(nameB))
          .map(([catName, cdata]) => {
            const products = Array.from(cdata.products.entries())
              .sort(([nameA, a], [nameB, b]) => a.displayOrder - b.displayOrder || nameA.localeCompare(nameB))
              .map(([productName, pd]) => {
                const isCrate  = pd.containerType === 'crate';
                const routes = Array.from(pd.routes.values())
                  .sort((a, b) => (a.routeNumber ?? '').localeCompare(b.routeNumber ?? ''))
                  .map(rt => ({
                    routeNumber: rt.routeNumber,
                    qty:    rt.qty,
                    value:  rt.value,
                    crates: isCrate ? fmtCrates(rt.qty, pd.upc) : null,
                    liters: isCrate ? fmtLiters(rt.qty, pd.unitSize) : null,
                    kgs:    isCrate ? fmtKgs(rt.qty, pd.unitSizeGrams) : null,
                  }));

                const totalQty   = routes.reduce((s, r) => s + r.qty,   0);
                const totalValue = routes.reduce((s, r) => s + r.value,  0);
                return {
                  productName,
                  routes,
                  upc:           pd.upc,
                  containerType: pd.containerType,
                  unitSize:      pd.unitSize,
                  unitSizeGrams: pd.unitSizeGrams,
                  unitPrice:     pd.costPrice ?? 0,
                  totalQty,
                  totalValue,
                  totalCrates:   isCrate ? fmtCrates(totalQty, pd.upc) : null,
                  totalLiters:   isCrate && pd.unitSize ? (totalQty * pd.unitSize) / 1000 : null,
                  totalKgs:      isCrate && pd.unitSizeGrams ? (totalQty * pd.unitSizeGrams) / 1000 : null,
                };
              });

            const catQty    = products.reduce((s, p) => s + p.totalQty, 0);
            const catValue  = products.reduce((s, p) => s + p.totalValue, 0);
            const catCrates = products.filter(p => p.containerType === 'crate').reduce((s, p) => s + (p.upc ? p.totalQty / p.upc : 0), 0);
            const hasCrates = products.some(p => p.containerType === 'crate');
            const catLiters = products.some(p => p.totalLiters != null)
              ? products.reduce((s, p) => s + (p.totalLiters ?? 0), 0)
              : null;
            const catKgs = products.some(p => p.totalKgs != null)
              ? products.reduce((s, p) => s + (p.totalKgs ?? 0), 0)
              : null;
            const hasKgs = products.some(p => p.totalKgs != null);
            return { name: catName, products, catQty, catValue, catCrates, hasCrates, catLiters, catKgs, hasKgs };
          });

        const totalQty    = categories.reduce((s, c) => s + c.catQty, 0);
        const totalValue  = categories.reduce((s, c) => s + c.catValue, 0);
        const totalCrates = categories.reduce((s, c) => s + c.catCrates, 0);
        const hasCrates   = categories.some(c => c.hasCrates);
        const totalLiters = categories.some(c => c.catLiters != null)
          ? categories.reduce((s, c) => s + (c.catLiters ?? 0), 0)
          : null;
        const totalKgs = categories.some(c => c.catKgs != null)
          ? categories.reduce((s, c) => s + (c.catKgs ?? 0), 0)
          : null;
        const hasKgs = categories.some(c => c.hasKgs);
        return { brandName, categories, totalQty, totalValue, totalCrates, hasCrates, totalLiters, totalKgs, hasKgs };
      });
  }, [data]);

  const grandTotalCrates = productSummary.reduce((s, b) => s + b.totalCrates, 0);
  const grandHasCrates   = productSummary.some(b => b.hasCrates);
  const grandTotalLiters = productSummary.some(b => b.totalLiters != null)
    ? productSummary.reduce((s, b) => s + (b.totalLiters ?? 0), 0)
    : null;
  const grandTotalKgs = productSummary.some(b => b.totalKgs != null)
    ? productSummary.reduce((s, b) => s + (b.totalKgs ?? 0), 0)
    : null;
  const grandHasKgs = productSummary.some(b => b.hasKgs);

  const expandableKeys = useMemo(() => {
    const keys = [];
    productSummary.forEach(brand =>
      brand.categories.forEach(cat =>
        cat.products.forEach(p => {
          if (p.routes.length > 1) keys.push(`${brand.brandName}::${cat.name}::${p.productName}`);
        })
      )
    );
    return keys;
  }, [productSummary]);
  const allExpanded = expandableKeys.length > 0 && expandableKeys.every(k => expanded.has(k));

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

          {/* Filter + toolbar card */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Date row + route filter */}
            <div className="px-4 py-3 flex flex-wrap items-center gap-4">
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
              {routes.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Route</label>
                  <select
                    value={selectedRouteId}
                    onChange={e => setSelectedRouteId(e.target.value)}
                    className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="">All Routes</option>
                    {routes.map(rt => (
                      <option key={rt.id} value={rt.id}>{rt.routeNumber}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Toolbar strip — summary stats + actions */}
            {data && (() => {
              const net = data.grandTotalReceived - data.grandTotalDispatched;
              return (
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wide">Received</span>
                    <span className="text-sm font-extrabold text-blue-700 tabular-nums">{formatCurrency(data.grandTotalReceived)}</span>
                  </div>
                  <div className="w-px h-4 bg-slate-200 hidden sm:block" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wide">Dispatched</span>
                    <span className="text-sm font-extrabold text-emerald-700 tabular-nums">{formatCurrency(data.grandTotalDispatched)}</span>
                  </div>
                  <div className="w-px h-4 bg-slate-200 hidden sm:block" />
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${net >= 0 ? 'text-slate-500' : 'text-red-500'}`}>Net</span>
                    <span className={`text-sm font-extrabold tabular-nums ${net >= 0 ? 'text-slate-700' : 'text-red-600'}`}>{formatCurrency(net)}</span>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    {expandableKeys.length > 0 && !loading && (
                      <button
                        onClick={() => allExpanded ? setExpanded(new Set()) : setExpanded(new Set(expandableKeys))}
                        className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 transition"
                      >
                        {allExpanded
                          ? <><ChevronRight size={14} /> Collapse All</>
                          : <><ChevronDown  size={14} /> Expand All</>}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const brandParam    = shellActiveBrandId ? `&brandId=${shellActiveBrandId}` : '';
                        const routeParam    = selectedRouteId ? `&routeId=${selectedRouteId}` : '';
                        const selectedRoute = routes.find(rt => String(rt.id) === String(selectedRouteId));
                        const routeNumParam = selectedRoute ? `&routeNumber=${encodeURIComponent(selectedRoute.routeNumber)}` : '';
                        window.open(`/print/stock-summary?from=${from}&to=${to}${brandParam}${routeParam}${routeNumParam}`, '_blank');
                      }}
                      className="flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-4 py-1.5 transition"
                    >
                      <Printer size={15} /> Print
                    </button>
                  </div>
                </div>
              );
            })()}
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
                  <div className="overflow-auto max-h-[60vh]">
                    <table className="min-w-full text-sm border-separate border-spacing-0">
                      <thead className="bg-emerald-700 sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-2.5 text-left   text-[11px] font-bold text-white uppercase tracking-wider">Product</th>
                          <th className="px-3 py-2.5 text-left   text-[11px] font-bold text-white uppercase tracking-wider">Route</th>
                          <th className="px-3 py-2.5 text-center text-[11px] font-bold text-white uppercase tracking-wider whitespace-nowrap">Total Crates</th>
                          <th className="px-3 py-2.5 text-center text-[11px] font-bold text-white uppercase tracking-wider">Quantity</th>
                          <th className="px-3 py-2.5 text-center text-[11px] font-bold text-white uppercase tracking-wider">Liters</th>
                          <th className="px-3 py-2.5 text-center text-[11px] font-bold text-white uppercase tracking-wider">Kgs</th>
                          <th className="px-3 py-2.5 text-center text-[11px] font-bold text-white uppercase tracking-wider whitespace-nowrap">Unit Price</th>
                          <th className="px-3 py-2.5 text-center text-[11px] font-bold text-white uppercase tracking-wider whitespace-nowrap">Total Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productSummary.map(brand => {
                          const productCount  = brand.categories.reduce((s, c) => s + c.products.length, 0);
                          const multiCategory = brand.categories.length > 1;
                          return (
                            <React.Fragment key={brand.brandName}>
                              {/* Brand header */}
                              <tr className="bg-slate-700">
                                <td colSpan={2} className="px-4 py-2 text-xs font-bold text-white uppercase tracking-wider">
                                  {brand.brandName}
                                  <span className="ml-2 font-normal text-slate-300 normal-case tracking-normal">
                                    {productCount} product{productCount !== 1 ? 's' : ''}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center text-xs font-bold text-slate-200 tabular-nums">
                                  {brand.hasCrates
                                    ? (Number.isInteger(brand.totalCrates) ? brand.totalCrates : brand.totalCrates.toFixed(1))
                                    : <span className="text-slate-500">—</span>}
                                </td>
                                <td className="px-3 py-2 text-center text-xs font-bold text-slate-200 tabular-nums">{brand.totalQty}</td>
                                <td className="px-3 py-2 text-center text-xs font-bold text-slate-200 tabular-nums">
                                  {brand.totalLiters != null
                                    ? (Number.isInteger(brand.totalLiters) ? brand.totalLiters : brand.totalLiters.toFixed(2))
                                    : <span className="text-slate-500">—</span>}
                                </td>
                                <td className="px-3 py-2 text-center text-xs font-bold text-slate-200 tabular-nums">
                                  {brand.totalKgs != null
                                    ? (Number.isInteger(brand.totalKgs) ? brand.totalKgs : brand.totalKgs.toFixed(2))
                                    : <span className="text-slate-500">—</span>}
                                </td>
                                <td className="px-3 py-2 text-center text-xs text-slate-500">—</td>
                                <td className="px-3 py-2 text-center text-xs font-bold text-slate-200 tabular-nums">{formatCurrency(brand.totalValue)}</td>
                              </tr>

                              {brand.categories.map(cat => (
                                <React.Fragment key={`${brand.brandName}::${cat.name}`}>
                                  {/* Category sub-header — only when brand has multiple categories */}
                                  {multiCategory && (
                                    <tr className="bg-slate-100 border-b border-slate-200">
                                      <td colSpan={8} className="px-4 py-2 text-left text-xs font-bold text-slate-700">
                                        {cat.name}
                                      </td>
                                    </tr>
                                  )}

                                  {/* Product rows */}
                                  {cat.products.map((p, idx) => {
                                    const expandKey  = `${brand.brandName}::${cat.name}::${p.productName}`;
                                    const isOpen     = expanded.has(expandKey);
                                    const multiRoute  = p.routes.length > 1;
                                    const singleRoute = p.routes.length === 1 ? p.routes[0].routeNumber : null;

                                    return (
                                      <React.Fragment key={expandKey}>
                                        {/* Product summary row */}
                                        <tr
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
                                          <td className="px-3 py-2.5 text-center font-bold text-slate-700 tabular-nums">
                                            {p.totalCrates ?? <span className="text-slate-300">—</span>}
                                          </td>
                                          <td className="px-3 py-2.5 text-center font-bold text-slate-700 tabular-nums">{p.totalQty}</td>
                                          <td className="px-3 py-2.5 text-center font-bold text-slate-700 tabular-nums">
                                            {p.totalLiters != null
                                              ? (Number.isInteger(p.totalLiters) ? p.totalLiters : p.totalLiters.toFixed(2))
                                              : <span className="text-slate-300">—</span>}
                                          </td>
                                          <td className="px-3 py-2.5 text-center font-bold text-slate-700 tabular-nums">
                                            {p.totalKgs != null
                                              ? (Number.isInteger(p.totalKgs) ? p.totalKgs : p.totalKgs.toFixed(2))
                                              : <span className="text-slate-300">—</span>}
                                          </td>
                                          <td className="px-3 py-2.5 text-center text-slate-500 tabular-nums">{fmtPrice(p.unitPrice)}</td>
                                          <td className="px-3 py-2.5 text-center font-bold text-emerald-700 tabular-nums">{formatCurrency(p.totalValue)}</td>
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
                                            <td className="px-3 py-2 text-center text-xs font-semibold text-slate-600 tabular-nums">
                                              {rt.crates ?? <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-3 py-2 text-center text-xs font-semibold text-slate-600 tabular-nums">{rt.qty}</td>
                                            <td className="px-3 py-2 text-center text-xs font-semibold text-slate-600 tabular-nums">
                                              {rt.liters ?? <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-3 py-2 text-center text-xs font-semibold text-slate-600 tabular-nums">
                                              {rt.kgs ?? <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-3 py-2 text-center text-xs text-slate-400 tabular-nums">{fmtPrice(p.unitPrice)}</td>
                                            <td className="px-3 py-2 text-center text-xs font-semibold text-emerald-700 tabular-nums">{formatCurrency(rt.value)}</td>
                                          </tr>
                                        ))}
                                      </React.Fragment>
                                    );
                                  })}
                                </React.Fragment>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </tbody>

                      {/* Grand total footer */}
                      <tfoot>
                        <tr className="bg-slate-800">
                          <td colSpan={2} className="px-4 py-3 text-xs font-bold text-slate-300 uppercase tracking-wider border-r border-slate-600">Grand Total</td>
                          <td className="px-3 py-3 text-center text-xs font-bold text-white tabular-nums border-r border-slate-600">
                            {grandHasCrates
                              ? (Number.isInteger(grandTotalCrates) ? grandTotalCrates : grandTotalCrates.toFixed(1))
                              : <span className="text-slate-500">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center text-xs font-bold text-white tabular-nums border-r border-slate-600">
                            {productSummary.reduce((s, b) => s + b.totalQty, 0)}
                          </td>
                          <td className="px-3 py-3 text-center text-xs font-bold text-white tabular-nums border-r border-slate-600">
                            {grandTotalLiters != null
                              ? (Number.isInteger(grandTotalLiters) ? grandTotalLiters : grandTotalLiters.toFixed(2))
                              : <span className="text-slate-500">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center text-xs font-bold text-white tabular-nums border-r border-slate-600">
                            {grandHasKgs && grandTotalKgs != null
                              ? (Number.isInteger(grandTotalKgs) ? grandTotalKgs : grandTotalKgs.toFixed(2))
                              : <span className="text-slate-500">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center text-slate-500 border-r border-slate-600">—</td>
                          <td className="px-3 py-3 text-center text-sm font-extrabold text-white tabular-nums">
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
