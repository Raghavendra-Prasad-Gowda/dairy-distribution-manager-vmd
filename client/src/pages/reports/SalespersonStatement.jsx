import React, { useState, useEffect, useMemo } from 'react';
import { Printer, ChevronDown, ChevronRight, AlertCircle, User, Search, X, FileText, Package } from 'lucide-react';
import BrandedLoader from '../../components/ui/BrandedLoader';
import DispatchStockSummaryView from '../../components/DispatchStockSummary';
import { getFirstDayOfMonth, getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import { useApiResource } from '../../hooks/useApiResource';
import { buildDispatchStockSummary } from '../../utils/salespersonProductStatement';
import api from '../../api/axios';

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
        <td className={`px-4 py-2.5 text-right text-xs font-bold tabular-nums whitespace-nowrap ${isOwing ? 'text-red-600' : isCredit ? 'text-violet-600' : 'text-emerald-600'}`}>
          {formatCurrency(row.closingBalance)}
        </td>
        <td className="px-4 py-2.5 text-right text-slate-400">
          {open ? <ChevronDown size={13} className="ml-auto" /> : <ChevronRight size={13} className="ml-auto" />}
        </td>
      </tr>
      {open && (row.items?.length > 0 || row.payments?.length > 0) && (
        <tr>
          <td colSpan={6} className="px-4 py-3 bg-emerald-50/50 border-b border-slate-100">
            <div className="space-y-3">
              {row.items?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1.5">Stock Dispatched</p>
                  <div className="space-y-1">
                    {row.items.map((item, i) => (
                      <div key={i} className="grid grid-cols-3 text-xs">
                        <span className="font-medium text-slate-700">{item.brandName} {item.productName}</span>
                        <span className="text-right text-slate-500">{item.quantity} × ₹{item.unitPrice}</span>
                        <span className="text-right font-semibold text-slate-700">{formatCurrency(item.totalAmount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {row.payments?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1.5">Collections</p>
                  <div className="flex gap-2 flex-wrap">
                    {row.payments.map((p, i) => (
                      <span key={i} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                        {formatCurrency(p.amount)} via {p.mode || 'Cash'}
                      </span>
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

function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function SalespersonStatement() {
  const [salespeople, setSalespeople] = useState([]);
  const [search, setSearch]          = useState('');
  const [selectedSp, setSelectedSp]  = useState('');
  const [from, setFrom]              = useState(getFirstDayOfMonth());
  const [to, setTo]                  = useState(getIndiaDate());
  const [spError, setSpError]        = useState('');
  const [expandedRows, setExpandedRows] = useState(new Set());
  // 'balance'  — the existing day-by-day opening/given/collected/due statement
  // 'dispatch' — a Brand → Category → Product Dispatch Stock Summary for the
  //              whole date range (same shape as the Dairy Stock Summary
  //              report, minus Route and Unit Price)
  const [view, setView] = useState('balance');

  const { data: rows, loading, error: reportError } = useApiResource(
    selectedSp ? `/reports/salesperson-statement?salespersonId=${selectedSp}&from=${from}&to=${to}` : null,
    {
      initialData: [],
      notifyOnError: false,
      // Collapse any expanded rows whenever a new report loads — mirrors the
      // old fetchReport's setExpandedRows(new Set()) at fetch-start; the
      // table is hidden behind BrandedLoader while loading either way.
      select: (payload) => { setExpandedRows(new Set()); return payload; },
    }
  );
  const error = reportError || spError;

  const expandableIndices = rows.reduce((acc, r, i) => {
    if (r.items?.length > 0 || r.payments?.length > 0) acc.push(i);
    return acc;
  }, []);
  const allExpanded = expandableIndices.length > 0 && expandableIndices.every(i => expandedRows.has(i));

  function toggleRow(i) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }
  function expandAll()   { setExpandedRows(new Set(expandableIndices)); }
  function collapseAll() { setExpandedRows(new Set()); }

  useEffect(() => {
    api.get('/salespeople')
      .then((r) => {
        const sp = r.data.data;
        setSalespeople(sp);
        if (sp.length) setSelectedSp(String(sp[0].id));
      })
      .catch(() => setSpError('Failed to load salespeople'));
  }, []);

  const closingBalance  = rows.length ? rows[rows.length - 1].closingBalance : 0;
  const totalGiven      = rows.reduce((s, r) => s + r.stockGiven,  0);
  const totalCollected  = rows.reduce((s, r) => s + r.amountPaid,  0);
  const selectedSpObj   = salespeople.find(sp => String(sp.id) === String(selectedSp));

  const dispatchSummary = useMemo(() => buildDispatchStockSummary(rows), [rows]);
  const hasContent = view === 'balance' ? rows.length > 0 : dispatchSummary.brands.length > 0;

  const filteredSps = salespeople.filter(sp =>
    sp.name.toLowerCase().includes(search.toLowerCase()) ||
    (sp.route ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">

      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <User size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Salesperson Statement</h1>
            <p className="text-emerald-300 text-xs">Account statement per salesperson</p>
          </div>
        </div>
        {hasContent && (
          <button
            onClick={() => window.open(`/print/salesperson-statement?salespersonId=${selectedSp}&from=${from}&to=${to}&type=${view}`, '_blank')}
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200 hover:text-white border border-emerald-600 hover:border-emerald-400 px-3 py-1.5 rounded-lg transition"
          >
            <Printer size={13} /> Print
          </button>
        )}
      </div>

    {/* ── Split panel ──────────────────────────────────────────────── */}
    <div className="flex flex-1 overflow-hidden">

      {/* ── Left panel: always visible ─────────────────────────────── */}
      <div className="flex flex-col w-64 flex-shrink-0 border-r border-slate-200 bg-white">
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or route…"
              className="w-full pl-8 pr-7 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-slate-50"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredSps.length === 0 ? (
            <p className="px-3 py-6 text-center text-slate-400 text-xs">No results</p>
          ) : (
            filteredSps.map(sp => {
              const isSelected = String(sp.id) === String(selectedSp);
              return (
                <button
                  key={sp.id}
                  onClick={() => setSelectedSp(String(sp.id))}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors ${
                    isSelected
                      ? 'bg-emerald-50 border-l-4 border-l-emerald-600'
                      : 'border-l-4 border-l-transparent hover:bg-slate-50'
                  }`}
                >
                  <p className={`text-sm font-semibold truncate ${isSelected ? 'text-emerald-800' : 'text-slate-800'}`}>
                    {sp.name}
                  </p>
                  {sp.route && <p className="text-xs text-slate-400 truncate mt-0.5">{sp.route}</p>}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        {!selectedSp ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            Select a salesperson
          </div>
        ) : (
          <>
          {selectedSpObj && (
            <div className="flex items-center gap-2.5 px-5 py-3 bg-emerald-700">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {getInitials(selectedSpObj.name)}
              </div>
              <div>
                <p className="font-bold text-sm text-white leading-tight">{selectedSpObj.name}</p>
                {selectedSpObj.route && <p className="text-emerald-300 text-[11px] leading-tight">{selectedSpObj.route}</p>}
              </div>
            </div>
          )}
          <div className="p-5 md:p-8 space-y-6">

            {/* ── Filters ──────────────────────────────────────────── */}
            <div className="ddm-card p-4 flex flex-wrap gap-3 items-end">
              {[['from', 'From', from, setFrom], ['to', 'To', to, setTo]].map(([id, label, val, setter]) => (
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
                  closingBalance > 0 ? 'bg-red-50 text-red-700' : closingBalance < 0 ? 'bg-violet-50 text-violet-700' : 'bg-emerald-50 text-emerald-700'
                }`}>
                  Outstanding: {formatCurrency(closingBalance)}
                </div>
              )}
            </div>

            {/* ── View switcher ───────────────────────────────────────── */}
            <div className="flex bg-white border border-slate-200 rounded-xl shadow-sm p-1 gap-1 max-w-md">
              <button
                onClick={() => setView('balance')}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg transition ${
                  view === 'balance' ? 'bg-emerald-700 text-white' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <FileText size={13} /> Account Statement
              </button>
              <button
                onClick={() => setView('dispatch')}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg transition ${
                  view === 'dispatch' ? 'bg-emerald-700 text-white' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Package size={13} /> Dispatch Stock Summary
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                <AlertCircle size={15} className="flex-shrink-0" /> {error}
              </div>
            )}

            {view === 'dispatch' ? (
              <DispatchStockSummaryView summary={dispatchSummary} loading={loading} />
            ) : (
            <>
            {/* ── Statement table ────────────────────────────────────── */}
            <div className="ddm-card overflow-hidden">
              <div className="px-4 py-3 bg-slate-700 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-white">Account Statement</h2>
                  <p className="text-xs text-slate-400">
                    {rows.length} day{rows.length !== 1 ? 's' : ''} · tap a row to see dispatch &amp; collection details
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
                      <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Given</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Collected</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Due</th>
                      <th className="px-4 py-3 w-8" />
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {loading ? (
                      <tr><td colSpan={6}><BrandedLoader size="sm" hideBrand inlinePadY="py-12" /></td></tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400 text-sm">No data for this period</td>
                      </tr>
                    ) : (
                      rows.map((row, i) => <ExpandableRow key={i} row={row} open={expandedRows.has(i)} onToggle={() => toggleRow(i)} />)
                    )}
                  </tbody>
                  {rows.length > 0 && (
                    <tfoot className="sticky bottom-0 z-10">
                      <tr>
                        <td className="px-4 py-3 bg-slate-700 text-xs font-bold text-white uppercase tracking-wider">Totals</td>
                        <td className="px-4 py-3 bg-slate-700 text-right text-xs text-slate-400">—</td>
                        <td className="px-4 py-3 bg-slate-700 text-right text-xs font-bold text-blue-300 tabular-nums">{formatCurrency(totalGiven)}</td>
                        <td className="px-4 py-3 bg-slate-700 text-right text-xs font-bold text-emerald-300 tabular-nums">{formatCurrency(totalCollected)}</td>
                        <td className={`px-4 py-3 bg-slate-700 text-right text-xs font-bold tabular-nums ${closingBalance > 0 ? 'text-red-300' : closingBalance < 0 ? 'text-violet-300' : 'text-emerald-300'}`}>
                          {formatCurrency(closingBalance)}
                        </td>
                        <td className="px-4 py-3 bg-slate-700" />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
            </>
            )}
          </div>
          </>
        )}
      </div>
    </div>
    </div>
  );
}
