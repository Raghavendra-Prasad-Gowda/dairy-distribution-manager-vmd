import { useState, useEffect } from 'react';
import { Save, Loader2, Info } from 'lucide-react';
import DateSelector from '../../components/DateSelector';
import BrandTabs from '../../components/BrandTabs';
import SaveOverlay from '../../components/SaveOverlay';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

export default function StockReceipt() {
  const { notify } = useNotification();
  const [date, setDate]             = useState(getIndiaDate());
  const [brands, setBrands]         = useState([]);
  const [activeBrandId, setActive]  = useState(null);
  const [products, setProducts]     = useState([]);
  const [quantities, setQuantities] = useState({});   // { [productId]: string }
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error'

  // Load brands once
  useEffect(() => {
    api.get('/brands')
      .then(r => { const b = r.data.data; setBrands(b); if (b.length) setActive(b[0].id); })
      .catch(() => notify('Failed to load brands', 'error'));
  }, []);

  // Load products + existing receipts when brand or date changes
  useEffect(() => {
    if (!activeBrandId) return;
    setLoading(true);
    Promise.all([
      api.get(`/products?brandId=${activeBrandId}`),
      api.get(`/stock-receipts?date=${date}&brandId=${activeBrandId}`),
    ])
      .then(([prodRes, receiptRes]) => {
        const prods = prodRes.data.data;
        setProducts(prods);
        // Seed qty map: blank by default, filled in from existing receipts
        const qty = {};
        for (const p of prods) qty[p.id] = '';
        for (const r of receiptRes.data.data) qty[r.productId] = String(r.quantity);
        setQuantities(qty);
      })
      .catch(() => notify('Failed to load products', 'error'))
      .finally(() => setLoading(false));
  }, [activeBrandId, date]);

  const handleSave = async () => {
    const items = products
      .filter(p => quantities[p.id] && parseFloat(quantities[p.id]) > 0)
      .map(p => ({
        productId: p.id,
        quantity:  parseFloat(quantities[p.id]),
        unitPrice: Number(p.dairyPrice),   // ← price comes from setup, never user input
      }));

    if (!items.length) {
      notify('Enter at least one quantity before saving.', 'warning');
      return;
    }

    setSaving(true);
    try {
      await api.post('/stock-receipts/bulk', { brandId: activeBrandId, date, items });
      setSaveStatus('success');
    } catch (e) {
      notify(e.response?.data?.error ?? 'Save failed. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const totalAmount = products.reduce((sum, p) => {
    const q = parseFloat(quantities[p.id]) || 0;
    return sum + q * Number(p.dairyPrice);
  }, 0);

  const filledCount = products.filter(p => (parseFloat(quantities[p.id]) || 0) > 0).length;
  const activeBrand = brands.find(b => b.id === activeBrandId);

  return (
    <div className="p-5 md:p-8 max-w-2xl mx-auto space-y-6">
      <SaveOverlay status={saveStatus} onClose={() => setSaveStatus(null)} successMessage="Receipt Saved!" />

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stock Receipt</h1>
          <p className="text-slate-500 text-sm mt-1">Enter quantities received from the dairy</p>
        </div>
        <DateSelector date={date} onChange={setDate} />
      </div>

      {brands.length > 0 && (
        <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={id => { setActive(id); }} />
      )}

      {/* ── Product table ────────────────────────────────────────────── */}
      <div className="ddm-card overflow-hidden">
        {/* Table header */}
        <div className="flex items-center px-5 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</div>
          <div className="w-24 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Rate</div>
          <div className="w-28 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Qty</div>
          <div className="w-28 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            No active products for {activeBrand?.name}. Add them in Setup → Products &amp; Pricing.
          </div>
        ) : (
          <>
            {products.map(p => {
              const qty    = parseFloat(quantities[p.id]) || 0;
              const amount = qty * Number(p.dairyPrice);
              const filled = qty > 0;
              return (
                <div
                  key={p.id}
                  className={`flex items-center px-5 py-4 border-b border-slate-100 transition-colors ${
                    filled ? 'bg-teal-50/50' : 'hover:bg-slate-50/60'
                  }`}
                >
                  {/* Product name */}
                  <div className="flex-1 min-w-0 text-sm font-semibold text-slate-800">{p.name}</div>

                  {/* Rate — read-only */}
                  <div className="w-24 text-right text-sm text-slate-500 tabular-nums">
                    ₹{Number(p.dairyPrice).toFixed(2)}
                  </div>

                  {/* Quantity input */}
                  <div className="w-28 flex justify-center">
                    <input
                      type="number"
                      value={quantities[p.id] ?? ''}
                      onChange={e => setQuantities(prev => ({ ...prev, [p.id]: e.target.value }))}
                      step="0.5"
                      min="0"
                      placeholder="0"
                      className="w-20 text-center px-2 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white tabular-nums"
                    />
                  </div>

                  {/* Computed amount */}
                  <div className={`w-28 text-right text-sm tabular-nums font-semibold ${filled ? 'text-teal-700' : 'text-slate-300'}`}>
                    {filled ? formatCurrency(amount) : '—'}
                  </div>
                </div>
              );
            })}

            {/* Totals footer */}
            <div className="flex items-center px-5 py-4 bg-slate-50 border-t border-slate-200">
              <div className="flex-1 text-xs text-slate-500">
                {filledCount > 0 ? `${filledCount} of ${products.length} products filled` : `${products.length} products`}
              </div>
              <div className="w-24" />
              <div className="w-28 text-center text-sm font-bold text-slate-600">Total</div>
              <div className="w-28 text-right text-base font-bold text-teal-700 tabular-nums">
                {formatCurrency(totalAmount)}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Footer actions ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 pb-2">
        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <Info size={12} />
          Rates are configured in <span className="font-medium text-slate-600">Setup → Products &amp; Pricing</span>
        </p>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="ddm-btn-primary"
        >
          {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
          {saving ? 'Saving…' : 'Save Receipt'}
        </button>
      </div>
    </div>
  );
}
