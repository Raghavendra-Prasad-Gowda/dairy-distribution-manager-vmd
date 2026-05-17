import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, LayoutGrid } from 'lucide-react';
import DateSelector from '../../components/DateSelector';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import { BRAND_COLORS } from '../../utils/constants';
import api from '../../api/axios';

export default function DailyDispatchSummary() {
  const [date, setDate]       = useState(getIndiaDate());
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => { fetchData(); }, [date]);

  async function fetchData() {
    setLoading(true); setError('');
    try {
      const r = await api.get(`/reports/daily-dispatch?date=${date}`);
      setData(r.data.data);
    } catch (e) {
      setError(e.response?.data?.error ?? 'Failed to load dispatch summary');
    } finally {
      setLoading(false);
    }
  }

  // Flatten all products in order for easy column iteration
  const allProducts = data?.brands.flatMap(b => b.products) ?? [];

  return (
    <div className="flex flex-col h-full">

      {/* Page header */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <LayoutGrid size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Daily Dispatch Sheet</h1>
            <p className="text-emerald-300 text-xs">Stock dispatched to all salespeople by product</p>
          </div>
        </div>
        <DateSelector date={date} onChange={setDate} dark />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6 max-w-full mx-auto space-y-5">

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              <AlertCircle size={15} className="flex-shrink-0" /> {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
            </div>
          ) : data ? (
            data.rows.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 flex items-center justify-center h-40 text-slate-400 text-sm">
                No dispatches recorded for this date.
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="divide-y divide-slate-200" style={{ minWidth: 'max-content', width: '100%' }}>

                    {/* ── Row 1: Brand group headers ── */}
                    <thead>
                      <tr className="bg-emerald-800">
                        <th
                          rowSpan={2}
                          className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider sticky left-0 bg-emerald-800 z-20 min-w-[130px]"
                        >
                          Salesperson
                        </th>
                        {data.brands.map(brand => {
                          const colors = BRAND_COLORS[brand.brandName] ?? BRAND_COLORS['Nandini'];
                          return (
                            <th
                              key={brand.brandId}
                              colSpan={brand.products.length}
                              className="px-3 py-2 text-center text-xs font-bold text-white uppercase tracking-wider border-l border-white/20"
                            >
                              <span className={`inline-flex items-center gap-1.5`}>
                                <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                                {brand.brandName}
                              </span>
                            </th>
                          );
                        })}
                        <th
                          rowSpan={2}
                          className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider border-l border-white/20 min-w-[90px]"
                        >
                          Total
                        </th>
                      </tr>

                      {/* ── Row 2: Product sub-headers ── */}
                      <tr className="bg-emerald-700">
                        {data.brands.map(brand =>
                          brand.products.map((p, idx) => (
                            <th
                              key={p.productId}
                              className={`px-3 py-2 text-center text-[11px] font-semibold text-emerald-100 uppercase tracking-wide whitespace-nowrap min-w-[60px] ${idx === 0 ? 'border-l border-white/20' : ''}`}
                            >
                              {p.productName}
                            </th>
                          ))
                        )}
                      </tr>
                    </thead>

                    {/* ── Body: one row per salesperson ── */}
                    <tbody className="bg-white divide-y divide-slate-100">
                      {data.rows.map((row, i) => (
                        <tr key={row.salespersonId} className={`hover:bg-slate-50/60 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                          <td className="px-4 py-2.5 text-sm font-semibold text-slate-800 sticky left-0 bg-inherit z-10 whitespace-nowrap border-r border-slate-100">
                            {row.salespersonName}
                          </td>
                          {allProducts.map((p, idx) => {
                            const qty = row.items[p.productId];
                            // Add a subtle left border at each brand boundary
                            const isBrandStart = idx === 0 || !data.brands
                              .find(b => b.products.some(bp => bp.productId === allProducts[idx - 1]?.productId))
                              ?.products.some(bp => bp.productId === p.productId);
                            return (
                              <td
                                key={p.productId}
                                className={`px-3 py-2.5 text-center text-sm tabular-nums ${isBrandStart ? 'border-l border-slate-100' : ''}`}
                              >
                                {qty ? (
                                  <span className="font-semibold text-slate-700">{qty}</span>
                                ) : (
                                  <span className="text-slate-200">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-2.5 text-right text-sm font-bold text-emerald-700 tabular-nums whitespace-nowrap border-l border-slate-100">
                            {formatCurrency(row.totalAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>

                    {/* ── Totals footer ── */}
                    <tfoot>
                      <tr className="bg-emerald-50 border-t-2 border-emerald-200">
                        <td className="px-4 py-2.5 text-xs font-bold text-emerald-800 uppercase tracking-wider sticky left-0 bg-emerald-50 z-10 border-r border-slate-100">
                          Total
                        </td>
                        {allProducts.map((p, idx) => {
                          const total = data.totals[p.productId];
                          const isBrandStart = idx === 0 || !data.brands
                            .find(b => b.products.some(bp => bp.productId === allProducts[idx - 1]?.productId))
                            ?.products.some(bp => bp.productId === p.productId);
                          return (
                            <td
                              key={p.productId}
                              className={`px-3 py-2.5 text-center text-sm font-bold tabular-nums ${isBrandStart ? 'border-l border-slate-100' : ''} ${total ? 'text-emerald-700' : 'text-slate-300'}`}
                            >
                              {total ?? '—'}
                            </td>
                          );
                        })}
                        <td className="px-4 py-2.5 text-right text-sm font-bold text-emerald-800 tabular-nums border-l border-slate-100">
                          {formatCurrency(data.rows.reduce((s, r) => s + r.totalAmount, 0))}
                        </td>
                      </tr>
                    </tfoot>

                  </table>
                </div>
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
