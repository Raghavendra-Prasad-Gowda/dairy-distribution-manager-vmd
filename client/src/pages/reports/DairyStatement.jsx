import React, { useState, useEffect } from 'react';
import { Printer, ChevronDown, ChevronRight, AlertCircle, FileText } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import BrandedLoader from '../../components/ui/BrandedLoader';
import { getFirstDayOfMonth, getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';


const ROUTE_COLORS = [
  { bg: 'bg-sky-100',     text: 'text-sky-700',     dot: 'bg-sky-400'     },
  { bg: 'bg-violet-100',  text: 'text-violet-700',  dot: 'bg-violet-400'  },
  { bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-400'   },
  { bg: 'bg-rose-100',    text: 'text-rose-700',    dot: 'bg-rose-400'    },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-400' },
];

function ReceiptsDetail({ receipts }) {
  const hasRoutes = receipts.some(r => r.routeNumber);

  if (!hasRoutes) {
    return (
      <div className="space-y-1">
        {receipts.map((r, i) => (
          <div key={i} className="grid grid-cols-3 text-xs">
            <span className="font-medium text-slate-700">{r.productName}</span>
            <span className="text-right text-slate-500">{r.quantity} × ₹{r.unitPrice}</span>
            <span className="text-right font-semibold text-slate-700">{formatCurrency(r.amount)}</span>
          </div>
        ))}
      </div>
    );
  }

  // Group by routeNumber, preserving insertion order (receipts are ordered by routeId asc)
  const groups = [];
  const seen = new Map();
  for (const r of receipts) {
    const key = r.routeNumber ?? 'General';
    if (!seen.has(key)) { seen.set(key, []); groups.push({ routeNumber: key, items: seen.get(key) }); }
    seen.get(key).push(r);
  }

  return (
    <div className="space-y-3">
      {groups.map(({ routeNumber, items }, gi) => {
        const c = ROUTE_COLORS[gi % ROUTE_COLORS.length];
        const subtotal = items.reduce((s, r) => s + r.amount, 0);
        return (
          <div key={routeNumber}>
            <div className={`flex items-center justify-between px-2 py-1 rounded-lg mb-1 ${c.bg}`}>
              <span className={`flex items-center gap-1.5 text-[11px] font-bold ${c.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                {routeNumber}
              </span>
              <span className={`text-[11px] font-bold tabular-nums ${c.text}`}>{formatCurrency(subtotal)}</span>
            </div>
            <div className="space-y-0.5 pl-2">
              {items.map((r, i) => (
                <div key={i} className="grid grid-cols-3 text-xs">
                  <span className="font-medium text-slate-700">{r.productName}</span>
                  <span className="text-right text-slate-500">{r.quantity} × ₹{r.unitPrice}</span>
                  <span className="text-right font-semibold text-slate-700">{formatCurrency(r.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExpandableRow({ row, open, onToggle, selectedRouteId }) {
  const isOwing  = row.closingBalance > 0;
  const isCredit = row.closingBalance < 0;
  const visibleReceipts = selectedRouteId
    ? (row.receipts ?? []).filter(r => String(r.routeId) === String(selectedRouteId))
    : row.receipts;
  const hasDetail = visibleReceipts?.length > 0 || row.payments?.length > 0;
  const billDisplay = selectedRouteId
    ? visibleReceipts.reduce((s, r) => s + r.amount, 0)
    : row.stockValue + (row.depositValue ?? 0);
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
          {formatCurrency(billDisplay)}
        </td>
        {!selectedRouteId && (
          <td className="px-4 py-2.5 text-right text-xs text-emerald-600 tabular-nums whitespace-nowrap">
            {formatCurrency(row.amountPaid)}
          </td>
        )}
        {!selectedRouteId && (
          <td className={`px-4 py-2.5 text-right text-xs font-bold tabular-nums whitespace-nowrap ${isOwing ? 'text-red-600' : isCredit ? 'text-violet-600' : 'text-emerald-600'}`}>
            {formatCurrency(row.closingBalance)}
          </td>
        )}
        <td className="px-4 py-2.5 text-right text-slate-400">
          {open ? <ChevronDown size={13} className="ml-auto" /> : <ChevronRight size={13} className="ml-auto" />}
        </td>
      </tr>
      {open && hasDetail && (
        <tr>
          <td colSpan={selectedRouteId ? 4 : 6} className="px-4 py-3 bg-blue-50/50 border-b border-slate-100">
            <div className="space-y-3">
              {visibleReceipts?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1.5">Stock Received</p>
                  <ReceiptsDetail receipts={visibleReceipts} />
                </div>
              )}
              {selectedRouteId && visibleReceipts?.length === 0 && row.receipts?.length > 0 && (
                <p className="text-xs text-slate-400 italic">No receipts for this route on this date</p>
              )}
              {row.payments?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1.5">Payments Made</p>
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

export default function DairyStatement({ shellActiveBrandId, shellBrands } = {}) {
  const inShell = shellActiveBrandId != null;
  const [brands, setBrands]        = useState(shellBrands ?? []);
  const [activeBrandId, setActive] = useState(shellActiveBrandId ?? null);
  const [from, setFrom]            = useState(getFirstDayOfMonth());
  const [to, setTo]                = useState(getIndiaDate());
  const [rows, setRows]            = useState([]);
  const [loading, setLoading]      = useState(false);
  const [error, setError]          = useState('');
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [routes, setRoutes]             = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState('');

  // Filter rows to only dates that have receipts for the selected route.
  const visibleRows = selectedRouteId
    ? rows.filter(row => row.receipts?.some(r => String(r.routeId) === String(selectedRouteId)))
    : rows;

  // Use date strings as keys so filtering doesn't break expanded-state indices.
  const expandableDates = visibleRows
    .filter(r => r.receipts?.length > 0 || r.payments?.length > 0)
    .map(r => r.date);
  const allExpanded = expandableDates.length > 0 && expandableDates.every(d => expandedRows.has(d));

  function toggleRow(date) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  }
  function expandAll()   { setExpandedRows(new Set(expandableDates)); }
  function collapseAll() { setExpandedRows(new Set()); }

  // When route changes, collapse all rows (user can expand manually).
  useEffect(() => {
    setExpandedRows(new Set());
  }, [selectedRouteId]);

  useEffect(() => {
    if (inShell) return;
    api.get('/brands')
      .then((r) => { const b = r.data.data; setBrands(b); if (b.length) setActive(b[0].id); })
      .catch(() => setError('Failed to load brands'));
  }, []);

  useEffect(() => {
    if (inShell) { setActive(shellActiveBrandId); setBrands(shellBrands ?? []); }
  }, [shellActiveBrandId]);

  useEffect(() => {
    if (!activeBrandId) return;
    setSelectedRouteId('');
    api.get(`/routes?brandId=${activeBrandId}`)
      .then(r => setRoutes(r.data.data ?? []))
      .catch(() => setRoutes([]));
  }, [activeBrandId]);

  useEffect(() => { if (activeBrandId) fetchReport(); }, [activeBrandId, from, to]);

  async function fetchReport() {
    setLoading(true); setError('');
    setExpandedRows(new Set());
    try {
      const r = await api.get(`/reports/dairy-statement?brandId=${activeBrandId}&from=${from}&to=${to}`);
      setRows(r.data.data);
    } catch (e) {
      setError(e.response?.data?.error ?? 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }

  const activeBrand = brands.find((b) => b.id === activeBrandId);
  const closingBalance = rows.length ? rows[rows.length - 1].closingBalance : 0;

  return (
    <div className="flex flex-col h-full">

      {/* ── Page header — hidden in shell mode ──────────────────────── */}
      {!inShell && (
        <div className="flex items-center gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
          <FileText size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Dairy Statement</h1>
            <p className="text-emerald-300 text-xs">Account statement per dairy brand</p>
          </div>
        </div>
      )}

    <div className="flex-1 overflow-y-auto">
    <div className="p-5 md:p-8 max-w-5xl mx-auto space-y-6">

      {!inShell && brands.length > 0 && (
        <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={setActive} />
      )}

      {/* ── Filters ──────────────────────────────────────────────────── */}
      <div className="ddm-card p-4 flex flex-wrap gap-3 items-center">
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
        {routes.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Route</label>
            <select
              value={selectedRouteId}
              onChange={e => setSelectedRouteId(e.target.value)}
              className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            >
              <option value="">All Routes</option>
              {routes.map(rt => (
                <option key={rt.id} value={rt.id}>{rt.routeNumber}</option>
              ))}
            </select>
          </div>
        )}
        {rows.length > 0 && (
          <div className={`px-3 py-2 rounded-xl font-bold text-sm ${
            closingBalance > 0 ? 'bg-red-50 text-red-700' : closingBalance < 0 ? 'bg-violet-50 text-violet-700' : 'bg-emerald-50 text-emerald-700'
          }`}>
            Balance: {formatCurrency(closingBalance)}
          </div>
        )}
        {rows.length > 0 && activeBrandId && (
          <button
            onClick={() => {
              const selectedRoute = routes.find(rt => String(rt.id) === String(selectedRouteId));
              const routeParam    = selectedRouteId ? `&routeId=${selectedRouteId}` : '';
              const routeNumParam = selectedRoute ? `&routeNumber=${encodeURIComponent(selectedRoute.routeNumber)}` : '';
              window.open(`/print/dairy-statement?brandId=${activeBrandId}&from=${from}&to=${to}${routeParam}${routeNumParam}`, '_blank');
            }}
            className="ml-auto flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-4 py-2 transition"
          >
            <Printer size={15} /> Print
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={15} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* ── Statement table ───────────────────────────────────────────── */}
      <div className="ddm-card overflow-hidden">
        <div className="px-4 py-3 bg-slate-700 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white">Account Statement</h2>
            <p className="text-xs text-slate-400">
              {visibleRows.length} day{visibleRows.length !== 1 ? 's' : ''} · tap a row to see receipt &amp; payment details
            </p>
          </div>
          {expandableDates.length > 0 && !loading && (
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
                <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Bill</th>
                {!selectedRouteId && <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Paid</th>}
                {!selectedRouteId && <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Closing</th>}
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody className="bg-white">
              {loading ? (
                <tr><td colSpan={selectedRouteId ? 4 : 6}><BrandedLoader size="sm" hideBrand inlinePadY="py-12" /></td></tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={selectedRouteId ? 4 : 6} className="py-12 text-center text-slate-400 text-sm">
                    {selectedRouteId ? 'No receipts for this route in the selected period' : 'No data for this period'}
                  </td>
                </tr>
              ) : (
                visibleRows.map(row => <ExpandableRow key={row.date} row={row} open={expandedRows.has(row.date)} onToggle={() => toggleRow(row.date)} selectedRouteId={selectedRouteId} />)
              )}
            </tbody>
            {visibleRows.length > 0 && !loading && (() => {
              const totalBill = selectedRouteId
                ? visibleRows.reduce((s, r) => s + r.receipts.filter(rc => String(rc.routeId) === String(selectedRouteId)).reduce((ss, rc) => ss + rc.amount, 0), 0)
                : rows.reduce((s, r) => s + r.stockValue + (r.depositValue ?? 0), 0);
              const totalPaid = rows.reduce((s, r) => s + r.amountPaid, 0);
              return (
                <tfoot>
                  <tr className="bg-emerald-700 sticky bottom-0">
                    <td className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">Total</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right text-xs font-bold text-white tabular-nums">{formatCurrency(totalBill)}</td>
                    {!selectedRouteId && <td className="px-4 py-3 text-right text-xs font-bold text-white tabular-nums">{formatCurrency(totalPaid)}</td>}
                    {!selectedRouteId && <td className="px-4 py-3" />}
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      </div>
    </div>
    </div>
    </div>
  );
}
