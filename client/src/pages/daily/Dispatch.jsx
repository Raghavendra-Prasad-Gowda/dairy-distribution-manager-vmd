import { useState, useEffect } from 'react';
import { Loader2, Truck, XCircle } from 'lucide-react';
import DateSelector from '../../components/DateSelector';
import SaveOverlay from '../../components/SaveOverlay';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

export default function Dispatch() {
  const [date, setDate]               = useState(getIndiaDate());
  const [salespeople, setSalespeople] = useState([]);
  const [selectedSp, setSelectedSp]   = useState('');
  const [availability, setAvail]      = useState([]);
  const [prices, setPrices]           = useState({});
  const [rows, setRows]               = useState({});
  const [loading, setLoading]         = useState(false);
  const [saveStatus, setSaveStatus]   = useState(null);
  const [error, setError]             = useState('');

  useEffect(() => {
    api.get('/salespeople')
      .then((r) => setSalespeople(r.data.data))
      .catch(() => setError('Failed to load salespeople'));
  }, []);

  useEffect(() => {
    if (!date) return;
    api.get(`/stock-receipts/availability?date=${date}`)
      .then((r) => setAvail(r.data.data))
      .catch(() => setError('Failed to load stock availability'));
  }, [date]);

  useEffect(() => {
    if (!selectedSp) return;
    api.get(`/salespeople/${selectedSp}/prices`)
      .then((r) => {
        const map = {};
        r.data.data.forEach((p) => { map[p.productId] = p.sellingPrice; });
        setPrices(map);
        setRows({});
      })
      .catch(() => setError('Failed to load prices for selected salesperson'));
  }, [selectedSp]);

  const handleChange = (productId, qty) => {
    setRows((prev) => ({ ...prev, [productId]: qty }));
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      const items = availability
        .filter((p) => rows[p.productId] && parseFloat(rows[p.productId]) > 0)
        .map((p) => ({
          productId: p.productId,
          quantity:  parseFloat(rows[p.productId]),
          unitPrice: prices[p.productId] ?? 0,
        }));

      if (!items.length) { setError('Enter at least one quantity'); setLoading(false); return; }

      await api.post('/dispatches', {
        salespersonId: Number(selectedSp),
        dispatchDate:  date,
        items,
      });
      setSaveStatus('success');
    } catch (e) {
      setError(e.response?.data?.error ?? 'Save failed');
      setSaveStatus('error');
    } finally { setLoading(false); }
  };

  const totalAmount = availability.reduce((s, p) => {
    const q = parseFloat(rows[p.productId]) || 0;
    return s + q * (prices[p.productId] ?? 0);
  }, 0);

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <SaveOverlay status={saveStatus} onClose={() => setSaveStatus(null)} successMessage="Dispatch Saved!" />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-gray-900">Stock Dispatch</h1><p className="text-gray-500 text-sm">Allocate stock to salespeople</p></div>
        <DateSelector date={date} onChange={setDate} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Salesperson</label>
          <select value={selectedSp} onChange={(e) => setSelectedSp(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
            <option value="">Select salesperson…</option>
            {salespeople.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm"><XCircle size={15} /> {error}</div>}

      {selectedSp && (
        <div className="ddm-card overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 grid grid-cols-12 gap-2 text-xs font-semibold text-gray-600 uppercase">
            <div className="col-span-4">Product</div>
            <div className="col-span-2 text-right">Brand</div>
            <div className="col-span-2 text-right">Available</div>
            <div className="col-span-2 text-right">Price (₹)</div>
            <div className="col-span-2 text-right">Qty</div>
          </div>
          {availability.filter(p => p.received > 0 || rows[p.productId]).map((p) => {
            const qty        = parseFloat(rows[p.productId]) || 0;
            const price      = prices[p.productId];
            const isMissing  = price === undefined || price === null;
            const isOver     = qty > p.available;
            return (
              <div key={p.productId} className={`px-4 py-2.5 grid grid-cols-12 gap-2 items-center border-b border-gray-50 ${isMissing ? 'price-missing' : 'hover:bg-gray-50'} transition`}>
                <div className="col-span-4 text-sm font-medium text-gray-800">{p.productName}</div>
                <div className="col-span-2 text-right text-xs text-gray-500">{p.brandName}</div>
                <div className={`col-span-2 text-right text-sm font-semibold ${p.available <= 0 ? 'text-red-500' : 'text-green-600'}`}>{p.available}</div>
                <div className="col-span-2 text-right text-sm">
                  {isMissing ? <span className="badge-amber">No price</span> : `₹${price}`}
                </div>
                <div className="col-span-2">
                  <input
                    type="number" value={rows[p.productId] ?? ''} onChange={(e) => handleChange(p.productId, e.target.value)}
                    step="0.5" min="0" disabled={isMissing || p.available <= 0}
                    className={`w-full text-right px-2 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-gray-100 ${isOver ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'}`}
                    placeholder="0"
                  />
                </div>
              </div>
            );
          })}
          <div className="px-4 py-3 bg-teal-50 border-t border-teal-100 flex justify-between items-center">
            <span className="text-sm font-bold text-teal-800">Total</span>
            <span className="text-sm font-bold text-teal-800">{formatCurrency(totalAmount)}</span>
          </div>
        </div>
      )}

      {selectedSp && (
        <div className="flex justify-end">
          <button onClick={handleSave} disabled={loading} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-semibold px-6 py-3 rounded-xl transition text-sm">
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Truck size={16} />} {loading ? 'Saving…' : 'Save Dispatch'}
          </button>
        </div>
      )}
    </div>
  );
}
