import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, Wallet, Search, X } from 'lucide-react';
import BrandedLoader from '../../components/ui/BrandedLoader';
import DateSelector from '../../components/DateSelector';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

export default function SalesmanDayBalance() {
  const [date, setDate]       = useState(getIndiaDate());
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api.get(`/salesperson-balance?date=${date}`)
      .then(r => {
        const all = r.data.data ?? [];
        const active = all.filter(b =>
          Number(b.openingBalance) !== 0 || Number(b.amountPaid) !== 0 || Number(b.closingBalance) !== 0
        );
        active.sort((a, b) => a.salespersonName.localeCompare(b.salespersonName));
        setRows(active);
      })
      .catch(e => setError(e.response?.data?.error ?? 'Failed to load balances'))
      .finally(() => setLoading(false));
  }, [date]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.salespersonName.toLowerCase().includes(q) ||
      (r.route ?? '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totals = useMemo(() => ({
    outstanding: filteredRows.reduce((s, r) => s + Number(r.openingBalance), 0),
    paid:        filteredRows.reduce((s, r) => s + Number(r.amountPaid),     0),
    remaining:   filteredRows.reduce((s, r) => s + Number(r.closingBalance), 0),
  }), [filteredRows]);

  const remColor = (v) => v > 0 ? 'text-red-600' : v < 0 ? 'text-violet-600' : 'text-emerald-600';

  return (
    <div className="flex flex-col h-full bg-slate-100">

      {/* Page header */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Wallet size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Day Balance</h1>
            <p className="text-emerald-300 text-xs">Outstanding, paid and remaining per salesman</p>
          </div>
        </div>
        <DateSelector date={date} onChange={setDate} dark />
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border-b border-red-200 text-red-700 px-4 py-2.5 text-sm flex-shrink-0">
          <AlertCircle size={14} className="flex-shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex-1"><BrandedLoader /></div>
      ) : rows.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400">
          <AlertCircle size={22} className="text-slate-300" />
          <p className="text-sm">All settled — no outstanding or payments for this date</p>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 p-4 gap-3">

          {/* Search */}
          <div className="relative max-w-sm flex-shrink-0">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or route…"
              className="w-full pl-8 pr-7 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-300"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="h-full overflow-auto">
              <table className="min-w-full text-sm border-separate border-spacing-0">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="bg-emerald-700 px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600">Salesman</th>
                    <th className="bg-emerald-700 px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 whitespace-nowrap">Outstanding Balance</th>
                    <th className="bg-emerald-700 px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 whitespace-nowrap">Amount Paid Today</th>
                    <th className="bg-emerald-700 px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap">Amount Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-slate-400 text-sm">No salesmen match your search.</td>
                    </tr>
                  ) : (
                    filteredRows.map((r, idx) => (
                      <tr key={r.salespersonId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                        <td className="px-4 py-2.5 border-b border-r border-slate-100">
                          <p className="text-sm font-semibold text-slate-800 leading-tight">{r.salespersonName}</p>
                          {r.route && <p className="text-xs text-slate-400 leading-tight mt-0.5">{r.route}</p>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums text-slate-600 border-b border-r border-slate-100">
                          {formatCurrency(r.openingBalance)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums font-semibold text-emerald-600 border-b border-r border-slate-100">
                          {Number(r.amountPaid) > 0 ? formatCurrency(r.amountPaid) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className={`px-4 py-2.5 text-right text-sm tabular-nums font-bold border-b border-slate-100 ${remColor(Number(r.closingBalance))}`}>
                          {formatCurrency(r.closingBalance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {filteredRows.length > 0 && (
                  <tfoot className="sticky bottom-0 z-10">
                    <tr>
                      <td className="bg-slate-700 px-4 py-3 text-xs font-bold text-white uppercase tracking-wider border-r border-slate-600">
                        Totals · {filteredRows.length} salesm{filteredRows.length === 1 ? 'an' : 'en'}
                      </td>
                      <td className="bg-slate-700 px-4 py-3 text-right text-sm font-bold text-white tabular-nums border-r border-slate-600">
                        {formatCurrency(totals.outstanding)}
                      </td>
                      <td className="bg-slate-700 px-4 py-3 text-right text-sm font-bold text-emerald-300 tabular-nums border-r border-slate-600">
                        {formatCurrency(totals.paid)}
                      </td>
                      <td className={`bg-slate-700 px-4 py-3 text-right text-sm font-bold tabular-nums ${
                        totals.remaining > 0 ? 'text-red-300' : totals.remaining < 0 ? 'text-violet-300' : 'text-emerald-300'
                      }`}>
                        {formatCurrency(totals.remaining)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
