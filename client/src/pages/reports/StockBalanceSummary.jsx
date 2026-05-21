import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, AlertCircle, Warehouse } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import DateSelector from '../../components/DateSelector';
import { getIndiaDate } from '../../utils/dateUtils';
import api from '../../api/axios';

function cratesOf(qty, unitsPerContainer) {
  if (!unitsPerContainer || unitsPerContainer <= 0) return null;
  return Math.floor(qty / unitsPerContainer);
}

export default function StockBalanceSummary() {
  const [date, setDate]                   = useState(getIndiaDate());
  const [brands, setBrands]               = useState([]);
  const [activeBrandId, setActiveBrandId] = useState(null);
  const [data, setData]                   = useState([]);
  const [dispatchData, setDispatchData]   = useState(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [showZero, setShowZero]           = useState(false);

  // Load brands once on mount
  useEffect(() => {
    api.get('/brands')
      .then(r => {
        const b = r.data.data ?? [];
        setBrands(b);
        if (b.length > 0) setActiveBrandId(b[0].id);
      })
      .catch(() => setError('Failed to load brands'));
  }, []);

  // Fetch availability + dispatch in parallel when date changes
  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get(`/stock-receipts/availability?date=${date}`),
      api.get(`/reports/daily-dispatch?date=${date}`),
    ])
      .then(([availRes, dispRes]) => {
        setData(availRes.data.data ?? []);
        setDispatchData(dispRes.data.data ?? null);
      })
      .catch(e => setError(e.response?.data?.error ?? 'Failed to load stock balance'))
      .finally(() => setLoading(false));
  }, [date]);

  // Product summary rows for selected brand
  const brandRows = useMemo(() => {
    if (!activeBrandId) return [];
    const inBrand = data.filter(p => p.brandId === activeBrandId);
    return showZero ? inBrand : inBrand.filter(p => p.received > 0 || p.dispatched > 0);
  }, [data, activeBrandId, showZero]);

  const totals = useMemo(() => ({
    received:   brandRows.reduce((s, p) => s + p.received,   0),
    dispatched: brandRows.reduce((s, p) => s + p.dispatched, 0),
    available:  brandRows.reduce((s, p) => s + p.available,  0),
  }), [brandRows]);

  // Salesperson breakdown for selected brand
  const spRows = useMemo(() => {
    if (!dispatchData || !activeBrandId) return [];
    const activeBrand = dispatchData.brands.find(b => b.brandId === activeBrandId);
    if (!activeBrand) return [];
    const brandProdIds  = new Set(activeBrand.products.map(p => p.productId));
    const nameMap       = Object.fromEntries(activeBrand.products.map(p => [p.productId, p.productName]));

    return dispatchData.rows
      .map(row => {
        const brandItems = Object.entries(row.items)
          .map(([pid, item]) => ({ productId: Number(pid), productName: nameMap[Number(pid)], qty: item.qty }))
          .filter(item => brandProdIds.has(item.productId) && item.qty > 0)
          .sort((a, b) => a.productName.localeCompare(b.productName));
        const brandQty = brandItems.reduce((s, i) => s + i.qty, 0);
        return { salespersonId: row.salespersonId, salespersonName: row.salespersonName, brandItems, brandQty };
      })
      .filter(sp => sp.brandQty > 0)
      .sort((a, b) => b.brandQty - a.brandQty);
  }, [dispatchData, activeBrandId]);

  const remTextColor = (val) =>
    val > 0 ? 'text-emerald-700' : val < 0 ? 'text-red-600' : 'text-slate-400';

  return (
    <div className="bg-slate-100 pb-6 min-h-full">

      {/* Page header */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800">
        <div className="flex items-center gap-2.5">
          <Warehouse size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Stock Balance</h1>
            <p className="text-emerald-300 text-xs">Received vs dispatched for the day</p>
          </div>
        </div>
        <DateSelector date={date} onChange={setDate} dark />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border-b border-red-200 text-red-700 px-4 py-2.5 text-sm">
          <AlertCircle size={14} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* Brand strip */}
      <div className="bg-white border-b border-slate-200 px-4 py-2">
        <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={setActiveBrandId} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          {brandRows.length > 0 && (
            <div className="mx-4 mt-4 grid grid-cols-3 gap-3">
              {[
                { label: 'Received',   value: totals.received,   valueColor: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200' },
                { label: 'Dispatched', value: totals.dispatched, valueColor: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' },
                {
                  label: 'Remaining', value: totals.available,
                  valueColor: totals.available >= 0 ? 'text-emerald-700' : 'text-red-600',
                  bg: totals.available >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200',
                },
              ].map(({ label, value, valueColor, bg }) => (
                <div key={label} className={`rounded-xl border px-4 py-3 ${bg}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{label}</p>
                  <p className={`text-2xl font-extrabold tabular-nums leading-none ${valueColor}`}>{value}</p>
                  <p className="text-[10px] text-slate-400 mt-1">units</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Product summary table ── */}
          <div className="mx-4 mt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product Summary</p>
              <button
                type="button"
                onClick={() => setShowZero(v => !v)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition ${
                  showZero
                    ? 'bg-slate-100 text-slate-600 border-slate-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {showZero ? 'All products' : 'Entered only'}
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {brandRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <AlertCircle size={22} className="text-slate-300" />
                  <p className="text-sm text-slate-400">No stock data for this date</p>
                  {!showZero && (
                    <button type="button" onClick={() => setShowZero(true)} className="text-xs text-emerald-600 underline">
                      Show all products
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm border-separate border-spacing-0">
                    <thead>
                      <tr>
                        <th rowSpan={2} className="bg-emerald-700 px-4 py-2.5 text-left text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 align-bottom">
                          Product
                        </th>
                        <th colSpan={2} className="bg-blue-700 px-4 py-2 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-blue-500">Received</th>
                        <th colSpan={2} className="bg-amber-600 px-4 py-2 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-amber-400">Dispatched</th>
                        <th colSpan={2} className="bg-emerald-600 px-4 py-2 text-center text-xs font-bold text-white uppercase tracking-wider">Remaining</th>
                      </tr>
                      <tr>
                        <th className="bg-blue-600    px-3 py-1.5 text-center text-[10px] font-bold text-white/90 uppercase tracking-wider border-r border-blue-400   w-16">Units</th>
                        <th className="bg-blue-600    px-3 py-1.5 text-center text-[10px] font-bold text-white/90 uppercase tracking-wider border-r border-blue-400   w-16">Crates</th>
                        <th className="bg-amber-500   px-3 py-1.5 text-center text-[10px] font-bold text-white/90 uppercase tracking-wider border-r border-amber-300  w-16">Units</th>
                        <th className="bg-amber-500   px-3 py-1.5 text-center text-[10px] font-bold text-white/90 uppercase tracking-wider border-r border-amber-300  w-16">Crates</th>
                        <th className="bg-emerald-500 px-3 py-1.5 text-center text-[10px] font-bold text-white/90 uppercase tracking-wider border-r border-emerald-400 w-16">Units</th>
                        <th className="bg-emerald-500 px-3 py-1.5 text-center text-[10px] font-bold text-white/90 uppercase tracking-wider w-16">Crates</th>
                      </tr>
                    </thead>
                    <tbody>
                      {brandRows.map((p, idx) => {
                        const recCrates  = cratesOf(p.received,   p.unitsPerContainer);
                        const dispCrates = cratesOf(p.dispatched, p.unitsPerContainer);
                        const remCrates  = cratesOf(p.available,  p.unitsPerContainer);
                        const remColor   = remTextColor(p.available);
                        return (
                          <tr key={p.productId} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-slate-50 transition-colors`}>
                            <td className="px-4 py-2.5 text-sm text-slate-800 font-medium border-b border-slate-100 border-r border-slate-100 whitespace-nowrap">{p.productName}</td>
                            <td className="px-3 py-2.5 text-center text-sm tabular-nums font-bold text-blue-700 border-b border-slate-100 border-r border-slate-100">
                              {p.received > 0 ? p.received : <span className="text-slate-300 font-normal">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center text-xs tabular-nums text-blue-500 border-b border-slate-100 border-r border-slate-100">
                              {recCrates != null && p.received > 0 ? recCrates : <span className="text-slate-200">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center text-sm tabular-nums font-bold text-amber-700 border-b border-slate-100 border-r border-slate-100">
                              {p.dispatched > 0 ? p.dispatched : <span className="text-slate-300 font-normal">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center text-xs tabular-nums text-amber-500 border-b border-slate-100 border-r border-slate-100">
                              {dispCrates != null && p.dispatched > 0 ? dispCrates : <span className="text-slate-200">—</span>}
                            </td>
                            <td className={`px-3 py-2.5 text-center text-sm tabular-nums font-bold border-b border-slate-100 border-r border-slate-100 ${remColor}`}>
                              {p.available !== 0 ? p.available : <span className="text-slate-400 font-normal">0</span>}
                            </td>
                            <td className={`px-3 py-2.5 text-center text-xs tabular-nums border-b border-slate-100 ${remColor}`}>
                              {remCrates != null ? remCrates : <span className="text-slate-200">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="bg-emerald-800 px-4 py-3 text-xs font-bold text-white border-r border-emerald-700">Total</td>
                        <td className="bg-emerald-800 px-3 py-3 text-center text-sm font-bold text-white tabular-nums border-r border-emerald-700">
                          {totals.received > 0 ? totals.received : '—'}
                        </td>
                        <td className="bg-emerald-800 border-r border-emerald-700" />
                        <td className="bg-emerald-800 px-3 py-3 text-center text-sm font-bold text-white tabular-nums border-r border-emerald-700">
                          {totals.dispatched > 0 ? totals.dispatched : '—'}
                        </td>
                        <td className="bg-emerald-800 border-r border-emerald-700" />
                        <td className={`bg-emerald-800 px-3 py-3 text-center text-sm font-bold tabular-nums border-r border-emerald-700 ${totals.available >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                          {totals.available !== 0 ? totals.available : '—'}
                        </td>
                        <td className="bg-emerald-800" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ── Salesperson breakdown ── */}
          {spRows.length > 0 && (
            <div className="mx-4 mt-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Dispatched To</p>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100">
                {spRows.map(sp => (
                  <div key={sp.salespersonId} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <p className="text-sm font-bold text-slate-800">{sp.salespersonName}</p>
                      <span className="text-sm font-bold text-amber-700 tabular-nums flex-shrink-0">{sp.brandQty} units</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {sp.brandItems.map(item => (
                        <span key={item.productId} className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-medium tabular-nums">
                          {item.productName}: <span className="font-bold">{item.qty}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
