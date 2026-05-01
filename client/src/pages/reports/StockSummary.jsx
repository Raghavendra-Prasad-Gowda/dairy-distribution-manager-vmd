import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Package, Truck } from 'lucide-react';

const ROUTE_COLORS = [
  { bg: 'bg-sky-100',     text: 'text-sky-700'     },
  { bg: 'bg-violet-100',  text: 'text-violet-700'  },
  { bg: 'bg-amber-100',   text: 'text-amber-700'   },
  { bg: 'bg-rose-100',    text: 'text-rose-700'    },
  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
];
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
    <div className="flex flex-col h-full">

      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Package size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Stock Summary</h1>
            <p className="text-emerald-300 text-xs">Daily stock received vs dispatched</p>
          </div>
        </div>
        <DateSelector date={date} onChange={setDate} dark />
      </div>

    <div className="flex-1 overflow-y-auto">
    <div className="p-5 md:p-8 max-w-5xl mx-auto space-y-6">

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
          {(() => {
            const receipts = data.receipts;
            const hasRoutes = receipts.some(r => r.routeNumber);

            // Build route → color index map (stable per route name)
            const routeNames = [...new Set(receipts.map(r => r.routeNumber).filter(Boolean))];
            const routeColorIdx = new Map(routeNames.map((n, i) => [n, i]));

            // Group into brand sections for sub-totals
            const brandSections = [];
            let current = null;
            for (const r of receipts) {
              if (!current || current.brandName !== r.brandName) {
                current = { brandName: r.brandName, items: [] };
                brandSections.push(current);
              }
              current.items.push(r);
            }

            return (
              <div className="ddm-card overflow-hidden">
                <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-2">
                  <Package size={14} className="text-blue-600" />
                  <h3 className="font-bold text-slate-900 text-sm">Stock Received</h3>
                </div>

                {receipts.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">No receipts for this date</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-emerald-700 sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Brand</th>
                          {hasRoutes && <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Route</th>}
                          <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Product</th>
                          <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Qty</th>
                          <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Price</th>
                          <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {brandSections.map(({ brandName, items }) => (
                          <>
                            {items.map((r, i) => (
                              <tr key={`${brandName}-${i}`} className="hover:bg-slate-50/60 transition-colors">
                                <td className="px-4 py-2.5 text-xs text-slate-400">{i === 0 ? brandName : ''}</td>
                                {hasRoutes && (
                                  <td className="px-4 py-2.5">
                                    {r.routeNumber ? (() => {
                                      const c = ROUTE_COLORS[routeColorIdx.get(r.routeNumber) % ROUTE_COLORS.length];
                                      return (
                                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
                                          {r.routeNumber}
                                        </span>
                                      );
                                    })() : <span className="text-xs text-slate-300">—</span>}
                                  </td>
                                )}
                                <td className="px-4 py-2.5 text-sm font-medium text-slate-800">{r.productName}</td>
                                <td className="px-4 py-2.5 text-right text-sm text-slate-600 tabular-nums">{r.quantity}</td>
                                <td className="px-4 py-2.5 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">₹{r.unitPrice}</td>
                                <td className="px-4 py-2.5 text-right text-sm font-semibold text-blue-700 tabular-nums whitespace-nowrap">{formatCurrency(r.amount)}</td>
                              </tr>
                            ))}
                            {/* Brand sub-total — only shown when multiple brands present */}
                            {brandSections.length > 1 && (
                              <tr className="bg-slate-50 border-t border-slate-200">
                                <td colSpan={hasRoutes ? 5 : 4} className="px-4 py-1.5 text-xs font-semibold text-slate-500 text-right">{brandName} total</td>
                                <td className="px-4 py-1.5 text-right text-sm font-bold text-blue-700 tabular-nums whitespace-nowrap">
                                  {formatCurrency(items.reduce((s, r) => s + r.amount, 0))}
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

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
                  <thead className="bg-emerald-700 sticky top-0 z-10">
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
    </div>
    </div>
  );
}
