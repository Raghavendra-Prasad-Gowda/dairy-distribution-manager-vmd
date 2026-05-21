import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Package, Truck, ChevronDown, ChevronRight } from 'lucide-react';

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

export default function StockSummary({ shellActiveBrandId, inShell } = {}) {
  const isShell = inShell || shellActiveBrandId != null;
  const [date, setDate]           = useState(getIndiaDate());
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [collapsedSp, setCollapsedSp] = useState(new Set());

  useEffect(() => { fetchSummary(); }, [date, shellActiveBrandId]);

  async function fetchSummary() {
    setLoading(true); setError('');
    try {
      const brandParam = shellActiveBrandId ? `&brandId=${shellActiveBrandId}` : '';
      const r = await api.get(`/reports/stock-summary?date=${date}${brandParam}`);
      setData(r.data.data);
      // Default all salespeople collapsed
      setCollapsedSp(new Set((r.data.data?.dispatches ?? []).map((_, i) => i)));
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

      {/* Page header — hidden in shell mode */}
      {!isShell && (
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
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">

          {isShell && (
            <div className="flex justify-end">
              <DateSelector date={date} onChange={setDate} />
            </div>
          )}

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

              {/* Summary chips */}
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                  <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wide">Received</span>
                  <span className="text-sm font-extrabold text-blue-700 tabular-nums">{formatCurrency(totalReceived)}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                  <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wide">Dispatched</span>
                  <span className="text-sm font-extrabold text-amber-700 tabular-nums">{formatCurrency(totalDispatched)}</span>
                </div>
                <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 border ${
                  netAvailable >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
                }`}>
                  <span className={`text-[10px] font-bold uppercase tracking-wide ${netAvailable >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>Net Available</span>
                  <span className={`text-sm font-extrabold tabular-nums ${netAvailable >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatCurrency(netAvailable)}</span>
                </div>
              </div>

              {/* Receipts table */}
              {(() => {
                const receipts   = data.receipts;
                const hasRoutes  = receipts.some(r => r.routeNumber);
                const multiBrand = !shellActiveBrandId;

                const routeNames = [...new Set(receipts.map(r => r.routeNumber).filter(Boolean))];
                const routeColorIdx = new Map(routeNames.map((n, i) => [n, i]));

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
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="border-b border-slate-200 px-4 py-3 flex items-center gap-2">
                      <Package size={14} className="text-blue-600" />
                      <h3 className="font-bold text-slate-900 text-sm">Stock Received</h3>
                    </div>

                    {receipts.length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-sm">No receipts for this date</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-100 text-sm">
                          <thead>
                            <tr className="bg-emerald-700">
                              {multiBrand && <th className="px-4 py-2.5 text-left text-xs font-bold text-white uppercase tracking-wider">Brand</th>}
                              {hasRoutes  && <th className="px-4 py-2.5 text-left text-xs font-bold text-white uppercase tracking-wider">Route</th>}
                              <th className="px-4 py-2.5 text-left text-xs font-bold text-white uppercase tracking-wider">Product</th>
                              <th className="px-4 py-2.5 text-right text-xs font-bold text-white uppercase tracking-wider">Qty</th>
                              <th className="px-4 py-2.5 text-right text-xs font-bold text-white uppercase tracking-wider">Price</th>
                              <th className="px-4 py-2.5 text-right text-xs font-bold text-white uppercase tracking-wider">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {brandSections.map(({ brandName, items }) => (
                              <>
                                {items.map((r, i) => (
                                  <tr key={`${brandName}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                    {multiBrand && <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">{i === 0 ? brandName : ''}</td>}
                                    {hasRoutes && (
                                      <td className="px-4 py-2.5">
                                        {r.routeNumber ? (() => {
                                          const c = ROUTE_COLORS[routeColorIdx.get(r.routeNumber) % ROUTE_COLORS.length];
                                          return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>{r.routeNumber}</span>;
                                        })() : <span className="text-xs text-slate-300">—</span>}
                                      </td>
                                    )}
                                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.productName}</td>
                                    <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{r.quantity}</td>
                                    <td className="px-4 py-2.5 text-right text-xs text-slate-400 tabular-nums whitespace-nowrap">₹{r.unitPrice}</td>
                                    <td className="px-4 py-2.5 text-right font-semibold text-blue-700 tabular-nums whitespace-nowrap">{formatCurrency(r.amount)}</td>
                                  </tr>
                                ))}
                                {multiBrand && brandSections.length > 1 && (
                                  <tr className="bg-slate-50 border-t border-slate-200">
                                    <td colSpan={hasRoutes ? 5 : 4} className="px-4 py-1.5 text-xs font-semibold text-slate-500 text-right">{brandName} total</td>
                                    <td className="px-4 py-1.5 text-right text-sm font-bold text-blue-700 tabular-nums whitespace-nowrap">
                                      {formatCurrency(items.reduce((s, r) => s + r.amount, 0))}
                                    </td>
                                  </tr>
                                )}
                              </>
                            ))}
                            {/* Grand total */}
                            <tr className="bg-blue-50 border-t-2 border-blue-200">
                              <td colSpan={1 + (multiBrand ? 1 : 0) + (hasRoutes ? 1 : 0) + 2} className="px-4 py-2 text-xs font-bold text-blue-600 uppercase tracking-wider text-right">Total Received</td>
                              <td className="px-4 py-2 text-right text-sm font-extrabold text-blue-700 tabular-nums whitespace-nowrap">{formatCurrency(totalReceived)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Dispatches — collapsible per salesperson */}
              {(() => {
                const dispatches = data.dispatches;
                const multiBrand = !shellActiveBrandId;
                const allCollapsed = dispatches.length > 0 && dispatches.every((_, i) => collapsedSp.has(i));

                function toggleSp(idx) {
                  setCollapsedSp(prev => {
                    const next = new Set(prev);
                    next.has(idx) ? next.delete(idx) : next.add(idx);
                    return next;
                  });
                }

                return (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Truck size={14} className="text-emerald-600" />
                        <h3 className="font-bold text-slate-900 text-sm">Dispatched to Salespeople</h3>
                      </div>
                      {dispatches.length > 0 && (
                        <button
                          onClick={() => allCollapsed
                            ? setCollapsedSp(new Set())
                            : setCollapsedSp(new Set(dispatches.map((_, i) => i)))
                          }
                          className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 transition"
                        >
                          {allCollapsed
                            ? <><ChevronDown size={13} /> Expand All</>
                            : <><ChevronRight size={13} /> Collapse All</>}
                        </button>
                      )}
                    </div>

                    {dispatches.length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-sm">No dispatches for this date</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm border-separate border-spacing-0">
                          <thead>
                            <tr className="bg-emerald-700">
                              <th className="px-4 py-2.5 text-left text-xs font-bold text-white uppercase tracking-wider">Salesperson</th>
                              {multiBrand && <th className="px-4 py-2.5 text-left text-xs font-bold text-white uppercase tracking-wider">Brand</th>}
                              <th className="px-4 py-2.5 text-left text-xs font-bold text-white uppercase tracking-wider">Product</th>
                              <th className="px-4 py-2.5 text-right text-xs font-bold text-white uppercase tracking-wider">Qty</th>
                              <th className="px-4 py-2.5 text-right text-xs font-bold text-white uppercase tracking-wider">Price</th>
                              <th className="px-4 py-2.5 text-right text-xs font-bold text-white uppercase tracking-wider">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dispatches.map((d, di) => {
                              const isCollapsed = collapsedSp.has(di);
                              const totalQty = d.items.reduce((s, i) => s + i.quantity, 0);

                              return (
                                <>
                                  {/* Summary / header row — always visible */}
                                  <tr
                                    key={`sp-${di}-summary`}
                                    className="cursor-pointer hover:bg-emerald-50/40 transition-colors border-b border-slate-100"
                                    onClick={() => toggleSp(di)}
                                  >
                                    <td className="px-4 py-2.5 border-r border-slate-100">
                                      <div className="flex items-center gap-2">
                                        {isCollapsed
                                          ? <ChevronRight size={13} className="text-slate-400 flex-shrink-0" />
                                          : <ChevronDown  size={13} className="text-slate-400 flex-shrink-0" />}
                                        <span className="font-semibold text-slate-800 whitespace-nowrap">{d.salespersonName}</span>
                                      </div>
                                    </td>
                                    {/* Chips shown only when collapsed */}
                                    <td colSpan={multiBrand ? 4 : 3} className="px-4 py-2.5 border-r border-slate-100">
                                      {isCollapsed && (
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                                            {d.items.length} product{d.items.length !== 1 ? 's' : ''}
                                          </span>
                                          <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full tabular-nums">
                                            {totalQty} units
                                          </span>
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5 text-right">
                                      <span className="text-sm font-bold text-emerald-700 tabular-nums whitespace-nowrap">{formatCurrency(d.totalAmount)}</span>
                                    </td>
                                  </tr>

                                  {/* Detail rows — shown when expanded */}
                                  {!isCollapsed && d.items.map((item, ii) => (
                                    <tr key={`sp-${di}-item-${ii}`} className={`border-b border-slate-50 ${ii % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                                      <td className="pl-10 pr-4 py-2 text-slate-400 border-r border-slate-100" />
                                      {multiBrand && <td className="px-4 py-2 text-xs text-slate-400 whitespace-nowrap border-r border-slate-100">{item.brandName}</td>}
                                      <td className="px-4 py-2 text-slate-700 border-r border-slate-100">{item.productName}</td>
                                      <td className="px-4 py-2 text-right text-slate-600 tabular-nums border-r border-slate-100">{item.quantity}</td>
                                      <td className="px-4 py-2 text-right text-xs text-slate-400 tabular-nums whitespace-nowrap border-r border-slate-100">₹{item.unitPrice}</td>
                                      <td className="px-4 py-2 text-right font-semibold text-emerald-700 tabular-nums whitespace-nowrap">{formatCurrency(item.totalAmount)}</td>
                                    </tr>
                                  ))}
                                </>
                              );
                            })}
                            {/* Grand total */}
                            <tr className="bg-emerald-700">
                              <td colSpan={2 + (multiBrand ? 1 : 0) + 2} className="px-4 py-2.5 text-xs font-bold text-emerald-200 uppercase tracking-wider text-right">Total Dispatched</td>
                              <td className="px-4 py-2.5 text-right text-sm font-extrabold text-white tabular-nums whitespace-nowrap">{formatCurrency(totalDispatched)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}

            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
