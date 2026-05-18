import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, AlertCircle, LayoutGrid, Search, X } from 'lucide-react';
import DateSelector from '../../components/DateSelector';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

export default function DailyDispatchSummary() {
  const [date, setDate]                 = useState(getIndiaDate());
  const [data, setData]                 = useState(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [selectedSpId, setSelectedSpId] = useState(null);
  const [search, setSearch]             = useState('');
  const [showZeroQty, setShowZeroQty]   = useState(false);

  useEffect(() => { fetchData(); }, [date]);

  async function fetchData() {
    setLoading(true); setError('');
    setSelectedSpId(null);
    try {
      const r = await api.get(`/reports/daily-dispatch?date=${date}`);
      const d = r.data.data;
      setData(d);
      const autoId = d.rows.find(row => row.totalAmount > 0)?.salespersonId
                     ?? d.rows[0]?.salespersonId ?? null;
      setSelectedSpId(autoId);
    } catch (e) {
      setError(e.response?.data?.error ?? 'Failed to load dispatch summary');
    } finally {
      setLoading(false);
    }
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return q ? data.rows.filter(r => r.salespersonName.toLowerCase().includes(q)) : data.rows;
  }, [data, search]);

  const selectedRow = useMemo(
    () => data?.rows.find(r => r.salespersonId === selectedSpId) ?? null,
    [data, selectedSpId],
  );

  // Flat brand-grouped table for the selected salesperson
  const tableData = useMemo(() => {
    if (!data || !selectedRow) return [];
    return data.brands
      .map(brand => {
        const products = brand.products
          .map(p => {
            const entry     = selectedRow.items[p.productId];
            const qty       = entry?.qty ?? 0;
            const unitPrice = entry?.unitPrice ?? null;
            return {
              productId:   p.productId,
              productName: p.productName,
              qty,
              unitPrice,
              amount: (qty > 0 && unitPrice != null) ? qty * unitPrice : 0,
            };
          })
          .filter(p => showZeroQty || p.qty > 0);
        const brandQtyTotal    = products.reduce((s, p) => s + p.qty, 0);
        const brandAmountTotal = products.reduce((s, p) => s + p.amount, 0);
        return { brandId: brand.brandId, brandName: brand.brandName, products, brandQtyTotal, brandAmountTotal };
      })
      .filter(b => b.products.length > 0);
  }, [data, selectedRow, showZeroQty]);

  const activeCount = useMemo(
    () => (data?.rows ?? []).filter(r => r.totalAmount > 0).length,
    [data],
  );

  const grandTotalAll = useMemo(
    () => (data?.rows ?? []).reduce((s, r) => s + r.totalAmount, 0),
    [data],
  );

  function SpRow({ row }) {
    const isSelected = row.salespersonId === selectedSpId;
    return (
      <li>
        <button
          type="button"
          onClick={() => setSelectedSpId(row.salespersonId)}
          className={`w-full text-left px-2 md:px-3 py-2 md:py-2.5 border-l-4 transition-colors ${
            isSelected
              ? 'bg-emerald-50 border-emerald-600'
              : 'border-transparent hover:bg-slate-50 active:bg-slate-100'
          }`}
        >
          <p className={`text-xs md:text-sm font-semibold leading-tight truncate ${isSelected ? 'text-emerald-800' : 'text-slate-800'}`}>
            {row.salespersonName}
          </p>
          <div className="mt-0.5">
            {row.totalAmount > 0 ? (
              <>
                <p className="hidden sm:block text-xs text-emerald-600 font-semibold tabular-nums">
                  {formatCurrency(row.totalAmount)}
                </p>
                <div className="sm:hidden w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </>
            ) : (
              <p className="hidden sm:block text-xs text-slate-300">No entry</p>
            )}
          </div>
        </button>
      </li>
    );
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <LayoutGrid size={17} className="text-emerald-300 flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white leading-tight">Daily Dispatch Sheet</h1>
            {data && !loading && (
              <p className="text-emerald-300 text-xs tabular-nums">
                {activeCount} active · {formatCurrency(grandTotalAll)}
              </p>
            )}
          </div>
        </div>
        <DateSelector date={date} onChange={setDate} dark />
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border-b border-red-200 text-red-700 px-4 py-2.5 text-sm flex-shrink-0">
          <AlertCircle size={14} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* ── Two-panel body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── LEFT PANEL — always visible ── */}
        <aside className="flex flex-col w-[100px] sm:w-[160px] md:w-[240px] flex-shrink-0 border-r border-slate-200 bg-white">

          {/* Search — desktop only */}
          <div className="hidden md:block p-3 border-b border-slate-100 flex-shrink-0">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search salesperson…"
                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
            </div>
          ) : (
            <ul className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {filteredRows.length === 0 ? (
                <li className="px-3 py-6 text-center text-slate-400 text-xs">
                  {search ? 'No results' : 'No data'}
                </li>
              ) : (
                filteredRows.map(row => <SpRow key={row.salespersonId} row={row} />)
              )}
            </ul>
          )}
        </aside>

        {/* ── RIGHT PANEL ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50">

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
            </div>
          ) : !data || !selectedRow ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              {data ? 'Select a salesperson' : null}
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">

              {/* Sub-header: name + toggle */}
              <div className="bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between gap-2 flex-shrink-0">
                <p className="text-sm font-bold text-slate-700 truncate">{selectedRow.salespersonName}</p>
                <button
                  type="button"
                  onClick={() => setShowZeroQty(v => !v)}
                  className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg border transition whitespace-nowrap ${
                    showZeroQty
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {showZeroQty ? 'All products' : 'Entered only'}
                </button>
              </div>

              {/* Flat table */}
              <div className="flex-1 overflow-y-auto p-3">
                {tableData.length === 0 ? (
                  <div className="bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center h-40 gap-2">
                    <AlertCircle size={20} className="text-slate-300" />
                    <p className="text-sm text-slate-400">No dispatch entry for this date</p>
                    {!showZeroQty && (
                      <button type="button" onClick={() => setShowZeroQty(true)} className="text-xs text-emerald-600 underline">
                        Show all products
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="min-w-full">
                      <thead className="bg-emerald-700">
                        <tr>
                          <th className="px-3 py-2.5 text-left text-xs font-bold text-white uppercase tracking-wider">Product</th>
                          <th className="px-2 py-2.5 text-right text-xs font-bold text-white uppercase tracking-wider w-10">Qty</th>
                          <th className="hidden sm:table-cell px-2 py-2.5 text-right text-xs font-bold text-white uppercase tracking-wider w-16">Rate</th>
                          <th className="px-3 py-2.5 text-right text-xs font-bold text-white uppercase tracking-wider w-20">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableData.map(brand => (
                          <React.Fragment key={brand.brandId}>
                            {/* Brand section header */}
                            <tr className="bg-slate-100">
                              <td colSpan={4} className="px-3 py-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                {brand.brandName}
                              </td>
                            </tr>

                            {/* Product rows */}
                            {brand.products.map(p => (
                              <tr key={p.productId} className="border-t border-slate-100 hover:bg-slate-50/60">
                                <td className="px-3 py-2 text-xs text-slate-700">{p.productName}</td>
                                <td className="px-2 py-2 text-right text-xs tabular-nums font-bold text-slate-800">
                                  {p.qty > 0 ? p.qty : <span className="text-slate-300 font-normal">—</span>}
                                </td>
                                <td className="hidden sm:table-cell px-2 py-2 text-right text-xs tabular-nums text-slate-500">
                                  {(p.unitPrice != null && p.qty > 0) ? formatCurrency(p.unitPrice) : <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                                  {p.amount > 0 ? formatCurrency(p.amount) : <span className="text-slate-300">—</span>}
                                </td>
                              </tr>
                            ))}

                            {/* Brand subtotal */}
                            <tr className="bg-emerald-50 border-t-2 border-emerald-100">
                              <td className="px-3 py-2 text-xs font-bold text-emerald-800">{brand.brandName} Total</td>
                              <td className="px-2 py-2 text-right text-xs font-bold text-emerald-700 tabular-nums">
                                {brand.brandQtyTotal > 0 ? brand.brandQtyTotal : '—'}
                              </td>
                              <td className="hidden sm:table-cell px-2 py-2" />
                              <td className="px-3 py-2 text-right text-xs font-bold text-emerald-700 tabular-nums">
                                {brand.brandAmountTotal > 0 ? formatCurrency(brand.brandAmountTotal) : '—'}
                              </td>
                            </tr>
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Grand total bar */}
              <div className="flex-shrink-0 bg-white border-t-2 border-emerald-200 px-3 md:px-4 py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Grand Total</p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{selectedRow.salespersonName}</p>
                </div>
                <p className="text-base md:text-lg font-extrabold text-emerald-700 tabular-nums flex-shrink-0">
                  {formatCurrency(selectedRow.totalAmount)}
                </p>
              </div>

            </div>
          )}
        </div>
      </div>

    </div>
  );
}
