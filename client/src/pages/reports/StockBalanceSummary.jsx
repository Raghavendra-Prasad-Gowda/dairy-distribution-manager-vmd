import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, Warehouse } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import BrandedLoader from '../../components/ui/BrandedLoader';
import DateSelector from '../../components/DateSelector';
import { getIndiaDate } from '../../utils/dateUtils';
import api from '../../api/axios';

export default function StockBalanceSummary() {
  const [date, setDate]                   = useState(getIndiaDate());
  const [brands, setBrands]               = useState([]);
  const [activeBrandId, setActiveBrandId] = useState(null);
  const [availData, setAvailData]         = useState([]);
  const [dispatchData, setDispatchData]   = useState(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [showEmptyProducts, setShowEmptyProducts] = useState(false);

  useEffect(() => {
    api.get('/brands')
      .then(r => {
        const b = r.data.data ?? [];
        setBrands(b);
        if (b.length > 0) setActiveBrandId(b[0].id);
      })
      .catch(() => setError('Failed to load brands'));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get(`/stock-receipts/availability?date=${date}`),
      api.get(`/reports/daily-dispatch?date=${date}&includeReceipts=1`),
    ])
      .then(([availRes, dispRes]) => {
        setAvailData(availRes.data.data ?? []);
        setDispatchData(dispRes.data.data ?? null);
      })
      .catch(e => setError(e.response?.data?.error ?? 'Failed to load data'))
      .finally(() => setLoading(false));
  }, [date]);

  // Column definitions — products for the active brand
  const products = useMemo(() => {
    if (!dispatchData || !activeBrandId) return [];
    return dispatchData.brands.find(b => b.brandId === activeBrandId)?.products ?? [];
  }, [dispatchData, activeBrandId]);

  // Salesperson rows that have at least 1 unit dispatched for this brand
  const spRows = useMemo(() => {
    if (!dispatchData || products.length === 0) return [];
    return dispatchData.rows
      .map(row => {
        const brandQty = products.reduce((s, p) => s + (row.items[p.productId]?.qty ?? 0), 0);
        // Crates taken — summed per-product (each product's own crate size),
        // same product scope as brandQty so "Total" and "Crates" always
        // reflect the same underlying data. The API sends unitsPerContainer
        // as 0 (not null) for products with no crate concept — dividing by
        // that would produce Infinity/NaN, so skip those products entirely
        // rather than falling back to 1 (which would also be wrong: it'd
        // count every loose unit as its own "crate"). Same convention as
        // DailyDispatchSummary.jsx.
        const crates = products.reduce((s, p) => {
          if (!(p.unitsPerContainer > 0)) return s;
          const qty = row.items[p.productId]?.qty ?? 0;
          return s + Math.floor(qty / p.unitsPerContainer);
        }, 0);
        return { salespersonId: row.salespersonId, salespersonName: row.salespersonName, items: row.items, brandQty, crates };
      })
      .filter(r => r.brandQty > 0);
  }, [dispatchData, products]);

  // Per-column totals (dispatched, received, remaining)
  const colTotals = useMemo(() => {
    const recvMap = Object.fromEntries(
      availData.filter(p => p.brandId === activeBrandId).map(p => [p.productId, p.received])
    );
    return products.map(p => {
      const dispatched = dispatchData?.totals?.[p.productId] ?? 0;
      const received   = recvMap[p.productId] ?? 0;
      return { productId: p.productId, dispatched, received, remaining: received - dispatched };
    });
  }, [products, availData, activeBrandId, dispatchData]);

  // Columns with zero dispatched are hidden by default (even if received) —
  // toggled back on via showEmptyProducts.
  const visibleProducts = useMemo(() => {
    if (showEmptyProducts) return products;
    const dispatchedIds = new Set(
      colTotals.filter(c => c.dispatched > 0).map(c => c.productId)
    );
    return products.filter(p => dispatchedIds.has(p.productId));
  }, [products, colTotals, showEmptyProducts]);

  const visibleProductIds = useMemo(
    () => new Set(visibleProducts.map(p => p.productId)),
    [visibleProducts],
  );

  const visibleColTotals = useMemo(
    () => colTotals.filter(c => visibleProductIds.has(c.productId)),
    [colTotals, visibleProductIds],
  );

  // Consecutive category groups for the two-row header — built over the
  // visible column list so colSpan counts match the rendered <th>s.
  const categoryGroups = useMemo(() => {
    const groups = [];
    for (const p of visibleProducts) {
      const cat = p.category || null;
      if (groups.length > 0 && groups[groups.length - 1].category === cat) {
        groups[groups.length - 1].count += 1;
      } else {
        groups.push({ category: cat, count: 1 });
      }
    }
    return groups;
  }, [visibleProducts]);

  const crateData = useMemo(() => {
    return visibleColTotals.map(c => {
      const product = visibleProducts.find(p => p.productId === c.productId);
      // Same guard as spRows above — unitsPerContainer is 0 (not null) for
      // non-containerized products, so treat 0/unset as "no crate concept"
      // (0 crates) instead of dividing by it.
      const unitsPerContainer = product?.unitsPerContainer > 0 ? product.unitsPerContainer : null;
      return {
        productId: c.productId,
        cratesReceived: unitsPerContainer ? Math.floor(c.received / unitsPerContainer) : 0,
        cratesDispatched: unitsPerContainer ? Math.floor(c.dispatched / unitsPerContainer) : 0,
      };
    });
  }, [visibleColTotals, visibleProducts]);

  const grandTotals = useMemo(() => {
    const cratesReceived   = crateData.reduce((s, c) => s + c.cratesReceived, 0);
    const cratesDispatched = crateData.reduce((s, c) => s + c.cratesDispatched, 0);
    return {
      dispatched: colTotals.reduce((s, c) => s + c.dispatched, 0),
      received:   colTotals.reduce((s, c) => s + c.received,   0),
      remaining:  colTotals.reduce((s, c) => s + c.remaining,  0),
      cratesReceived,
      cratesDispatched,
      crateShortage: cratesReceived - cratesDispatched,
    };
  }, [colTotals, crateData]);

  const remColor = (v) => v > 0 ? 'text-emerald-300' : v < 0 ? 'text-red-300' : 'text-slate-400';
  const remBg    = (v) => v > 0 ? 'bg-emerald-800'   : v < 0 ? 'bg-red-900'   : 'bg-slate-700';

  const hasData = !loading && spRows.length > 0;

  return (
    <div className="flex flex-col h-full bg-slate-100">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Warehouse size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Stock Balance</h1>
            <p className="text-emerald-300 text-xs">Received vs dispatched for the day</p>
          </div>
        </div>
        <DateSelector date={date} onChange={setDate} dark />
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border-b border-red-200 text-red-700 px-4 py-2.5 text-sm flex-shrink-0">
          <AlertCircle size={14} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* Brand strip */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex-shrink-0">
        <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={setActiveBrandId} />
      </div>

      {loading ? (
        <div className="flex-1"><BrandedLoader /></div>
      ) : !hasData ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400">
          <AlertCircle size={22} className="text-slate-300" />
          <p className="text-sm">No dispatch data for this date</p>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">

          {/* Summary chips */}
          <div className="flex gap-2 px-4 pt-3 pb-2 flex-wrap flex-shrink-0">
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
              <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wide">Supply</span>
              <span className="text-sm font-extrabold text-blue-700 tabular-nums">{grandTotals.received || '—'}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wide">Dispatched</span>
              <span className="text-sm font-extrabold text-amber-700 tabular-nums">{grandTotals.dispatched}</span>
            </div>
            <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 border ${
              grandTotals.remaining >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
            }`}>
              <span className={`text-[10px] font-bold uppercase tracking-wide ${grandTotals.remaining >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>Shortage</span>
              <span className={`text-sm font-extrabold tabular-nums ${grandTotals.remaining >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{grandTotals.remaining}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5">
              <span className="text-[10px] font-bold text-violet-500 uppercase tracking-wide">Crates Received</span>
              <span className="text-sm font-extrabold text-violet-700 tabular-nums">{grandTotals.cratesReceived || '—'}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5">
              <span className="text-[10px] font-bold text-violet-500 uppercase tracking-wide">Crates Dispatched</span>
              <span className="text-sm font-extrabold text-violet-700 tabular-nums">{grandTotals.cratesDispatched || '—'}</span>
            </div>
            {(showEmptyProducts || visibleProducts.length < products.length) && (
              <button
                type="button"
                onClick={() => setShowEmptyProducts(v => !v)}
                className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-lg border transition whitespace-nowrap ${
                  showEmptyProducts
                    ? 'bg-slate-100 text-slate-600 border-slate-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {showEmptyProducts ? 'All products' : 'Entered only'}
              </button>
            )}
          </div>

          {visibleProducts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400">
              <AlertCircle size={22} className="text-slate-300" />
              <p className="text-sm">No products with activity for this date</p>
              <button type="button" onClick={() => setShowEmptyProducts(true)} className="text-xs text-emerald-600 underline">
                Show all products
              </button>
            </div>
          ) : (
          <div className="flex-1 min-h-0 px-4 pb-4">
            <div className="h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {/* Single overflow:auto container so sticky top + sticky left both work */}
              <div className="h-full overflow-auto">
                <table
                  className="text-sm border-separate border-spacing-0"
                  style={{ minWidth: `${160 + visibleProducts.length * 68 + 64 + 64}px` }}
                >
                  {/* Two-row header: category row + product name row */}
                  <thead>
                    {/* Row 1 — category labels */}
                    <tr>
                      <th
                        rowSpan={2}
                        className="sticky left-0 z-20 bg-emerald-700 px-3 py-2.5 text-left text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 align-middle"
                        style={{ minWidth: 160 }}
                      >
                        Salesperson
                      </th>
                      {categoryGroups.map((g, i) => (
                        <th
                          key={i}
                          colSpan={g.count}
                          className={`bg-emerald-800 px-2 py-1.5 text-center text-[10px] font-bold text-emerald-300 uppercase tracking-widest border-r border-emerald-700 border-b border-emerald-600 ${!g.category ? 'opacity-0' : ''}`}
                        >
                          {g.category ?? ''}
                        </th>
                      ))}
                      <th
                        rowSpan={2}
                        className="bg-emerald-600 px-2 py-2.5 text-center text-xs font-bold text-white uppercase align-middle"
                        style={{ minWidth: 60 }}
                      >
                        Total
                      </th>
                      <th
                        rowSpan={2}
                        className="bg-violet-700 px-2 py-2.5 text-center text-xs font-bold text-white uppercase align-middle"
                        style={{ minWidth: 60 }}
                      >
                        Crates
                      </th>
                    </tr>
                    {/* Row 2 — product names */}
                    <tr>
                      {visibleProducts.map(p => (
                        <th
                          key={p.productId}
                          className="bg-emerald-700 px-2 py-2 text-center text-[10px] font-bold text-white leading-tight border-r border-emerald-600"
                          style={{ minWidth: 60 }}
                        >
                          {p.productName}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  {/* Salesperson data rows */}
                  <tbody>
                    {spRows.map((row, idx) => (
                      <tr key={row.salespersonId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                        <td
                          className={`sticky left-0 z-[1] px-3 py-2 text-sm font-semibold text-slate-800 border-b border-r border-slate-100 whitespace-nowrap ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                          style={{ minWidth: 160 }}
                        >
                          {row.salespersonName}
                        </td>
                        {visibleProducts.map(p => {
                          const qty = row.items[p.productId]?.qty ?? 0;
                          return (
                            <td
                              key={p.productId}
                              className="px-2 py-2 text-center text-sm tabular-nums font-bold border-b border-r border-slate-100"
                              style={{ minWidth: 60 }}
                            >
                              {qty > 0
                                ? <span className="text-slate-800">{qty}</span>
                                : <span className="text-slate-200">—</span>}
                            </td>
                          );
                        })}
                        <td
                          className="px-2 py-2 text-center text-sm tabular-nums font-bold text-emerald-700 border-b border-slate-100 bg-emerald-50/40"
                          style={{ minWidth: 60 }}
                        >
                          {row.brandQty}
                        </td>
                        <td
                          className="px-2 py-2 text-center text-sm tabular-nums font-bold text-violet-700 border-b border-slate-100 bg-violet-50/40"
                          style={{ minWidth: 60 }}
                        >
                          {row.crates > 0 ? row.crates : <span className="text-violet-200">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  {/* Summary footer rows: Dispatched → Shortage → Supply → Crates */}
                  <tfoot className="sticky bottom-0 z-10">
                    {/* DISPATCHED */}
                    <tr>
                      <td className="sticky left-0 z-20 bg-slate-600 px-3 py-2.5 text-xs font-bold text-white border-t-2 border-slate-500 border-r border-slate-500 uppercase tracking-wider whitespace-nowrap">
                        Dispatched
                      </td>
                      {visibleColTotals.map(c => (
                        <td key={c.productId} className="bg-slate-600 px-2 py-2.5 text-center text-sm tabular-nums font-bold text-white border-t-2 border-r border-slate-500">
                          {c.dispatched > 0 ? c.dispatched : <span className="text-slate-400">—</span>}
                        </td>
                      ))}
                      <td className="bg-slate-600 px-2 py-2.5 text-center text-sm font-bold text-white border-t-2 border-r border-slate-500">
                        {grandTotals.dispatched > 0 ? grandTotals.dispatched : '—'}
                      </td>
                      <td className="bg-slate-600 px-2 py-2.5 text-center text-sm font-bold text-white border-t-2">
                        {grandTotals.cratesDispatched > 0 ? grandTotals.cratesDispatched : '—'}
                      </td>
                    </tr>

                    {/* SHORTAGE */}
                    <tr>
                      <td className="sticky left-0 z-20 bg-emerald-800 px-3 py-2.5 text-xs font-bold text-emerald-200 border-r border-emerald-700 uppercase tracking-wider whitespace-nowrap">
                        Shortage
                      </td>
                      {visibleColTotals.map(c => (
                        <td key={c.productId} className={`px-2 py-2.5 text-center text-sm tabular-nums font-bold border-r border-emerald-700 ${remBg(c.remaining)} ${remColor(c.remaining)}`}>
                          {c.remaining !== 0 ? c.remaining : <span className="text-slate-500">0</span>}
                        </td>
                      ))}
                      <td className={`px-2 py-2.5 text-center text-sm font-bold border-r border-emerald-700 ${remBg(grandTotals.remaining)} ${remColor(grandTotals.remaining)}`}>
                        {grandTotals.remaining !== 0 ? grandTotals.remaining : '0'}
                      </td>
                      <td className={`px-2 py-2.5 text-center text-sm font-bold ${remBg(grandTotals.crateShortage)} ${remColor(grandTotals.crateShortage)}`}>
                        {grandTotals.crateShortage !== 0 ? grandTotals.crateShortage : '0'}
                      </td>
                    </tr>

                    {/* SUPPLY */}
                    <tr>
                      <td className="sticky left-0 z-20 bg-blue-700 px-3 py-2.5 text-xs font-bold text-blue-100 border-r border-blue-600 uppercase tracking-wider whitespace-nowrap">
                        Supply
                      </td>
                      {visibleColTotals.map(c => (
                        <td key={c.productId} className="bg-blue-700 px-2 py-2.5 text-center text-sm tabular-nums font-bold text-white border-r border-blue-600">
                          {c.received > 0 ? c.received : <span className="text-blue-400">—</span>}
                        </td>
                      ))}
                      <td className="bg-blue-700 px-2 py-2.5 text-center text-sm font-bold text-white border-r border-blue-600">
                        {grandTotals.received > 0 ? grandTotals.received : '—'}
                      </td>
                      <td className="bg-blue-700 px-2 py-2.5 text-center text-sm font-bold text-white">
                        {grandTotals.cratesReceived > 0 ? grandTotals.cratesReceived : '—'}
                      </td>
                    </tr>

                    {/* CRATES RECEIVED */}
                    <tr>
                      <td className="sticky left-0 z-20 bg-violet-700 px-3 py-2.5 text-xs font-bold text-violet-100 border-r border-violet-600 uppercase tracking-wider whitespace-nowrap">
                        Crates Received
                      </td>
                      {crateData.map(c => (
                        <td key={c.productId} className="bg-violet-700 px-2 py-2.5 text-center text-sm tabular-nums font-bold text-white border-r border-violet-600">
                          {c.cratesReceived > 0 ? c.cratesReceived : <span className="text-violet-400">—</span>}
                        </td>
                      ))}
                      <td className="bg-violet-700 px-2 py-2.5 text-center text-sm font-bold text-white border-r border-violet-600">
                        {grandTotals.cratesReceived > 0 ? grandTotals.cratesReceived : '—'}
                      </td>
                      <td className="bg-violet-700 px-2 py-2.5 text-center text-sm font-bold text-white">
                        {grandTotals.cratesReceived > 0 ? grandTotals.cratesReceived : '—'}
                      </td>
                    </tr>

                    {/* CRATES DISPATCHED */}
                    <tr>
                      <td className="sticky left-0 z-20 bg-violet-600 px-3 py-2.5 text-xs font-bold text-violet-100 border-r border-violet-500 uppercase tracking-wider whitespace-nowrap">
                        Crates Dispatched
                      </td>
                      {crateData.map(c => (
                        <td key={c.productId} className="bg-violet-600 px-2 py-2.5 text-center text-sm tabular-nums font-bold text-white border-r border-violet-500">
                          {c.cratesDispatched > 0 ? c.cratesDispatched : <span className="text-violet-300">—</span>}
                        </td>
                      ))}
                      <td className="bg-violet-600 px-2 py-2.5 text-center text-sm font-bold text-white border-r border-violet-500">
                        {grandTotals.cratesDispatched > 0 ? grandTotals.cratesDispatched : '—'}
                      </td>
                      <td className="bg-violet-600 px-2 py-2.5 text-center text-sm font-bold text-white">
                        {grandTotals.cratesDispatched > 0 ? grandTotals.cratesDispatched : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
