import { useState, useEffect } from 'react';
import { Download, ChevronDown, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { getFirstDayOfMonth, getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

function exportCSV(rows, spName) {
  const lines = [['Date', 'Opening (₹)', 'Stock Given (₹)', 'Collected (₹)', 'Outstanding (₹)'].join(',')];
  rows.forEach((r) => lines.push([
    new Date(r.date).toLocaleDateString('en-IN'),
    r.openingBalance, r.stockGiven, r.amountPaid, r.closingBalance,
  ].join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `sp-statement-${spName}.csv`; a.click();
}

function ExpandableRow({ row }) {
  const [open, setOpen] = useState(false);
  const isOwing = row.closingBalance > 0;
  return (
    <div>
      <div
        className="grid grid-cols-12 items-center px-4 py-2.5 border-b border-slate-100 hover:bg-slate-50/60 transition-colors cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <div className="col-span-3 text-xs text-slate-600 tabular-nums">
          {new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
        </div>
        <div className="col-span-2 text-right text-xs text-slate-500 tabular-nums">
          {formatCurrency(row.openingBalance)}
        </div>
        <div className="col-span-2 text-right text-xs text-blue-600 tabular-nums">
          {formatCurrency(row.stockGiven)}
        </div>
        <div className="col-span-2 text-right text-xs text-emerald-600 tabular-nums">
          {formatCurrency(row.amountPaid)}
        </div>
        <div className={`col-span-2 text-right text-xs font-bold tabular-nums ${isOwing ? 'text-red-600' : 'text-emerald-600'}`}>
          {formatCurrency(row.closingBalance)}
        </div>
        <div className="col-span-1 flex justify-end text-slate-400">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </div>
      </div>

      {open && (row.items?.length > 0 || row.payments?.length > 0) && (
        <div className="bg-indigo-50/50 border-b border-slate-100 px-4 py-3 space-y-3">
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
      )}
    </div>
  );
}

export default function SalespersonStatement() {
  const [salespeople, setSalespeople] = useState([]);
  const [selectedSp, setSelectedSp]  = useState('');
  const [from, setFrom]              = useState(getFirstDayOfMonth());
  const [to, setTo]                  = useState(getIndiaDate());
  const [rows, setRows]              = useState([]);
  const [loading, setLoading]        = useState(false);
  const [error, setError]            = useState('');

  useEffect(() => {
    api.get('/salespeople')
      .then((r) => setSalespeople(r.data.data))
      .catch(() => setError('Failed to load salespeople'));
  }, []);

  useEffect(() => { if (selectedSp) fetchReport(); }, [selectedSp, from, to]);

  async function fetchReport() {
    setLoading(true); setError('');
    try {
      const r = await api.get(`/reports/salesperson-statement?salespersonId=${selectedSp}&from=${from}&to=${to}`);
      setRows(r.data.data);
    } catch (e) {
      setError(e.response?.data?.error ?? 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }

  const activeSp = salespeople.find((s) => String(s.id) === String(selectedSp));
  const closingBalance = rows.length ? rows[rows.length - 1].closingBalance : 0;

  return (
    <div className="p-5 md:p-8 max-w-5xl mx-auto space-y-6">

      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Salesperson Statement</h1>
          <p className="text-slate-500 text-sm mt-1">Account statement per salesperson</p>
        </div>
        {rows.length > 0 && (
          <button
            onClick={() => exportCSV(rows, activeSp?.name)}
            className="ddm-btn-secondary"
          >
            <Download size={14} /> Export CSV
          </button>
        )}
      </div>

      {/* ── Filters ──────────────────────────────────────────────────── */}
      <div className="ddm-card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Salesperson
          </label>
          <select
            value={selectedSp}
            onChange={(e) => setSelectedSp(e.target.value)}
            className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          >
            <option value="">Select…</option>
            {salespeople.map((sp) => (
              <option key={sp.id} value={sp.id}>{sp.name}</option>
            ))}
          </select>
        </div>

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
              className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            />
          </div>
        ))}

        {rows.length > 0 && (
          <div className={`px-3 py-2 rounded-xl font-bold text-sm ${closingBalance > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
            Outstanding: {formatCurrency(closingBalance)}
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
        {/* Table header */}
        <div className="grid grid-cols-12 bg-slate-50 border-b border-slate-200 px-4 py-2.5">
          {['Date', 'Opening', 'Given', 'Collected', 'Due', ''].map((h, i) => (
            <div
              key={i}
              className={`${
                i === 0 ? 'col-span-3' :
                i === 1 ? 'col-span-2 text-right' :
                i === 2 ? 'col-span-2 text-right' :
                i === 3 ? 'col-span-2 text-right' :
                i === 4 ? 'col-span-2 text-right' :
                'col-span-1'
              } text-xs font-semibold text-slate-500 uppercase tracking-wider`}
            >
              {h}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
          </div>
        ) : !selectedSp ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            Select a salesperson to view their statement
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            No data for this period
          </div>
        ) : (
          rows.map((row, i) => <ExpandableRow key={i} row={row} />)
        )}
      </div>
    </div>
  );
}
