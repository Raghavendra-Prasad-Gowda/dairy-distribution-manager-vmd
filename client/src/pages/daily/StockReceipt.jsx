import { useState, useEffect, useRef } from 'react';
import { Save, Loader2, Info, CheckCircle } from 'lucide-react';
import DateSelector from '../../components/DateSelector';
import BalanceLedger from '../../components/BalanceLedger';
import SaveOverlay from '../../components/SaveOverlay';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import { BRAND_COLORS } from '../../utils/constants';
import api from '../../api/axios';

export default function StockReceipt() {
  const { notify } = useNotification();
  const [date, setDate]             = useState(getIndiaDate());
  const [brands, setBrands]         = useState([]);
  const [activeBrandId, setActive]  = useState(null);
  const [products, setProducts]     = useState([]);
  const [quantities, setQuantities] = useState({});
  const [brandData, setBrandData]   = useState({}); // { [brandId]: { total, filledCount, saved } }
  const [balances, setBalances]     = useState({}); // { [brandId]: { opening, stockValue, paid, closing } }
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const inputRefs = useRef({});

  // Load brands once
  useEffect(() => {
    api.get('/brands')
      .then(r => {
        const b = r.data.data;
        setBrands(b);
        if (b.length) setActive(b[0].id);
      })
      .catch(() => notify('Failed to load brands', 'error'));
  }, []);

  // Load balances when date changes
  useEffect(() => {
    if (!date) return;
    api.get(`/dairy-balance?date=${date}`)
      .then(r => {
        const map = {};
        (r.data.data?.brands ?? []).forEach(b => {
          map[b.brandId] = {
            opening:    b.openingBalance,
            stockValue: b.stockValue,
            paid:       b.amountPaid,
            closing:    b.closingBalance,
          };
        });
        setBalances(map);
      })
      .catch(() => {});
  }, [date]);

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
        const qty = {};
        for (const p of prods) qty[p.id] = '';
        for (const r of receiptRes.data.data) qty[r.productId] = String(r.quantity);
        setQuantities(qty);
      })
      .catch(() => notify('Failed to load products', 'error'))
      .finally(() => setLoading(false));
  }, [activeBrandId, date]);

  // Update brand summary data whenever quantities / products change
  useEffect(() => {
    if (!activeBrandId || products.length === 0) return;
    const total       = products.reduce((s, p) => s + (parseFloat(quantities[p.id]) || 0) * Number(p.dairyPrice), 0);
    const filledCount = products.filter(p => (parseFloat(quantities[p.id]) || 0) > 0).length;
    setBrandData(prev => ({
      ...prev,
      [activeBrandId]: { ...prev[activeBrandId], total, filledCount },
    }));
  }, [quantities, products, activeBrandId]);

  const handleSave = async () => {
    const items = products
      .filter(p => quantities[p.id] && parseFloat(quantities[p.id]) > 0)
      .map(p => ({ productId: p.id, quantity: parseFloat(quantities[p.id]), unitPrice: Number(p.dairyPrice) }));

    if (!items.length) { notify('Enter at least one quantity before saving.', 'warning'); return; }

    setSaving(true);
    try {
      await api.post('/stock-receipts/bulk', { brandId: activeBrandId, date, items });
      setSaveStatus('success');
      setBrandData(prev => ({ ...prev, [activeBrandId]: { ...prev[activeBrandId], saved: true } }));
      // Refresh balances
      api.get(`/dairy-balance?date=${date}`).then(r => {
        const map = {};
        (r.data.data?.brands ?? []).forEach(b => {
          map[b.brandId] = { opening: b.openingBalance, stockValue: b.stockValue, paid: b.amountPaid, closing: b.closingBalance };
        });
        setBalances(map);
      }).catch(() => {});
    } catch (e) {
      notify(e.response?.data?.error ?? 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e, productId) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      const ids = products.map(p => p.id);
      const idx = ids.indexOf(productId);
      if (idx < ids.length - 1) {
        e.preventDefault();
        inputRefs.current[ids[idx + 1]]?.focus();
      }
    }
  };

  const totalAmount  = products.reduce((s, p) => s + (parseFloat(quantities[p.id]) || 0) * Number(p.dairyPrice), 0);
  const filledCount  = products.filter(p => (parseFloat(quantities[p.id]) || 0) > 0).length;
  const activeBrand  = brands.find(b => b.id === activeBrandId);
  const activeColors = activeBrand ? (BRAND_COLORS[activeBrand.name] ?? BRAND_COLORS['Nandini']) : null;
  const activeBalance = balances[activeBrandId] ?? { opening: 0, stockValue: 0, paid: 0, closing: 0 };

  return (
    <div className="flex flex-col h-full">
      <SaveOverlay status={saveStatus} onClose={() => setSaveStatus(null)} successMessage="Receipt Saved!" />

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 md:px-7 pt-5 pb-4 border-b border-slate-200 bg-white">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Stock Receipt</h1>
          <p className="text-slate-500 text-sm">Enter quantities received from the dairy</p>
        </div>
        <DateSelector date={date} onChange={d => { setDate(d); setBrandData({}); }} />
      </div>

      {/* Split panel */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel — brand list */}
        <div className="w-56 md:w-64 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-y-auto">
          <p className="ddm-section-label px-4 py-2 border-b border-slate-100">Brands</p>
          <div className="flex-1 overflow-y-auto py-2">
            {brands.map(brand => {
              const isActive = brand.id === activeBrandId;
              const colors   = BRAND_COLORS[brand.name] ?? BRAND_COLORS['Nandini'];
              const data     = brandData[brand.id] ?? {};
              const bal      = balances[brand.id];

              return (
                <button
                  key={brand.id}
                  onClick={() => setActive(brand.id)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors ${
                    isActive ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
                    <span className={`text-sm font-bold flex-1 ${isActive ? 'text-indigo-700' : 'text-slate-700'}`}>
                      {brand.name}
                    </span>
                    {data.saved && <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />}
                  </div>
                  {data.total > 0 && (
                    <p className="text-xs text-slate-500 pl-4 tabular-nums">
                      {formatCurrency(data.total)} · {data.filledCount} items
                    </p>
                  )}
                  {bal && bal.closing !== 0 && (
                    <p className={`text-xs pl-4 tabular-nums font-semibold mt-0.5 ${bal.closing > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {bal.closing > 0 ? `Owe ${formatCurrency(bal.closing)}` : 'Clear'}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active brand balance */}
          {activeBrand && (
            <div className="border-t border-slate-100 p-3">
              <p className="ddm-section-label mb-2">{activeBrand.name} Balance</p>
              <BalanceLedger
                opening={activeBalance.opening}
                stockValue={activeBalance.stockValue}
                paid={activeBalance.paid}
                closing={activeBalance.closing}
                compact
              />
            </div>
          )}
        </div>

        {/* Right panel — product table */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">

          {/* Brand header bar */}
          {activeBrand && (
            <div className={`px-5 py-2.5 flex items-center gap-2 border-b border-slate-200 ${activeColors?.bg ?? 'bg-slate-50'}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${activeColors?.dot}`} />
              <span className={`font-bold text-sm ${activeColors?.text}`}>{activeBrand.name}</span>
              <span className="text-slate-400 text-xs ml-auto">{date}</span>
            </div>
          )}

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            <div className="bg-white">
              {/* Table header */}
              <div className="flex items-center px-5 py-3 bg-slate-50 border-b border-slate-200 sticky top-0">
                <div className="flex-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</div>
                <div className="w-24 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Rate</div>
                <div className="w-28 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Qty</div>
                <div className="w-28 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  No active products for {activeBrand?.name}. Add them in Setup → Products &amp; Pricing.
                </div>
              ) : (
                products.map(p => {
                  const qty    = parseFloat(quantities[p.id]) || 0;
                  const amount = qty * Number(p.dairyPrice);
                  const filled = qty > 0;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center px-5 py-3.5 border-b border-slate-100 transition-colors ${
                        filled ? 'bg-indigo-50/40' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex-1 min-w-0 text-sm font-semibold text-slate-800">{p.name}</div>
                      <div className="w-24 text-right text-sm text-slate-500 tabular-nums">
                        ₹{Number(p.dairyPrice).toFixed(2)}
                      </div>
                      <div className="w-28 flex justify-center">
                        <input
                          ref={el => { inputRefs.current[p.id] = el; }}
                          type="number"
                          value={quantities[p.id] ?? ''}
                          onChange={e => setQuantities(prev => ({ ...prev, [p.id]: e.target.value }))}
                          onKeyDown={e => handleKeyDown(e, p.id)}
                          step="0.5"
                          min="0"
                          placeholder="0"
                          className="w-20 text-center px-2 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white tabular-nums"
                        />
                      </div>
                      <div className={`w-28 text-right text-sm tabular-nums font-semibold ${filled ? 'text-indigo-700' : 'text-slate-300'}`}>
                        {filled ? formatCurrency(amount) : '—'}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer */}
          {!loading && products.length > 0 && (
            <div className="border-t border-slate-200 bg-white px-5 py-3 flex items-center gap-4">
              <p className="text-xs text-slate-400 flex items-center gap-1.5 flex-1">
                <Info size={12} />
                {filledCount > 0 ? `${filledCount} of ${products.length} products filled` : `${products.length} products`}
                {' '}· Rates set in Setup
              </p>
              <div className="text-right">
                <span className="text-xs text-slate-500 mr-2">Total</span>
                <span className="text-base font-bold text-indigo-700 tabular-nums">{formatCurrency(totalAmount)}</span>
              </div>
              <button onClick={handleSave} disabled={saving || loading} className="ddm-btn-primary">
                {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
                {saving ? 'Saving…' : `Save ${activeBrand?.name ?? ''}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
