import React, { useState, useEffect } from 'react';
import { Printer, ChevronDown, ChevronRight, AlertCircle, FileText, Package, BadgeCheck } from 'lucide-react';
import BrandedLoader from '../../components/ui/BrandedLoader';
import { getFirstDayOfMonth, getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';

// ─── Expandable row (identical shape to admin SalespersonStatement) ────────────

function ExpandableRow({ row, open, onToggle }) {
  const isOwing  = row.closingBalance > 0;
  const isCredit = row.closingBalance < 0;
  return (
    <React.Fragment>
      <tr
        className="hover:bg-slate-50/60 transition-colors cursor-pointer border-b border-slate-100"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5 text-xs text-slate-600 tabular-nums whitespace-nowrap">
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
            <div className="rounded-2xl overflow-hidden shadow-sm border border-slate-200 divide-y divide-slate-100">

              {/* ── Stock Received ── */}
              {row.items?.length > 0 && (
                <div>
                  {/* Solid blue header band */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-blue-600">
                    <div className="flex items-center gap-2">
                      <Package size={13} className="text-blue-200 flex-shrink-0" />
                      <span className="text-[10px] font-bold text-white uppercase tracking-widest">
                        Stock Received
                      </span>
                    </div>
                    <span className="text-sm font-bold text-white tabular-nums">
                      {formatCurrency(row.stockGiven)}
                    </span>
                  </div>
                  {/* Item rows */}
                  <div className="bg-white divide-y divide-slate-50">
                    {row.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-800 leading-tight truncate">
                            {item.productName}
                          </p>
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

              {/* ── Payments Made ── */}
              {row.payments?.length > 0 && (
                <div>
                  {/* Solid emerald header band */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-600">
                    <div className="flex items-center gap-2">
                      <BadgeCheck size={13} className="text-emerald-200 flex-shrink-0" />
                      <span className="text-[10px] font-bold text-white uppercase tracking-widest">
                        Payments Made
                      </span>
                    </div>
                    <span className="text-sm font-bold text-white tabular-nums">
                      {formatCurrency(row.payments.reduce((s, p) => s + p.amount, 0))}
                    </span>
                  </div>
                  {/* Payment rows */}
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
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyStatement() {
  const { user } = useAuth();

  const [from, setFrom]           = useState(getFirstDayOfMonth());
  const [to, setTo]               = useState(getIndiaDate());
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [expandedRows, setExpandedRows] = useState(new Set());

  // Which rows have detail to expand
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
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <FileText size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">My Statement</h1>
            <p className="text-emerald-300 text-xs">
              {user?.salespersonName ? `${user.salespersonName} — account statement` : 'Account statement'}
            </p>
          </div>
        </div>
        {rows.length > 0 && (
          <button
            onClick={() =>
              window.open(`/print/salesman-my-statement?from=${from}&to=${to}`, '_blank')
            }
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200 hover:text-white border border-emerald-600 hover:border-emerald-400 px-3 py-1.5 rounded-lg transition"
          >
            <Printer size={13} /> Print
          </button>
        )}
      </div>

      {/* ── Scrollable content ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="p-5 md:p-8 max-w-4xl mx-auto space-y-6">

          {/* ── Filters ─────────────────────────────────────────────── */}
          <div className="ddm-card p-4 flex flex-wrap gap-3 items-end">
            {[
              ['from', 'From', from, setFrom],
              ['to',   'To',   to,   setTo  ],
            ].map(([id, label, val, setter]) => (
              <div key={id}>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  {label}
                </label>
                <input
                  type="date"
                  value={val}
                  onChange={(e) => setter(e.target.value)}
                  max={getIndiaDate()}
                  className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                />
              </div>
            ))}

            {rows.length > 0 && (
              <div className={`px-3 py-2 rounded-xl font-bold text-sm ${
                isOwing  ? 'bg-red-50 text-red-700'
                : isCredit ? 'bg-violet-50 text-violet-700'
                : 'bg-emerald-50 text-emerald-700'
              }`}>
                Balance: {formatCurrency(closingBalance)}
              </div>
            )}
          </div>

          {/* ── Summary cards ───────────────────────────────────────── */}
          {rows.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="ddm-card p-4 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                  Total Billed
                </p>
                <p className="text-xl font-bold text-blue-600 tabular-nums">
                  {formatCurrency(totalGiven)}
                </p>
              </div>
              <div className="ddm-card p-4 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                  Total Paid
                </p>
                <p className="text-xl font-bold text-emerald-600 tabular-nums">
                  {formatCurrency(totalCollected)}
                </p>
              </div>
              <div className="ddm-card p-4 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                  {isOwing ? 'Outstanding' : isCredit ? 'Credit' : 'Balance'}
                </p>
                <p className={`text-xl font-bold tabular-nums ${
                  isOwing ? 'text-red-600' : isCredit ? 'text-violet-600' : 'text-emerald-600'
                }`}>
                  {formatCurrency(closingBalance)}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              <AlertCircle size={15} className="flex-shrink-0" /> {error}
            </div>
          )}

          {/* ── Statement table ─────────────────────────────────────── */}
          <div className="ddm-card overflow-hidden">
            <div className="px-4 py-3 bg-slate-700 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-white">Account Statement</h2>
                <p className="text-xs text-slate-400">
                  {rows.length} day{rows.length !== 1 ? 's' : ''} · tap a row to see stock &amp; payment details
                </p>
              </div>
              {expandableIndices.length > 0 && !loading && (
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
                  {loading ? (
                    <tr>
                      <td colSpan={6}>
                        <BrandedLoader size="sm" hideBrand inlinePadY="py-12" />
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 text-sm">
                        No data for this period
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, i) => (
                      <ExpandableRow
                        key={i}
                        row={row}
                        open={expandedRows.has(i)}
                        onToggle={() => toggleRow(i)}
                      />
                    ))
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot className="sticky bottom-0 z-10">
                    <tr>
                      <td className="px-4 py-3 bg-slate-700 text-xs font-bold text-white uppercase tracking-wider">Totals</td>
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
                )}
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
