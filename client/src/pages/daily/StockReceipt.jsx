import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Save, Loader2 } from 'lucide-react';
import DateSelector from '../../components/DateSelector';
import SaveOverlay from '../../components/SaveOverlay';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import { BRAND_COLORS } from '../../utils/constants';
import api from '../../api/axios';

export default function StockReceipt() {
  const { notify } = useNotification();
  const { brandName } = useParams();
  const [date, setDate]             = useState(getIndiaDate());
  const [activeBrand, setActiveBrand] = useState(null);
  const [products, setProducts]     = useState([]);
  const [quantities, setQuantities] = useState({});
  const [balance, setBalance]       = useState({ opening: 0, stockValue: 0, paid: 0, closing: 0 });
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const inputRefs = useRef({});

  // Resolve brand from URL param
  useEffect(() => {
    api.get('/brands')
      .then(r => {
        const brands = r.data.data;
        const matched = brandName
          ? brands.find(b => b.name.toLowerCase() === brandName.toLowerCase())
          : brands[0];
        setActiveBrand(matched ?? null);
      })
      .catch(() => notify('Failed to load brands', 'error'));
  }, [brandName]);

  // Fetch balance for the active brand + date
  useEffect(() => {
    if (!activeBrand) return;
    api.get(`/dairy-balance?date=${date}`)
      .then(r => {
        const entry = (r.data.data?.brands ?? []).find(b => b.brandId === activeBrand.id);
        setBalance(entry
          ? { opening: entry.openingBalance, stockValue: entry.stockValue, paid: entry.amountPaid, closing: entry.closingBalance }
          : { opening: 0, stockValue: 0, paid: 0, closing: 0 }
        );
      })
      .catch(() => {});
  }, [activeBrand, date]);

  // Fetch products + existing receipts
  useEffect(() => {
    if (!activeBrand) return;
    setLoading(true);
    Promise.all([
      api.get(`/products?brandId=${activeBrand.id}`),
      api.get(`/stock-receipts?date=${date}&brandId=${activeBrand.id}`),
    ])
      .then(([prodRes, receiptRes]) => {
        const prods = prodRes.data.data;
        setProducts(prods);
        const qty = {};
        for (const p of prods) qty[p.id] = '';
        for (const r of receiptRes.data.data) qty[r.productId] = String(r.quantity);
        setQuantities(qty);
      })
      .catch(() => notify('Failed to load products', 'error'))
      .finally(() => setLoading(false));
  }, [activeBrand, date]);

  const handleKeyDown = (e, productId) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      const ids = products.map(p => p.id);
      const idx = ids.indexOf(productId);
      if (idx < ids.length - 1) { e.preventDefault(); inputRefs.current[ids[idx + 1]]?.focus(); }
    }
  };

  const handleSave = async () => {
    const items = products
      .filter(p => quantities[p.id] && parseFloat(quantities[p.id]) > 0)
      .map(p => ({ productId: p.id, quantity: parseFloat(quantities[p.id]), unitPrice: Number(p.dairyPrice) }));

    if (!items.length) { notify('Enter at least one quantity before saving.', 'warning'); return; }

    setSaving(true);
    try {
      await api.post('/stock-receipts/bulk', { brandId: activeBrand.id, date, items });
      setSaveStatus('success');
      api.get(`/dairy-balance?date=${date}`).then(r => {
        const entry = (r.data.data?.brands ?? []).find(b => b.brandId === activeBrand.id);
        if (entry) setBalance({ opening: entry.openingBalance, stockValue: entry.stockValue, paid: entry.amountPaid, closing: entry.closingBalance });
      }).catch(() => {});
    } catch (e) {
      notify(e.response?.data?.error ?? 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const totalAmount = products.reduce((s, p) => s + (parseFloat(quantities[p.id]) || 0) * Number(p.dairyPrice), 0);
  const filledCount = products.filter(p => (parseFloat(quantities[p.id]) || 0) > 0).length;
  const colors      = activeBrand ? (BRAND_COLORS[activeBrand.name] ?? BRAND_COLORS['Nandini']) : null;
  const isOwing     = balance.closing > 0;

  return (
    <div className="flex flex-col h-full">
      <SaveOverlay status={saveStatus} onClose={() => setSaveStatus(null)} successMessage="Receipt Saved!" />

      {/* Page header */}
      <div className="flex items-center justify-between gap-3 px-5 md:px-6 pt-4 pb-3 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2.5">
          {colors && <span className={`w-3 h-3 rounded-full flex-shrink-0 ${colors.dot}`} />}
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {activeBrand ? `${activeBrand.name} — Stock Receipt` : 'Stock Receipt'}
            </h1>
            <p className="text-slate-400 text-xs">Enter quantities received from the dairy</p>
          </div>
        </div>
        <DateSelector date={date} onChange={setDate} />
      </div>

      {/* Balance summary bar — horizontally scrollable on small screens */}
      {activeBrand && (
        <div className={`overflow-x-auto border-b border-slate-200 ${colors?.bg ?? 'bg-slate-50'}`}>
          <div className="flex items-center gap-5 px-5 md:px-6 py-2.5 min-w-max">
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Opening</p>
              <p className="text-sm font-bold tabular-nums text-slate-700">{formatCurrency(balance.opening)}</p>
            </div>
            <span className="text-slate-300">+</span>
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stock</p>
              <p className="text-sm font-bold tabular-nums text-blue-600">{formatCurrency(balance.stockValue)}</p>
            </div>
            <span className="text-slate-300">−</span>
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Paid</p>
              <p className="text-sm font-bold tabular-nums text-emerald-600">{formatCurrency(balance.paid)}</p>
            </div>
            <span className="text-slate-300">=</span>
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{isOwing ? 'You Owe' : 'Settled'}</p>
              <p className={`text-sm font-bold tabular-nums ${isOwing ? 'text-red-600' : 'text-emerald-600'}`}>
                {formatCurrency(Math.abs(balance.closing))}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Product table */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
        <div className="flex-1 overflow-auto bg-white">
          <div className="min-w-[360px]">

          {/* Column headers */}
          <div className="grid grid-cols-12 items-center px-4 py-2.5 bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
            <div className="col-span-5 text-xs font-bold text-slate-500 uppercase tracking-wider">Product</div>
            <div className="col-span-2 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Rate</div>
            <div className="col-span-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Qty</div>
            <div className="col-span-2 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
            </div>
          ) : !activeBrand ? (
            <div className="text-center py-12 text-slate-400 text-sm">Brand not found.</div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No active products for {activeBrand.name}. Add them in Dairy → Product Setup.
            </div>
          ) : (
            products.map((p, idx) => {
              const qty    = parseFloat(quantities[p.id]) || 0;
              const amount = qty * Number(p.dairyPrice);
              const filled = qty > 0;

              return (
                <div
                  key={p.id}
                  className={`grid grid-cols-12 items-center px-4 border-b border-slate-100 transition-colors ${
                    filled
                      ? 'bg-indigo-50/50 py-3'
                      : idx % 2 === 0 ? 'bg-white py-3 hover:bg-slate-50/70' : 'bg-slate-50/40 py-3 hover:bg-slate-100/60'
                  }`}
                >
                  <div className="col-span-5 min-w-0">
                    <p className={`text-sm font-semibold truncate ${filled ? 'text-indigo-800' : 'text-slate-800'}`}>
                      {p.name}
                    </p>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-xs text-slate-400 tabular-nums">₹{Number(p.dairyPrice).toFixed(2)}</span>
                  </div>
                  <div className="col-span-3 flex justify-center">
                    <input
                      ref={el => { inputRefs.current[p.id] = el; }}
                      type="number"
                      value={quantities[p.id] ?? ''}
                      onChange={e => setQuantities(prev => ({ ...prev, [p.id]: e.target.value }))}
                      onKeyDown={e => handleKeyDown(e, p.id)}
                      step="0.5"
                      min="0"
                      placeholder="0"
                      className={`w-20 text-center px-2 py-1.5 border rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent tabular-nums transition ${
                        filled
                          ? 'border-indigo-300 bg-white text-indigo-700 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    />
                  </div>
                  <div className="col-span-2 text-right">
                    {filled ? (
                      <span className="text-sm font-bold text-indigo-700 tabular-nums">{formatCurrency(amount)}</span>
                    ) : (
                      <span className="text-slate-300 text-sm">—</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
          </div>{/* end min-w wrapper */}
        </div>

        {/* Footer */}
        {!loading && products.length > 0 && (
          <div className="border-t border-slate-200 bg-white px-5 py-3 flex items-center gap-4">
            <p className="text-xs text-slate-400 flex-1">
              {filledCount > 0
                ? `${filledCount} of ${products.length} filled`
                : `${products.length} products`}
              {' · '}Rates from Setup
            </p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-slate-500">Total</span>
              <span className="text-lg font-bold text-indigo-700 tabular-nums">{formatCurrency(totalAmount)}</span>
            </div>
            <button onClick={handleSave} disabled={saving || loading} className="ddm-btn-primary">
              {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
              {saving ? 'Saving…' : `Save ${activeBrand?.name ?? ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
