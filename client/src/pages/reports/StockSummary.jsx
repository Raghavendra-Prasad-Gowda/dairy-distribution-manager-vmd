import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Package, Truck } from 'lucide-react';
import DateSelector from '../../components/DateSelector';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

export default function StockSummary() {
  const [date, setDate]      = useState(getIndiaDate());
  const [data, setData]      = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]    = useState('');

  useEffect(() => { fetchSummary(); }, [date]);

  async function fetchSummary() {
    setLoading(true); setError('');
    try {
      const r = await api.get(`/reports/stock-summary?date=${date}`);
      setData(r.data.data);
    } catch (e) {
      setError(e.response?.data?.error ?? 'Failed to load summary');
    } finally {
      setLoading(false);
    }
  }

  const totalReceived   = data?.receipts.reduce((s, r) => s + r.amount, 0) ?? 0;
  const totalDispatched = data?.dispatches.reduce((s, d) => s + d.totalAmount, 0) ?? 0;
  const netAvailable    = totalReceived - totalDispatched;

  return (
    <div className="p-5 md:p-8 max-w-5xl mx-auto space-y-6">

      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stock Summary</h1>
          <p className="text-slate-500 text-sm mt-1">Daily stock received vs dispatched</p>
        </div>
        <DateSelector date={date} onChange={setDate} />
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={15} className="flex-shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
        </div>
      ) : data ? (
        <div className="space-y-5">

          {/* ── Summary stat cards ─────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                label: 'Total Received',
                val:   totalReceived,
                color: 'text-blue-700',
                bg:    'bg-blue-50',
                dot:   'bg-blue-500',
                icon:  Package,
              },
              {
                label: 'Total Dispatched',
                val:   totalDispatched,
                color: 'text-indigo-700',
                bg:    'bg-indigo-50',
                dot:   'bg-indigo-500',
                icon:  Truck,
              },
              {
                label: 'Net Available',
                val:   netAvailable,
                color: netAvailable >= 0 ? 'text-emerald-700' : 'text-red-700',
                bg:    netAvailable >= 0 ? 'bg-emerald-50' : 'bg-red-50',
                dot:   netAvailable >= 0 ? 'bg-emerald-500' : 'bg-red-500',
                icon:  Package,
              },
            ].map(({ label, val, color, bg, dot, icon: Icon }) => (
              <div key={label} className={`ddm-card p-4 flex items-center gap-3`}>
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={color} size={18} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">{label}</p>
                  <p className={`text-lg font-bold tabular-nums ${color}`}>{formatCurrency(val)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Receipts table ─────────────────────────────────────── */}
          <div className="ddm-card overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-2">
              <Package size={14} className="text-blue-600" />
              <h3 className="font-bold text-slate-800 text-sm">Stock Received</h3>
            </div>

            {data.receipts.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No receipts for this date</div>
            ) : (
              <>
                <div className="grid grid-cols-12 bg-slate-50 border-b border-slate-100 px-4 py-2.5">
                  {['Brand', 'Product', 'Qty', 'Price', 'Amount'].map((h, i) => (
                    <div
                      key={i}
                      className={`${
                        i === 0 ? 'col-span-3' :
                        i === 1 ? 'col-span-4' :
                        i === 2 ? 'col-span-1 text-right' :
                        i === 3 ? 'col-span-2 text-right' :
                        'col-span-2 text-right'
                      } text-xs font-semibold text-slate-500 uppercase tracking-wider`}
                    >
                      {h}
                    </div>
                  ))}
                </div>
                {data.receipts.map((r, i) => (
                  <div key={i} className="grid grid-cols-12 items-center px-4 py-2.5 border-b border-slate-100 hover:bg-slate-50/60 transition-colors last:border-0">
                    <div className="col-span-3 text-xs text-slate-400">{r.brandName}</div>
                    <div className="col-span-4 text-sm font-medium text-slate-800">{r.productName}</div>
                    <div className="col-span-1 text-right text-sm text-slate-600 tabular-nums">{r.quantity}</div>
                    <div className="col-span-2 text-right text-xs text-slate-500 tabular-nums">₹{r.unitPrice}</div>
                    <div className="col-span-2 text-right text-sm font-semibold text-blue-700 tabular-nums">{formatCurrency(r.amount)}</div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* ── Dispatches table ───────────────────────────────────── */}
          <div className="ddm-card overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-2">
              <Truck size={14} className="text-indigo-600" />
              <h3 className="font-bold text-slate-800 text-sm">Dispatched to Salespeople</h3>
            </div>

            {data.dispatches.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No dispatches for this date</div>
            ) : (
              <>
                <div className="grid grid-cols-12 bg-slate-50 border-b border-slate-100 px-4 py-2.5">
                  {['Salesperson', 'Items Dispatched', 'Total'].map((h, i) => (
                    <div
                      key={i}
                      className={`${
                        i === 0 ? 'col-span-4' :
                        i === 1 ? 'col-span-6' :
                        'col-span-2 text-right'
                      } text-xs font-semibold text-slate-500 uppercase tracking-wider`}
                    >
                      {h}
                    </div>
                  ))}
                </div>
                {data.dispatches.map((d, i) => (
                  <div key={i} className="grid grid-cols-12 items-start px-4 py-2.5 border-b border-slate-100 hover:bg-slate-50/60 transition-colors last:border-0">
                    <div className="col-span-4 text-sm font-semibold text-slate-800 pt-0.5">{d.salespersonName}</div>
                    <div className="col-span-6 text-xs text-slate-400 space-y-0.5">
                      {d.items.map((item, j) => (
                        <div key={j}>{item.brandName} {item.productName} × {item.quantity}</div>
                      ))}
                    </div>
                    <div className="col-span-2 text-right text-sm font-semibold text-indigo-700 tabular-nums pt-0.5">
                      {formatCurrency(d.totalAmount)}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
