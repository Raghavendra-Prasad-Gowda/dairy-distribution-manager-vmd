import { useState, useEffect } from 'react';
import { Save, XCircle, Loader2 } from 'lucide-react';
import DateSelector from '../../components/DateSelector';
import BrandTabs from '../../components/BrandTabs';
import SaveOverlay from '../../components/SaveOverlay';
import { getIndiaDate } from '../../utils/dateUtils';
import api from '../../api/axios';

export default function StockReceipt() {
  const [date, setDate]             = useState(getIndiaDate());
  const [brands, setBrands]         = useState([]);
  const [activeBrandId, setActive]  = useState(null);
  const [products, setProducts]     = useState([]);
  const [rows, setRows]             = useState({});   // { [productId]: { quantity, unitPrice } }
  const [loading, setLoading]       = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error'
  const [error, setError]           = useState('');

  // Load brands once
  useEffect(() => {
    api.get('/brands')
      .then((r) => { const b = r.data.data; setBrands(b); if (b.length) setActive(b[0].id); })
      .catch(() => setError('Failed to load brands'));
  }, []);

  // Load products + existing receipts when brand/date changes
  useEffect(() => {
    if (!activeBrandId) return;
    setLoading(true);
    Promise.all([
      api.get(`/products?brandId=${activeBrandId}`),
      api.get(`/stock-receipts?date=${date}&brandId=${activeBrandId}`),
    ]).then(([prodRes, receiptRes]) => {
      const prods = prodRes.data.data;
      setProducts(prods);
      const map = {};
      for (const p of prods) map[p.id] = { quantity: '', unitPrice: Number(p.dairyPrice) };
      for (const r of receiptRes.data.data) {
        map[r.productId] = { quantity: String(r.quantity), unitPrice: Number(r.unitPrice) };
      }
      setRows(map);
    }).catch((e) => {
      setError(e.response?.data?.error ?? 'Failed to load products');
    }).finally(() => setLoading(false));
  }, [activeBrandId, date]);

  const handleChange = (productId, field, value) => {
    setRows((prev) => ({ ...prev, [productId]: { ...prev[productId], [field]: value } }));
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      const items = products
        .filter((p) => rows[p.id]?.quantity && parseFloat(rows[p.id].quantity) > 0)
        .map((p) => ({
          productId: p.id,
          quantity:  parseFloat(rows[p.id].quantity),
          unitPrice: parseFloat(rows[p.id].unitPrice) || 0,
        }));

      if (!items.length) {
        setError('Enter at least one quantity to save.');
        setLoading(false);
        return;
      }

      await api.post('/stock-receipts/bulk', { brandId: activeBrandId, date, items });
      setSaveStatus('success');
    } catch (e) {
      setError(e.response?.data?.error ?? 'Save failed. Please try again.');
      setSaveStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const totalAmount = products.reduce((s, p) => {
    const q = parseFloat(rows[p.id]?.quantity) || 0;
    const u = parseFloat(rows[p.id]?.unitPrice) || 0;
    return s + q * u;
  }, 0);

  const activeBrand = brands.find((b) => b.id === activeBrandId);

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <SaveOverlay status={saveStatus} onClose={() => setSaveStatus(null)} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Receipt</h1>
          <p className="text-gray-500 text-sm">Enter quantities received from dairy</p>
        </div>
        <DateSelector date={date} onChange={setDate} />
      </div>

      {brands.length > 0 && (
        <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={setActive} />
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <XCircle size={15} /> {error}
        </div>
      )}

      <div className="ddm-card overflow-hidden">
        {/* ── Desktop header (hidden on mobile) ─────────────────────────── */}
        <div className="hidden sm:grid sm:grid-cols-12 sm:gap-2 bg-gray-50 border-b border-gray-100 px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">
          <div className="col-span-5">Product</div>
          <div className="col-span-3 text-right">Dairy Price (₹)</div>
          <div className="col-span-2 text-right">Quantity</div>
          <div className="col-span-2 text-right">Amount</div>
        </div>

        {/* ── Mobile header ─────────────────────────────────────────────── */}
        <div className="sm:hidden bg-gray-50 border-b border-gray-100 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {activeBrand?.name} — Enter quantities received
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No active products for {activeBrand?.name}. Add products in Setup.
          </div>
        ) : (
          <>
            {products.map((p) => {
              const qty    = parseFloat(rows[p.id]?.quantity) || 0;
              const price  = parseFloat(rows[p.id]?.unitPrice) || 0;
              const amount = qty * price;

              return (
                <div key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                  {/* ── Mobile layout: stacked ───────────────────────── */}
                  <div className="sm:hidden px-4 py-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-gray-800 text-sm">{p.name}</span>
                      <span className="text-sm font-semibold text-gray-700">
                        {amount > 0 ? `₹${amount.toFixed(2)}` : '—'}
                      </span>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">Price (₹)</label>
                        <input
                          type="number"
                          value={rows[p.id]?.unitPrice ?? ''}
                          onChange={(e) => handleChange(p.id, 'unitPrice', e.target.value)}
                          step="0.01"
                          min="0"
                          className="w-full text-right px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">Quantity</label>
                        <input
                          type="number"
                          value={rows[p.id]?.quantity ?? ''}
                          onChange={(e) => handleChange(p.id, 'quantity', e.target.value)}
                          step="0.5"
                          min="0"
                          placeholder="0"
                          className="w-full text-right px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── Desktop layout: grid ──────────────────────────── */}
                  <div className="hidden sm:grid sm:grid-cols-12 sm:gap-2 sm:items-center px-4 py-2.5">
                    <div className="col-span-5 font-medium text-gray-800 text-sm">{p.name}</div>
                    <div className="col-span-3">
                      <input
                        type="number"
                        value={rows[p.id]?.unitPrice ?? ''}
                        onChange={(e) => handleChange(p.id, 'unitPrice', e.target.value)}
                        step="0.01"
                        min="0"
                        className="w-full text-right px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        value={rows[p.id]?.quantity ?? ''}
                        onChange={(e) => handleChange(p.id, 'quantity', e.target.value)}
                        step="0.5"
                        min="0"
                        placeholder="0"
                        className="w-full text-right px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
                      />
                    </div>
                    <div className="col-span-2 text-right text-sm font-medium text-gray-700">
                      {amount > 0 ? `₹${amount.toFixed(2)}` : '—'}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Total row */}
            <div className="px-4 py-3 grid grid-cols-12 gap-2 bg-teal-50 border-t border-teal-100">
              <div className="col-span-10 text-right text-sm font-bold text-teal-800">Total</div>
              <div className="col-span-2 text-right text-sm font-bold text-teal-800">
                ₹{totalAmount.toFixed(2)}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-semibold px-6 py-3 rounded-xl transition text-sm"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          {loading ? 'Saving…' : 'Save Receipt'}
        </button>
      </div>
    </div>
  );
}
