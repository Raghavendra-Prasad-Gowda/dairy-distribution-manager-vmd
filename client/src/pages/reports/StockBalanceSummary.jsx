import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, AlertCircle, Warehouse } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
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
      api.get(`/reports/daily-dispatch?date=${date}`),
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
        return { salespersonId: row.salespersonId, salespersonName: row.salespersonName, items: row.items, brandQty };
      })
      .filter(r => r.brandQty > 0)
      .sort((a, b) => b.brandQty - a.brandQty);
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

  const grandTotals = useMemo(() => ({
    dispatched: colTotals.reduce((s, c) => s + c.dispatched, 0),
    received:   colTotals.reduce((s, c) => s + c.received,   0),
    remaining:  colTotals.reduce((s, c) => s + c.remaining,  0),
  }), [colTotals]);

  const remColor = (v) => v > 0 ? 'text-emerald-300' : v < 0 ? 'text-red-300' : 'text-slate-400';
  const remBg    = (v) => v > 0 ? 'bg-emerald-800'   : v < 0 ? 'bg-red-900'   : 'bg-slate-700';

  const hasData = !loading && spRows.length > 0;

  return (
    <div className="bg-slate-100 pb-6 min-h-full">

      {/* Header */}
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
      ) : !hasData ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-400">
          <AlertCircle size={22} className="text-slate-300" />
          <p className="text-sm">No dispatch data for this date</p>
        </div>
      ) : (
        <>
          {/* Summary chips */}
          <div className="flex gap-2 px-4 pt-3 pb-1 flex-wrap">
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
              <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wide">Received</span>
              <span className="text-sm font-extrabold text-blue-700 tabular-nums">{grandTotals.received || '—'}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wide">Dispatched</span>
              <span className="text-sm font-extrabold text-amber-700 tabular-nums">{grandTotals.dispatched}</span>
            </div>
            <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 border ${
              grandTotals.remaining >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
            }`}>
              <span className={`text-[10px] font-bold uppercase tracking-wide ${grandTotals.remaining >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>Remaining</span>
              <span className={`text-sm font-extrabold tabular-nums ${grandTotals.remaining >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{grandTotals.remaining}</span>
            </div>
          </div>

          {/* Matrix table */}
          <div className="mx-4 mt-2">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table
                  className="text-sm border-separate border-spacing-0"
                  style={{ minWidth: `${160 + products.length * 68 + 64}px` }}
                >
                  {/* Column headers — product names */}
                  <thead>
                    <tr>
                      <th
                        className="sticky left-0 z-20 bg-emerald-700 px-3 py-2.5 text-left text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600"
                        style={{ minWidth: 160 }}
                      >
                        Salesperson
                      </th>
                      {products.map(p => (
                        <th
                          key={p.productId}
                          className="bg-emerald-700 px-2 py-2.5 text-center text-[10px] font-bold text-white leading-tight border-r border-emerald-600"
                          style={{ minWidth: 60 }}
                        >
                          {p.productName}
                        </th>
                      ))}
                      <th
                        className="bg-emerald-600 px-2 py-2.5 text-center text-xs font-bold text-white uppercase"
                        style={{ minWidth: 60 }}
                      >
                        Total
                      </th>
                    </tr>
                  </thead>

                  {/* Salesperson data rows */}
                  <tbody>
                    {spRows.map((row, idx) => (
                      <tr key={row.salespersonId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                        <td
                          className={`sticky left-0 z-10 px-3 py-2 text-sm font-semibold text-slate-800 border-b border-r border-slate-100 whitespace-nowrap ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                          style={{ minWidth: 160 }}
                        >
                          {row.salespersonName}
                        </td>
                        {products.map(p => {
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
                      </tr>
                    ))}
                  </tbody>

                  {/* Summary footer rows — mirror the paper: Dispatched → Received → Remaining */}
                  <tfoot>
                    {/* DISPATCHED */}
                    <tr>
                      <td className="sticky left-0 z-10 bg-slate-600 px-3 py-2.5 text-xs font-bold text-white border-t-2 border-slate-500 border-r border-slate-500 uppercase tracking-wider whitespace-nowrap">
                        Dispatched
                      </td>
                      {colTotals.map(c => (
                        <td key={c.productId} className="bg-slate-600 px-2 py-2.5 text-center text-sm tabular-nums font-bold text-white border-t-2 border-r border-slate-500">
                          {c.dispatched > 0 ? c.dispatched : <span className="text-slate-400">—</span>}
                        </td>
                      ))}
                      <td className="bg-slate-600 px-2 py-2.5 text-center text-sm font-bold text-white border-t-2">
                        {grandTotals.dispatched > 0 ? grandTotals.dispatched : '—'}
                      </td>
                    </tr>

                    {/* RECEIVED */}
                    <tr>
                      <td className="sticky left-0 z-10 bg-blue-700 px-3 py-2.5 text-xs font-bold text-blue-100 border-r border-blue-600 uppercase tracking-wider whitespace-nowrap">
                        Received
                      </td>
                      {colTotals.map(c => (
                        <td key={c.productId} className="bg-blue-700 px-2 py-2.5 text-center text-sm tabular-nums font-bold text-white border-r border-blue-600">
                          {c.received > 0 ? c.received : <span className="text-blue-400">—</span>}
                        </td>
                      ))}
                      <td className="bg-blue-700 px-2 py-2.5 text-center text-sm font-bold text-white">
                        {grandTotals.received > 0 ? grandTotals.received : '—'}
                      </td>
                    </tr>

                    {/* REMAINING */}
                    <tr>
                      <td className="sticky left-0 z-10 bg-emerald-800 px-3 py-2.5 text-xs font-bold text-emerald-200 border-r border-emerald-700 uppercase tracking-wider whitespace-nowrap">
                        Remaining
                      </td>
                      {colTotals.map(c => (
                        <td key={c.productId} className={`px-2 py-2.5 text-center text-sm tabular-nums font-bold border-r border-emerald-700 ${remBg(c.remaining)} ${remColor(c.remaining)}`}>
                          {c.remaining !== 0 ? c.remaining : <span className="text-slate-500">0</span>}
                        </td>
                      ))}
                      <td className={`px-2 py-2.5 text-center text-sm font-bold ${remBg(grandTotals.remaining)} ${remColor(grandTotals.remaining)}`}>
                        {grandTotals.remaining !== 0 ? grandTotals.remaining : '0'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
