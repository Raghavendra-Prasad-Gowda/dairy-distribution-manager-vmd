import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Package, Truck } from 'lucide-react';
import DateSelector from '../../components/DateSelector';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

export default function StockSummary() {
  const [date, setDate]     = useState(getIndiaDate());
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => { fetchSummary(); }, [date]);

  async function fetchSummary() {
    setLoading(true); setError('');
    try {
      const r = await api.get(`/reports/stock-summary?date=${date}`);
      setData(r.data.data);
    } catch (e) { setError(e.response?.data?.error ?? 'Failed to load summary'); }
    finally { setLoading(false); }
  }

  const totalReceived  = data?.receipts.reduce((s, r) => s + r.amount, 0) ?? 0;
  const totalDispatched = data?.dispatches.reduce((s, d) => s + d.totalAmount, 0) ?? 0;

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-gray-900">Stock Summary</h1><p className="text-gray-500 text-sm">Daily stock received vs dispatched</p></div>
        <DateSelector date={date} onChange={setDate} />
      </div>

      {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm"><AlertCircle size={15} /> {error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-teal-600 animate-spin" /></div>
      ) : data ? (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Total Received', val: totalReceived, color: 'text-blue-700', bg: 'bg-blue-50', icon: Package },
              { label: 'Total Dispatched', val: totalDispatched, color: 'text-indigo-700', bg: 'bg-indigo-50', icon: Truck },
              { label: 'Net Available', val: totalReceived - totalDispatched, color: totalReceived - totalDispatched >= 0 ? 'text-green-700' : 'text-red-700', bg: totalReceived - totalDispatched >= 0 ? 'bg-green-50' : 'bg-red-50', icon: Package },
            ].map(({ label, val, color, bg, icon: Icon }) => (
              <div key={label} className={`${bg} rounded-xl p-4 flex items-center gap-4`}>
                <div className={`w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0`}>
                  <Icon className={color} size={18} />
                </div>
                <div><p className="text-xs text-gray-500 font-medium">{label}</p><p className={`text-lg font-bold ${color}`}>{formatCurrency(val)}</p></div>
              </div>
            ))}
          </div>

          {/* Receipts table */}
          <div className="ddm-card overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex items-center gap-2">
              <Package size={15} className="text-blue-600" />
              <h3 className="font-bold text-gray-800 text-sm">Stock Received</h3>
            </div>
            {data.receipts.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No receipts for this date</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Brand</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Product</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Qty</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Price</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.receipts.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{r.brandName}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{r.productName}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{r.quantity}</td>
                      <td className="px-4 py-3 text-right text-gray-500">₹{r.unitPrice}</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700">{formatCurrency(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Dispatches table */}
          <div className="ddm-card overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex items-center gap-2">
              <Truck size={15} className="text-indigo-600" />
              <h3 className="font-bold text-gray-800 text-sm">Dispatched to Salespeople</h3>
            </div>
            {data.dispatches.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No dispatches for this date</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Salesperson</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Items</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.dispatches.map((d, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold text-gray-800 align-top">{d.salespersonName}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {d.items.map((item, j) => <div key={j}>{item.brandName} {item.productName} × {item.quantity}</div>)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-indigo-700">{formatCurrency(d.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
