import React, { useState, useEffect } from 'react';
import { Printer, ChevronDown, ChevronRight, AlertCircle, FileText, Package, BadgeCheck } from 'lucide-react';
import BrandedLoader from '../../components/ui/BrandedLoader';
import { getFirstDayOfMonth, getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

// ─── Shared breakdown panel (mobile cards + desktop expanded rows) ─────────────

function BreakdownPanel({ row }) {
  return (
    <div className="rounded-2xl overflow-hidden shadow-sm border border-slate-200 divide-y divide-slate-100">

      {row.items?.length > 0 && (
        <div>
          <div className="flex items-center justify-between px-4 py-2.5 bg-blue-600">
            <div className="flex items-center gap-2">
              <Package size={13} className="text-blue-200 flex-shrink-0" />
              <span className="text-[10px] font-bold text-white uppercase tracking-widest">Stock Received</span>
            </div>
            <span className="text-sm font-bold text-white tabular-nums">{formatCurrency(row.stockGiven)}</span>
          </div>
          <div className="bg-white divide-y divide-slate-50">
            {row.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800 leading-tight truncate">{item.productName}</p>
                  <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                    {item.brandName} &middot; {item.quantity} × ₹{item.unitPrice}
                  </p>
                </div>
                <span className="text-xs font-bold text-blue-700 tabular-nums whitespace-nowrap flex-shrink-0">
                  {formatCurrency(item.totalAmount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {row.payments?.length > 0 && (
        <div>
          <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-600">
            <div className="flex items-center gap-2">
              <BadgeCheck size={13} className="text-emerald-200 flex-shrink-0" />
              <span className="text-[10px] font-bold text-white uppercase tracking-widest">Payments Made</span>
            </div>
            <span className="text-sm font-bold text-white tabular-nums">
              {formatCurrency(row.payments.reduce((s, p) => s + p.amount, 0))}
            </span>
          </div>
          <div className="bg-white divide-y divide-slate-50">
            {row.payments.map((p, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 uppercase tracking-wide flex-shrink-0">
                  {p.mode || 'Cash'}
                </span>
                <span className="text-xs font-bold text-emerald-700 tabular-nums">
                  {formatCurrency(p.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Desktop-only expandable table row ────────────────────────────────────────

function ExpandableRow({ row, open, onToggle }) {
  const isOwing  = row.closingBalance > 0;
  const isCredit = row.closingBalance < 0;
  return (
    <React.Fragment>
      <tr
        className="hover:bg-slate-50/60 transition-colors cursor-pointer border-b border-slate-100"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5 text-left text-xs text-slate-600 tabular-nums whitespace-nowrap">
          {new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
        </td>
        <td className="px-4 py-2.5 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">
          {formatCurrency(row.openingBalance)}
        </td>
        <td className="px-4 py-2.5 text-right text-xs text-blue-600 tabular-nums whitespace-nowrap">
          {formatCurrency(row.stockGiven)}
        </td>
        <td className="px-4 py-2.5 text-right text-xs text-emerald-600 tabular-nums whitespace-nowrap">
          {formatCurrency(row.amountPaid)}
        </td>
        <td className={`px-4 py-2.5 text-right text-xs font-bold tabular-nums whitespace-nowrap ${
          isOwing ? 'text-red-600' : isCredit ? 'text-violet-600' : 'text-emerald-600'
        }`}>
          {formatCurrency(row.closingBalance)}
        </td>
        <td className="px-4 py-2.5 text-right text-slate-400">
          {open
            ? <ChevronDown  size={13} className="ml-auto" />
            : <ChevronRight size={13} className="ml-auto" />}
        </td>
      </tr>

      {open && (row.items?.length > 0 || row.payments?.length > 0) && (
        <tr>
          <td colSpan={6} className="border-b border-slate-100 bg-slate-50 px-3 py-3">
            <BreakdownPanel row={row} />
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyStatement() {
  const [from, setFrom]           = useState(getFirstDayOfMonth());
  const [to, setTo]               = useState(getIndiaDate());
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [expandedRows, setExpandedRows] = useState(new Set());

  const expandableIndices = rows.reduce((acc, r, i) => {
    if (r.items?.length > 0 || r.payments?.length > 0) acc.push(i);
    return acc;
  }, []);
  const allExpanded =
    expandableIndices.length > 0 &&
    expandableIndices.every(i => expandedRows.has(i));

  function toggleRow(i) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }
  function expandAll()   { setExpandedRows(new Set(expandableIndices)); }
  function collapseAll() { setExpandedRows(new Set()); }

  useEffect(() => { fetchReport(); }, [from, to]);

  async function fetchReport() {
    setLoading(true);
    setError('');
    setExpandedRows(new Set());
    try {
      const r = await api.get(`/salesperson-statement/me?from=${from}&to=${to}`);
      setRows(r.data.data);
    } catch (e) {
      setError(e.response?.data?.error ?? 'Failed to load statement');
    } finally {
      setLoading(false);
    }
  }

  const closingBalance = rows.length ? rows[rows.length - 1].closingBalance : 0;
  const totalGiven     = rows.reduce((s, r) => s + r.stockGiven, 0);
  const totalCollected = rows.reduce((s, r) => s + r.amountPaid, 0);
  const isOwing  = closingBalance > 0;
  const isCredit = closingBalance < 0;

  return (
    <div className="flex flex-col h-full">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText size={17} className="text-emerald-300 flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white leading-tight">My Statement</h1>
            <p className="text-emerald-300 text-xs truncate">Account statement</p>
          </div>
        </div>
        {rows.length > 0 && (
          <button
            onClick={() =>
              window.open(`/print/salesman-my-statement?from=${from}&to=${to}`, '_blank')
            }
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200 hover:text-white border border-emerald-600 hover:border-emerald-400 px-3 py-1.5 rounded-lg transition flex-shrink-0"
          >
            <Printer size={13} /> Print
          </button>
        )}
      </div>

      {/* ── Scrollable content ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-3">

          {/* ── Date filters ────────────────────────────────────────── */}
          <div className="ddm-card p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                ['from', 'From', from, setFrom],
                ['to',   'To',   to,   setTo  ],
              ].map(([id, label, val, setter]) => (
                <div key={id}>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    {label}
                  </label>
                  <input
                    type="date"
                    value={val}
                    onChange={(e) => setter(e.target.value)}
                    max={getIndiaDate()}
                    className="w-full min-w-0 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white appearance-none"
                    style={{ WebkitAppearance: 'none' }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── Summary cards ───────────────────────────────────────── */}
          {rows.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <div className="ddm-card p-3 text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Billed</p>
                <p className="text-sm font-bold text-blue-600 tabular-nums leading-tight">
                  {formatCurrency(totalGiven)}
                </p>
              </div>
              <div className="ddm-card p-3 text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Paid</p>
                <p className="text-sm font-bold text-emerald-600 tabular-nums leading-tight">
                  {formatCurrency(totalCollected)}
                </p>
              </div>
              <div className={`rounded-2xl shadow-sm border p-3 text-center ${
                isOwing  ? 'bg-red-50 border-red-100'
                : isCredit ? 'bg-violet-50 border-violet-100'
                : 'bg-emerald-50 border-emerald-100'
              }`}>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                  {isOwing ? 'Owed' : isCredit ? 'Credit' : 'Settled'}
                </p>
                <p className={`text-sm font-bold tabular-nums leading-tight ${
                  isOwing ? 'text-red-600' : isCredit ? 'text-violet-600' : 'text-emerald-600'
                }`}>
                  {formatCurrency(closingBalance)}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm">
              <AlertCircle size={15} className="flex-shrink-0" /> {error}
            </div>
          )}

          {/* ── Statement content ─────────────────────────────────────── */}
          {loading ? (
            <div className="ddm-card py-12">
              <BrandedLoader size="sm" hideBrand inlinePadY="py-0" />
            </div>
          ) : rows.length === 0 && !error ? (
            <div className="ddm-card py-12 text-center text-slate-400 text-sm">
              No data for this period
            </div>
          ) : rows.length > 0 && (
            <>
              {/* Expand-all control */}
              {expandableIndices.length > 0 && (
                <div className="flex items-center justify-between px-1">
                  <p className="text-[11px] text-slate-400 font-medium">
                    {rows.length} day{rows.length !== 1 ? 's' : ''} · tap a row to expand
                  </p>
                  <button
                    onClick={allExpanded ? collapseAll : expandAll}
                    className="flex items-center gap-1 text-xs font-semibold text-emerald-700"
                  >
                    {allExpanded
                      ? <><ChevronRight size={12} /> Collapse All</>
                      : <><ChevronDown  size={12} /> Expand All</>}
                  </button>
                </div>
              )}

              {/* ══ MOBILE: card list (hidden on md+) ══════════════════ */}
              <div className="md:hidden ddm-card overflow-hidden divide-y divide-slate-100">
                {rows.map((row, i) => {
                  const rowOwing  = row.closingBalance > 0;
                  const rowCredit = row.closingBalance < 0;
                  const hasDetail = row.items?.length > 0 || row.payments?.length > 0;
                  return (
                    <React.Fragment key={i}>
                      <button
                        onClick={() => hasDetail && toggleRow(i)}
                        className={`w-full px-4 py-4 flex items-center gap-3 text-left ${
                          hasDetail ? 'active:bg-slate-50' : 'cursor-default'
                        }`}
                      >
                        {/* Date pill */}
                        <div className="w-12 flex-shrink-0 bg-slate-100 rounded-xl py-2 text-center">
                          <p className="text-base font-extrabold text-slate-800 leading-none tabular-nums">
                            {new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit' })}
                          </p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">
                            {new Date(row.date).toLocaleDateString('en-IN', { month: 'short' })}
                          </p>
                        </div>

                        {/* Billed + Paid */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs font-semibold text-blue-600 tabular-nums">
                              Bill: {formatCurrency(row.stockGiven)}
                            </span>
                            <span className="text-xs font-semibold text-emerald-600 tabular-nums">
                              Paid: {formatCurrency(row.amountPaid)}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                            Opening: {formatCurrency(row.openingBalance)}
                          </p>
                        </div>

                        {/* Balance + chevron */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className={`text-sm font-bold tabular-nums ${
                            rowOwing ? 'text-red-600' : rowCredit ? 'text-violet-600' : 'text-emerald-600'
                          }`}>
                            {formatCurrency(row.closingBalance)}
                          </span>
                          {hasDetail && (
                            expandedRows.has(i)
                              ? <ChevronDown  size={12} className="text-slate-400" />
                              : <ChevronRight size={12} className="text-slate-400" />
                          )}
                        </div>
                      </button>

                      {expandedRows.has(i) && hasDetail && (
                        <div className="px-3 pb-3 bg-slate-50">
                          <BreakdownPanel row={row} />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Mobile totals footer */}
                <div className="flex items-center justify-between px-4 py-3.5 bg-slate-700">
                  <div className="flex items-center gap-5">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Billed</p>
                      <p className="text-sm font-bold text-blue-300 tabular-nums">{formatCurrency(totalGiven)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Paid</p>
                      <p className="text-sm font-bold text-emerald-300 tabular-nums">{formatCurrency(totalCollected)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Balance</p>
                    <p className={`text-base font-bold tabular-nums ${
                      isOwing ? 'text-red-300' : isCredit ? 'text-violet-300' : 'text-emerald-300'
                    }`}>{formatCurrency(closingBalance)}</p>
                  </div>
                </div>
              </div>

              {/* ══ DESKTOP: table (hidden below md) ═══════════════════ */}
              <div className="hidden md:block ddm-card overflow-hidden">
                <div className="px-4 py-3 bg-slate-700 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-white">Account Statement</h2>
                    <p className="text-xs text-slate-400">
                      {rows.length} day{rows.length !== 1 ? 's' : ''} · click a row to see details
                    </p>
                  </div>
                  {expandableIndices.length > 0 && (
                    <button
                      onClick={allExpanded ? collapseAll : expandAll}
                      className="flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-white transition whitespace-nowrap flex-shrink-0"
                    >
                      {allExpanded
                        ? <><ChevronRight size={13} /> Collapse All</>
                        : <><ChevronDown  size={13} /> Expand All</>}
                    </button>
                  )}
                </div>
                <div className="overflow-auto max-h-[60vh]">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-emerald-700 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Opening</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Billed</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Paid</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Balance</th>
                        <th className="px-4 py-3 w-8" />
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {rows.map((row, i) => (
                        <ExpandableRow
                          key={i}
                          row={row}
                          open={expandedRows.has(i)}
                          onToggle={() => toggleRow(i)}
                        />
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 z-10">
                      <tr>
                        <td className="px-4 py-3 bg-slate-700 text-left text-xs font-bold text-white uppercase tracking-wider">Totals</td>
                        <td className="px-4 py-3 bg-slate-700 text-right text-xs text-slate-400">—</td>
                        <td className="px-4 py-3 bg-slate-700 text-right text-xs font-bold text-blue-300 tabular-nums">
                          {formatCurrency(totalGiven)}
                        </td>
                        <td className="px-4 py-3 bg-slate-700 text-right text-xs font-bold text-emerald-300 tabular-nums">
                          {formatCurrency(totalCollected)}
                        </td>
                        <td className={`px-4 py-3 bg-slate-700 text-right text-xs font-bold tabular-nums ${
                          isOwing ? 'text-red-300' : isCredit ? 'text-violet-300' : 'text-emerald-300'
                        }`}>
                          {formatCurrency(closingBalance)}
                        </td>
                        <td className="px-4 py-3 bg-slate-700" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
