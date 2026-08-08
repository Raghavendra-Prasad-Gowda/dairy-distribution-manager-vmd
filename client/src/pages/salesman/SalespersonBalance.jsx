import React, { useState, useEffect } from 'react';
import { TrendingUp, AlertCircle, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import BrandedLoader from '../../components/ui/BrandedLoader';
import { useAuth } from '../../context/AuthContext';
import { getIndiaDate, formatCurrency, formatDateShort } from '../../utils/dateUtils';
import api from '../../api/axios';

export default function SalespersonBalance() {
  const { user } = useAuth();

  const today = getIndiaDate();
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Date range filters — default to today
  const [fromDate, setFromDate] = useState(getIndiaDate());
  const [toDate, setToDate] = useState(getIndiaDate());

  const salespersonId = user?.salespersonId;

  useEffect(() => {
    if (!salespersonId) return;
    setLoading(true);
    setError('');

    const historyUrl = `/salesperson-balance/${salespersonId}/history?page=${pagination.page}&limit=${pagination.limit}&from=${fromDate}&to=${toDate}`;

    Promise.all([
      api.get(`/salesperson-balance/${salespersonId}?date=${today}`),
      api.get(historyUrl),
    ])
      .then(([balRes, histRes]) => {
        const bal = balRes.data.data;
        setBalance(bal || { openingBalance: 0, stockGiven: 0, amountPaid: 0, closingBalance: 0 });
        setHistory(histRes.data.data.items ?? []);
        setPagination(histRes.data.data.pagination);
      })
      .catch((e) => {
        setError(e.response?.data?.error ?? 'Failed to load balance information');
      })
      .finally(() => setLoading(false));
  }, [salespersonId, today, pagination.page, fromDate, toDate]);

  if (!salespersonId) {
    return <div className="p-4 text-center text-slate-500">Unable to load balance</div>;
  }

  const isOwing  = balance?.closingBalance > 0;
  const isCredit = balance?.closingBalance < 0;

  // History totals
  const histTotalBill    = history.reduce((s, e) => s + e.stockGiven, 0);
  const histTotalPaid    = history.reduce((s, e) => s + e.amountPaid, 0);
  const histLastBalance  = history[history.length - 1]?.closingBalance ?? 0;
  const histBalOwing     = histLastBalance > 0;
  const histBalCredit    = histLastBalance < 0;

  return (
    <div className="flex flex-col h-full bg-slate-100">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-2.5 px-4 py-3.5 bg-emerald-800">
        <TrendingUp size={17} className="text-emerald-300 flex-shrink-0" />
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-white leading-tight truncate">
            My Balance
          </h1>
          <p className="text-emerald-300 text-xs">Payment &amp; outstanding tracking</p>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-3 md:p-4 space-y-3">

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm">
              <AlertCircle size={15} className="flex-shrink-0" /> {error}
            </div>
          )}

          {loading ? (
            <BrandedLoader />
          ) : (
            <>
              {/* ── Main Balance Card ──────────────────────────────── */}
              <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-300 overflow-hidden">

                {/* Status badge row */}
                <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-blue-50 border-b-2 border-emerald-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={14} className="text-emerald-600" />
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-600">Current Balance</span>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                    isOwing ? 'bg-red-100 text-red-700' : isCredit ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {isOwing ? 'Outstanding' : isCredit ? 'Credit' : 'Settled'}
                  </span>
                </div>

                {/* Large balance number */}
                <div className="px-4 py-5 text-center border-b-2 border-slate-200">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                    {isOwing ? 'You Owe' : isCredit ? "You're in Credit" : 'Settled'}
                  </p>
                  <p className={`text-4xl font-extrabold tabular-nums leading-none ${
                    isOwing ? 'text-red-600' : isCredit ? 'text-violet-600' : 'text-emerald-600'
                  }`}>
                    {formatCurrency(Math.abs(balance?.closingBalance ?? 0))}
                  </p>
                </div>

                {/* 4 breakdown metrics — 2 cols on mobile, 4 on desktop */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-0.5 bg-slate-200">
                  {[
                    { label: 'Opening',   value: balance?.openingBalance ?? 0, color: 'text-slate-600' },
                    { label: 'Bill Today', value: balance?.stockGiven     ?? 0, color: 'text-blue-600' },
                    { label: 'Paid',       value: balance?.amountPaid     ?? 0, color: 'text-emerald-600' },
                    { label: 'Balance',    value: balance?.closingBalance  ?? 0,
                      color: isOwing ? 'text-red-600' : isCredit ? 'text-violet-600' : 'text-emerald-600' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-white p-3 text-center">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-1">{label}</p>
                      <p className={`text-sm font-extrabold tabular-nums ${color}`}>{formatCurrency(value)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Date Range Filter ──────────────────────────────── */}
              <div className="bg-white rounded-2xl shadow-sm p-4 border-2 border-slate-300">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar size={14} className="text-slate-600" />
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-600">History Range</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-1.5">From</label>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => { setFromDate(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
                      className="w-full min-w-0 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 appearance-none"
                      style={{ WebkitAppearance: 'none' }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-1.5">To</label>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => { setToDate(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
                      className="w-full min-w-0 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 appearance-none"
                      style={{ WebkitAppearance: 'none' }}
                    />
                  </div>
                </div>
                {pagination.total > 0 && (
                  <p className="text-[11px] text-slate-400 mt-2">
                    {history.length} of {pagination.total} records
                  </p>
                )}
              </div>

              {/* ── Payment History ────────────────────────────────── */}
              <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-300 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b-2 border-slate-200 flex items-center gap-2">
                  <Calendar size={14} className="text-slate-600" />
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-600">Payment History</span>
                </div>

                {history && history.length > 0 ? (
                  <>
                    {/* ── MOBILE: card list ── */}
                    <div className="md:hidden divide-y-2 divide-slate-100">
                      {history.map((entry, idx) => {
                        const entryOwing  = entry.closingBalance > 0;
                        const entryCredit = entry.closingBalance < 0;
                        return (
                          <div key={idx} className="px-4 py-3.5 flex items-center gap-3">
                            {/* Date pill — same style as My Statement */}
                            <div className="w-12 flex-shrink-0 bg-slate-100 rounded-xl py-2 text-center">
                              <p className="text-base font-extrabold text-slate-800 leading-none tabular-nums">
                                {new Date(entry.balanceDate).toLocaleDateString('en-IN', { day: '2-digit' })}
                              </p>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">
                                {new Date(entry.balanceDate).toLocaleDateString('en-IN', { month: 'short' })}
                              </p>
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                                  entryOwing  ? 'bg-red-50 text-red-600'
                                  : entryCredit ? 'bg-violet-50 text-violet-700'
                                  : 'bg-emerald-50 text-emerald-600'
                                }`}>
                                  {entryOwing ? 'Owing' : entryCredit ? 'Credit' : 'Paid'}
                                </span>
                              </div>
                              {/* 3 metrics */}
                              <div className="grid grid-cols-3 gap-2">
                                <div className="text-center">
                                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Bill</p>
                                  <p className="text-sm font-bold text-slate-700 tabular-nums">
                                    {formatCurrency(entry.stockGiven)}
                                  </p>
                                </div>
                                <div className="text-center">
                                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Paid</p>
                                  <p className="text-sm font-bold text-emerald-600 tabular-nums">
                                    {formatCurrency(entry.amountPaid)}
                                  </p>
                                </div>
                                <div className="text-center">
                                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Balance</p>
                                  <p className={`text-sm font-extrabold tabular-nums ${
                                    entryOwing ? 'text-red-600' : entryCredit ? 'text-violet-600' : 'text-emerald-600'
                                  }`}>
                                    {formatCurrency(Math.abs(entry.closingBalance))}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Mobile totals */}
                      <div className="flex items-center justify-between px-4 py-3 bg-slate-700">
                        <div className="flex items-center gap-5">
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Bill</p>
                            <p className="text-xs font-bold text-blue-300 tabular-nums">{formatCurrency(histTotalBill)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Paid</p>
                            <p className="text-xs font-bold text-emerald-300 tabular-nums">{formatCurrency(histTotalPaid)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Balance</p>
                          <p className={`text-sm font-bold tabular-nums ${
                            histBalOwing ? 'text-red-300' : histBalCredit ? 'text-violet-300' : 'text-emerald-300'
                          }`}>
                            {formatCurrency(Math.abs(histLastBalance))}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* ── DESKTOP: table ── */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100 border-b-2 border-slate-300">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Date</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Bill</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Paid</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Balance</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y-2 divide-slate-100">
                          {history.map((entry, idx) => {
                            const entryOwing  = entry.closingBalance > 0;
                            const entryCredit = entry.closingBalance < 0;
                            return (
                              <tr key={idx} className="hover:bg-slate-50 transition">
                                <td className="px-4 py-3 text-left text-sm font-semibold text-slate-700 whitespace-nowrap">
                                  {formatDateShort(entry.balanceDate)}
                                </td>
                                <td className="px-4 py-3 text-right text-sm text-slate-700 tabular-nums">
                                  {formatCurrency(entry.stockGiven)}
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-600 tabular-nums">
                                  {formatCurrency(entry.amountPaid)}
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-bold tabular-nums">
                                  <span className={`${entryOwing ? 'text-red-600' : entryCredit ? 'text-violet-600' : 'text-emerald-600'}`}>
                                    {formatCurrency(Math.abs(entry.closingBalance))}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                                    entryOwing  ? 'bg-red-50 text-red-600'
                                    : entryCredit ? 'bg-violet-50 text-violet-700'
                                    : 'bg-emerald-50 text-emerald-600'
                                  }`}>
                                    {entryOwing ? 'Owing' : entryCredit ? 'Credit' : 'Paid'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-slate-300">
                            <td className="px-4 py-3 bg-slate-700 text-left text-xs font-bold text-white uppercase tracking-wider">
                              Totals
                            </td>
                            <td className="px-4 py-3 bg-slate-700 text-right text-xs font-bold text-blue-300 tabular-nums">
                              {formatCurrency(histTotalBill)}
                            </td>
                            <td className="px-4 py-3 bg-slate-700 text-right text-xs font-bold text-emerald-300 tabular-nums">
                              {formatCurrency(histTotalPaid)}
                            </td>
                            <td className={`px-4 py-3 bg-slate-700 text-right text-xs font-bold tabular-nums ${
                              histBalOwing ? 'text-red-300' : histBalCredit ? 'text-violet-300' : 'text-emerald-300'
                            }`}>
                              {formatCurrency(Math.abs(histLastBalance))}
                            </td>
                            <td className="px-4 py-3 bg-slate-700 text-center">
                              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                                histBalOwing  ? 'bg-red-900/40 text-red-300'
                                : histBalCredit ? 'bg-violet-900/40 text-violet-300'
                                : 'bg-emerald-900/40 text-emerald-300'
                              }`}>
                                {histBalOwing ? 'Owing' : histBalCredit ? 'Credit' : 'Settled'}
                              </span>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Pagination */}
                    {pagination.pages > 1 && (
                      <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                        <button
                          onClick={() => setPagination(p => ({ ...p, page: Math.max(1, p.page - 1) }))}
                          disabled={pagination.page === 1}
                          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                          <ChevronLeft size={16} /> Prev
                        </button>
                        <span className="text-xs font-semibold text-slate-600">
                          {pagination.page} / {pagination.pages}
                        </span>
                        <button
                          onClick={() => setPagination(p => ({ ...p, page: Math.min(p.pages, p.page + 1) }))}
                          disabled={pagination.page === pagination.pages}
                          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                          Next <ChevronRight size={16} />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="px-4 py-8 text-center text-slate-400 text-sm">
                    No payment history for this date range
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
