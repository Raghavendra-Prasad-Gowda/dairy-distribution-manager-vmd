import React, { useState, useEffect } from 'react';
import { Download, ChevronDown, ChevronRight, Loader2, AlertCircle, FileText } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import { getFirstDayOfMonth, getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

function exportCSV(rows, brandName) {
  const lines = [['Date', 'Opening (₹)', 'Stock Value (₹)', 'Paid (₹)', 'Closing (₹)'].join(',')];
  rows.forEach((r) => {
    lines.push([
      new Date(r.date).toLocaleDateString('en-IN'),
      r.openingBalance, r.stockValue, r.amountPaid, r.closingBalance,
    ].join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `dairy-statement-${brandName}.csv`; a.click();
}

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

function ExpandableRow({ row }) {
  const [open, setOpen] = useState(false);
  const isOwing = row.closingBalance > 0;
  return (
    <React.Fragment>
      <tr
        className="hover:bg-slate-50/60 transition-colors cursor-pointer border-b border-slate-100"
        onClick={() => setOpen(!open)}
      >
        <td className="px-4 py-2.5 text-xs text-slate-600 tabular-nums whitespace-nowrap">
          {new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
        </td>
        <td className="px-4 py-2.5 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">
          {formatCurrency(row.openingBalance)}
        </td>
        <td className="px-4 py-2.5 text-right text-xs text-blue-600 tabular-nums whitespace-nowrap">
          {formatCurrency(row.stockValue)}
        </td>
        <td className="px-4 py-2.5 text-right text-xs text-emerald-600 tabular-nums whitespace-nowrap">
          {formatCurrency(row.amountPaid)}
        </td>
        <td className={`px-4 py-2.5 text-right text-xs font-bold tabular-nums whitespace-nowrap ${isOwing ? 'text-red-600' : 'text-emerald-600'}`}>
          {formatCurrency(row.closingBalance)}
        </td>
        <td className="px-4 py-2.5 text-right text-slate-400">
          {open ? <ChevronDown size={13} className="ml-auto" /> : <ChevronRight size={13} className="ml-auto" />}
        </td>
      </tr>
      {open && (row.receipts?.length > 0 || row.payments?.length > 0) && (
        <tr>
          <td colSpan={6} className="px-4 py-3 bg-blue-50/50 border-b border-slate-100">
            <div className="space-y-3">
              {row.receipts?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1.5">Stock Received</p>
                  <ReceiptsDetail receipts={row.receipts} />
                </div>
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

export default function DairyStatement() {
  const [brands, setBrands]        = useState([]);
  const [activeBrandId, setActive] = useState(null);
  const [from, setFrom]            = useState(getFirstDayOfMonth());
  const [to, setTo]                = useState(getIndiaDate());
  const [rows, setRows]            = useState([]);
  const [loading, setLoading]      = useState(false);
  const [error, setError]          = useState('');

  useEffect(() => {
    api.get('/brands')
      .then((r) => { const b = r.data.data; setBrands(b); if (b.length) setActive(b[0].id); })
      .catch(() => setError('Failed to load brands'));
  }, []);

  useEffect(() => { if (activeBrandId) fetchReport(); }, [activeBrandId, from, to]);

  async function fetchReport() {
    setLoading(true); setError('');
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

      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <FileText size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Dairy Statement</h1>
            <p className="text-emerald-300 text-xs">Account statement per dairy brand</p>
          </div>
        </div>
        {rows.length > 0 && (
          <button onClick={() => exportCSV(rows, activeBrand?.name)} className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200 hover:text-white border border-emerald-600 hover:border-emerald-400 px-3 py-1.5 rounded-lg transition">
            <Download size={13} /> Export CSV
          </button>
        )}
      </div>

    <div className="flex-1 overflow-y-auto">
    <div className="p-5 md:p-8 max-w-5xl mx-auto space-y-6">

      {brands.length > 0 && (
        <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={setActive} />
      )}

      {/* ── Filters ──────────────────────────────────────────────────── */}
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
          <div className={`px-3 py-2 rounded-xl font-bold text-sm ${closingBalance > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
            Balance: {formatCurrency(closingBalance)}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={15} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* ── Statement table ───────────────────────────────────────────── */}
      <div className="ddm-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-emerald-700 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Opening</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Stock</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Paid</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Closing</th>
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody className="bg-white">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <Loader2 className="w-6 h-6 text-emerald-600 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 text-sm">No data for this period</td>
                </tr>
              ) : (
                rows.map((row, i) => <ExpandableRow key={i} row={row} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </div>
    </div>
  );
}
