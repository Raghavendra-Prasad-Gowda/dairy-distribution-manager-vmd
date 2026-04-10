import { useState, useEffect } from 'react';
import { Download, ChevronDown, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
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

function ExpandableRow({ row }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(!open)}>
        <td className="px-4 py-3 text-gray-700">{new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
        <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(row.openingBalance)}</td>
        <td className="px-4 py-3 text-right text-blue-600">{formatCurrency(row.stockValue)}</td>
        <td className="px-4 py-3 text-right text-green-600">{formatCurrency(row.amountPaid)}</td>
        <td className="px-4 py-3 text-right font-bold" style={{ color: row.closingBalance > 0 ? '#dc2626' : '#16a34a' }}>{formatCurrency(row.closingBalance)}</td>
        <td className="px-4 py-3 text-gray-400">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
      </tr>
      {open && row.receipts?.length > 0 && (
        <tr className="bg-blue-50">
          <td colSpan={6} className="px-6 py-3">
            <div className="text-xs font-semibold text-gray-600 mb-2">Stock Received</div>
            <table className="w-full text-xs"><tbody>
              {row.receipts.map((r, i) => (
                <tr key={i} className="border-b border-blue-100 last:border-0">
                  <td className="py-1 text-gray-700 font-medium">{r.productName}</td>
                  <td className="py-1 text-right text-gray-500">{r.quantity} units</td>
                  <td className="py-1 text-right text-gray-500">@ ₹{r.unitPrice}</td>
                  <td className="py-1 text-right font-semibold text-gray-700">{formatCurrency(r.amount)}</td>
                </tr>
              ))}
            </tbody></table>
            {row.payments?.length > 0 && (
              <>
                <div className="text-xs font-semibold text-gray-600 mt-3 mb-2">Payments Made</div>
                <div className="flex gap-4 flex-wrap">
                  {row.payments.map((p, i) => <span key={i} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">{formatCurrency(p.amount)} via {p.mode || 'Cash'}</span>)}
                </div>
              </>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function DairyStatement() {
  const [brands, setBrands]         = useState([]);
  const [activeBrandId, setActive]  = useState(null);
  const [from, setFrom]             = useState(getFirstDayOfMonth());
  const [to, setTo]                 = useState(getIndiaDate());
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    api.get('/brands').then((r) => { const b = r.data.data; setBrands(b); if (b.length) setActive(b[0].id); });
  }, []);

  useEffect(() => { if (activeBrandId) fetchReport(); }, [activeBrandId, from, to]);

  async function fetchReport() {
    setLoading(true); setError('');
    try {
      const r = await api.get(`/reports/dairy-statement?brandId=${activeBrandId}&from=${from}&to=${to}`);
      setRows(r.data.data);
    } catch (e) { setError(e.response?.data?.error ?? 'Failed to load report'); }
    finally { setLoading(false); }
  }

  const activeBrand = brands.find((b) => b.id === activeBrandId);
  const closingBalance = rows.length ? rows[rows.length - 1].closingBalance : 0;

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-gray-900">Dairy Statement</h1><p className="text-gray-500 text-sm">Account statement per dairy brand</p></div>
        {rows.length > 0 && (
          <button onClick={() => exportCSV(rows, activeBrand?.name)} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition">
            <Download size={15} /> Export CSV
          </button>
        )}
      </div>

      {brands.length > 0 && <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={setActive} />}

      {/* Date range */}
      <div className="flex flex-wrap gap-4 items-end">
        {[['from', 'From', from, setFrom], ['to', 'To', to, setTo]].map(([id, label, val, setter]) => (
          <div key={id}>
            <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
            <input type="date" value={val} onChange={(e) => setter(e.target.value)} max={getIndiaDate()}
              className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
          </div>
        ))}
        {rows.length > 0 && (
          <div className={`px-4 py-2.5 rounded-xl font-bold text-sm ${closingBalance > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            Balance: {formatCurrency(closingBalance)}
          </div>
        )}
      </div>

      {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm"><AlertCircle size={15} /> {error}</div>}

      <div className="ddm-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-teal-600 animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Opening</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Stock Value</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Paid</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Closing</th>
                  <th className="px-4 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.length === 0
                  ? <tr><td colSpan={6} className="text-center py-12 text-gray-400">No data for this period</td></tr>
                  : rows.map((row, i) => <ExpandableRow key={i} row={row} />)
                }
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
