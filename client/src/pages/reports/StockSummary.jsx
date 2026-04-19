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
          <h1 className="text-xl font-bold text-slate-900">Stock Summary</h1>
          <p className="text-slate-400 text-sm mt-0.5">Daily stock received vs dispatched</p>
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
          <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
        </div>
      ) : data ? (
        <div className="space-y-5">

          {/* ── Summary stat cards ─────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: 'Total Received',   val: totalReceived,   color: 'text-blue-700',    bg: 'bg-blue-600',    icon: Package },
              { label: 'Total Dispatched', val: totalDispatched, color: 'text-emerald-700',  bg: 'bg-emerald-600',  icon: Truck },
              {
                label: 'Net Available',
                val:   netAvailable,
                color: netAvailable >= 0 ? 'text-emerald-700' : 'text-red-700',
                bg:    netAvailable >= 0 ? 'bg-emerald-600' : 'bg-red-600',
                icon:  Package,
              },
            ].map(({ label, val, color, bg, icon: Icon }) => (
              <div key={label} className="ddm-card p-5 flex items-center gap-4">
                <div className={`w-11 h-11 rounded-2xl ${bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="text-white" size={20} />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{label}</p>
                  <p className={`text-xl font-bold tabular-nums mt-0.5 ${color}`}>{formatCurrency(val)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Receipts table ─────────────────────────────────────── */}
          <div className="ddm-card overflow-hidden">
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-2">
              <Package size={14} className="text-blue-600" />
              <h3 className="font-bold text-slate-900 text-sm">Stock Received</h3>
            </div>

            {data.receipts.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No receipts for this date</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-emerald-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Brand</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Product</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Price</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {data.receipts.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-slate-400">{r.brandName}</td>
                        <td className="px-4 py-2.5 text-sm font-medium text-slate-800">{r.productName}</td>
                        <td className="px-4 py-2.5 text-right text-sm text-slate-600 tabular-nums">{r.quantity}</td>
                        <td className="px-4 py-2.5 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">₹{r.unitPrice}</td>
                        <td className="px-4 py-2.5 text-right text-sm font-semibold text-blue-700 tabular-nums whitespace-nowrap">{formatCurrency(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Dispatches table ───────────────────────────────────── */}
          <div className="ddm-card overflow-hidden">
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-2">
              <Truck size={14} className="text-emerald-600" />
              <h3 className="font-bold text-slate-900 text-sm">Dispatched to Salespeople</h3>
            </div>

            {data.dispatches.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No dispatches for this date</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-emerald-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Salesperson</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Items Dispatched</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Total</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {data.dispatches.map((d, i) => (
                      <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-2.5 text-sm font-semibold text-slate-800 align-top">{d.salespersonName}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-400 space-y-0.5 align-top">
                          {d.items.map((item, j) => (
                            <div key={j}>{item.brandName} {item.productName} × {item.quantity}</div>
                          ))}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-semibold text-emerald-700 tabular-nums whitespace-nowrap align-top">
                          {formatCurrency(d.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
