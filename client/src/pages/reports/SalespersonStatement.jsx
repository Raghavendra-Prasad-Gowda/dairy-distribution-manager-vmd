import { useState, useEffect } from 'react';
import { Download, ChevronDown, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { getFirstDayOfMonth, getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

function exportCSV(rows, spName) {
  const lines = [['Date', 'Opening (₹)', 'Stock Given (₹)', 'Collected (₹)', 'Outstanding (₹)'].join(',')];
  rows.forEach((r) => lines.push([new Date(r.date).toLocaleDateString('en-IN'), r.openingBalance, r.stockGiven, r.amountPaid, r.closingBalance].join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `sp-statement-${spName}.csv`; a.click();
}

function ExpandableRow({ row }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(!open)}>
        <td className="px-4 py-3 text-gray-700">{new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
        <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(row.openingBalance)}</td>
        <td className="px-4 py-3 text-right text-blue-600">{formatCurrency(row.stockGiven)}</td>
        <td className="px-4 py-3 text-right text-green-600">{formatCurrency(row.amountPaid)}</td>
        <td className="px-4 py-3 text-right font-bold" style={{ color: row.closingBalance > 0 ? '#dc2626' : '#16a34a' }}>{formatCurrency(row.closingBalance)}</td>
        <td className="px-4 py-3 text-gray-400">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
      </tr>
      {open && row.items?.length > 0 && (
        <tr className="bg-indigo-50">
          <td colSpan={6} className="px-6 py-3">
            <div className="text-xs font-semibold text-gray-600 mb-2">Stock Dispatched</div>
            <table className="w-full text-xs"><tbody>
              {row.items.map((item, i) => (
                <tr key={i} className="border-b border-indigo-100 last:border-0">
                  <td className="py-1 text-gray-500">{item.brandName}</td>
                  <td className="py-1 font-medium text-gray-700">{item.productName}</td>
                  <td className="py-1 text-right text-gray-500">{item.quantity} units @ ₹{item.unitPrice}</td>
                  <td className="py-1 text-right font-semibold text-gray-700">{formatCurrency(item.totalAmount)}</td>
                </tr>
              ))}
            </tbody></table>
            {row.payments?.length > 0 && (
              <>
                <div className="text-xs font-semibold text-gray-600 mt-3 mb-1">Collections</div>
                <div className="flex gap-2 flex-wrap">
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

export default function SalespersonStatement() {
  const [salespeople, setSalespeople] = useState([]);
  const [selectedSp, setSelectedSp]   = useState('');
  const [from, setFrom]               = useState(getFirstDayOfMonth());
  const [to, setTo]                   = useState(getIndiaDate());
  const [rows, setRows]               = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

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
    } catch (e) { setError(e.response?.data?.error ?? 'Failed to load report'); }
    finally { setLoading(false); }
  }

  const activeSp = salespeople.find((s) => String(s.id) === String(selectedSp));
  const closingBalance = rows.length ? rows[rows.length - 1].closingBalance : 0;

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-gray-900">Salesperson Statement</h1><p className="text-gray-500 text-sm">Account statement per salesperson</p></div>
        {rows.length > 0 && (
          <button onClick={() => exportCSV(rows, activeSp?.name)} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition">
            <Download size={15} /> Export CSV
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Salesperson</label>
          <select value={selectedSp} onChange={(e) => setSelectedSp(e.target.value)} className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
            <option value="">Select…</option>
            {salespeople.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
          </select>
        </div>
        {[['from', 'From', from, setFrom], ['to', 'To', to, setTo]].map(([id, label, val, setter]) => (
          <div key={id}>
            <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
            <input type="date" value={val} onChange={(e) => setter(e.target.value)} max={getIndiaDate()}
              className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
          </div>
        ))}
        {rows.length > 0 && (
          <div className={`px-4 py-2.5 rounded-xl font-bold text-sm ${closingBalance > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            Outstanding: {formatCurrency(closingBalance)}
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
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Stock Given</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Collected</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Outstanding</th>
                  <th className="px-4 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {!selectedSp
                  ? <tr><td colSpan={6} className="text-center py-12 text-gray-400">Select a salesperson to view their statement</td></tr>
                  : rows.length === 0
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
