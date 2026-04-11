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
    <div className="p-5 md:p-6 max-w-3xl mx-auto space-y-5">
      <SaveOverlay status={saveStatus} onClose={() => setSaveStatus(null)} successMessage="Receipt Saved!" />

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Stock Receipt</h1>
          <p className="text-slate-500 text-sm mt-0.5">Enter quantities received from the dairy</p>
        </div>
        <DateSelector date={date} onChange={setDate} />
      </div>

      {brands.length > 0 && (
        <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={id => { setActive(id); }} />
      )}

      {/* ── Product table ────────────────────────────────────────────── */}
      <div className="ddm-card overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-12 bg-slate-50 border-b border-slate-200 px-5 py-3">
          <div className="col-span-5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</div>
          <div className="col-span-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Rate</div>
          <div className="col-span-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Qty</div>
          <div className="col-span-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</div>
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
                  className={`grid grid-cols-12 items-center px-5 py-3 border-b border-slate-100 transition-colors ${
                    filled ? 'bg-teal-50/50' : 'hover:bg-slate-50/60'
                  }`}
                >
                  {/* Product name */}
                  <div className="col-span-5 text-sm font-medium text-slate-800">{p.name}</div>

                  {/* Rate — read-only */}
                  <div className="col-span-3 text-right text-sm text-slate-500 tabular-nums">
                    ₹{Number(p.dairyPrice).toFixed(2)}
                  </div>

                  {/* Quantity input */}
                  <div className="col-span-2 flex justify-end">
                    <input
                      type="number"
                      value={quantities[p.id] ?? ''}
                      onChange={e => setQuantities(prev => ({ ...prev, [p.id]: e.target.value }))}
                      step="0.5"
                      min="0"
                      placeholder="0"
                      className="w-20 text-right px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white tabular-nums"
                    />
                  </div>

                  {/* Computed amount */}
                  <div className={`col-span-2 text-right text-sm tabular-nums font-medium ${filled ? 'text-teal-700' : 'text-slate-300'}`}>
                    {filled ? `₹${amount.toFixed(2)}` : '—'}
                  </div>
                </div>
              );
            })}

            {/* Totals footer */}
            <div className="grid grid-cols-12 items-center px-5 py-3.5 bg-slate-50 border-t border-slate-200">
              <div className="col-span-7 text-xs text-slate-500">
                {filledCount > 0 ? `${filledCount} of ${products.length} products filled` : `${products.length} products`}
              </div>
              <div className="col-span-3 text-right text-sm font-bold text-slate-700">Total</div>
              <div className="col-span-2 text-right text-sm font-bold text-teal-700 tabular-nums">
                {formatCurrency(totalAmount)}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Footer actions ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
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
