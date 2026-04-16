import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Save, Loader2, CheckCircle, Search } from 'lucide-react';
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
  const [brands, setBrands]         = useState([]);
  const [activeBrandId, setActive]  = useState(null);
  const [products, setProducts]     = useState([]);
  const [quantities, setQuantities] = useState({});
  const [brandData, setBrandData]   = useState({});
  const [balances, setBalances]     = useState({});
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [brandSearch, setBrandSearch] = useState('');
  const inputRefs = useRef({});

  useEffect(() => {
    api.get('/brands')
      .then(r => {
        const b = r.data.data;
        setBrands(b);
        if (b.length) {
          const matched = brandName
            ? b.find(br => br.name.toLowerCase() === brandName.toLowerCase())
            : null;
          setActive(matched ? matched.id : b[0].id);
        }
      })
      .catch(() => notify('Failed to load brands', 'error'));
  }, [brandName]);

  useEffect(() => {
    if (!date) return;
    api.get(`/dairy-balance?date=${date}`)
      .then(r => {
        const map = {};
        (r.data.data?.brands ?? []).forEach(b => {
          map[b.brandId] = { opening: b.openingBalance, stockValue: b.stockValue, paid: b.amountPaid, closing: b.closingBalance };
        });
        setBalances(map);
      })
      .catch(() => {});
  }, [date]);

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

  useEffect(() => {
    if (!activeBrandId || products.length === 0) return;
    const total       = products.reduce((s, p) => s + (parseFloat(quantities[p.id]) || 0) * Number(p.dairyPrice), 0);
    const filledCount = products.filter(p => (parseFloat(quantities[p.id]) || 0) > 0).length;
    setBrandData(prev => ({ ...prev, [activeBrandId]: { ...prev[activeBrandId], total, filledCount } }));
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
      if (idx < ids.length - 1) { e.preventDefault(); inputRefs.current[ids[idx + 1]]?.focus(); }
    }
  };

  const totalAmount    = products.reduce((s, p) => s + (parseFloat(quantities[p.id]) || 0) * Number(p.dairyPrice), 0);
  const filledCount    = products.filter(p => (parseFloat(quantities[p.id]) || 0) > 0).length;
  const activeBrand    = brands.find(b => b.id === activeBrandId);
  const activeColors   = activeBrand ? (BRAND_COLORS[activeBrand.name] ?? BRAND_COLORS['Nandini']) : null;
  const activeBalance  = balances[activeBrandId] ?? { opening: 0, stockValue: 0, paid: 0, closing: 0 };
  const isOwing        = activeBalance.closing > 0;
  const filteredBrands = brands.filter(b => b.name.toLowerCase().includes(brandSearch.toLowerCase()));

  return (
    <div className="flex flex-col h-full">
      <SaveOverlay status={saveStatus} onClose={() => setSaveStatus(null)} successMessage="Receipt Saved!" />

      {/* Page header */}
      <div className="flex items-center justify-between gap-3 px-5 md:px-6 pt-4 pb-3 border-b border-slate-200 bg-white">
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            {activeBrand ? `${activeBrand.name} — Stock Receipt` : 'Stock Receipt'}
          </h1>
          <p className="text-slate-400 text-xs">Enter quantities received from the dairy</p>
        </div>
        <DateSelector date={date} onChange={d => { setDate(d); setBrandData({}); }} />
      </div>

      {/* Split panel */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel: brand list ── */}
        <div className="w-52 md:w-60 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">

          {/* Brand search */}
          <div className="p-2.5 border-b border-slate-100">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={brandSearch}
                onChange={e => setBrandSearch(e.target.value)}
                placeholder="Search brand…"
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-slate-50"
              />
            </div>
          </div>

          {/* Brand list */}
          <div className="flex-1 overflow-y-auto">
            {filteredBrands.map(brand => {
              const isActive = brand.id === activeBrandId;
              const colors   = BRAND_COLORS[brand.name] ?? BRAND_COLORS['Nandini'];
              const data     = brandData[brand.id] ?? {};
              const bal      = balances[brand.id];

              return (
                <button
                  key={brand.id}
                  onClick={() => setActive(brand.id)}
                  className={`w-full text-left px-4 py-3.5 border-b border-slate-100 transition-colors ${
                    isActive
                      ? 'bg-indigo-50 border-l-[3px] border-l-indigo-600'
                      : 'hover:bg-slate-50 border-l-[3px] border-l-transparent'
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
                  {bal && (
                    <p className={`text-xs pl-4 tabular-nums font-semibold mt-0.5 ${
                      bal.closing > 0 ? 'text-red-500' : 'text-emerald-600'
                    }`}>
                      {bal.closing > 0 ? `Owe ${formatCurrency(bal.closing)}` : 'Cleared'}
                    </p>
                  )}
                </button>
              );
            })}

            {filteredBrands.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">No brands match</p>
            )}
          </div>
        </div>

        {/* ── Right panel: balance header + table ── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">

          {activeBrand && (
            <>
              {/* Brand + balance info in one header block */}
              <div className={`border-b border-slate-200 ${activeColors?.bg ?? 'bg-slate-50'}`}>

                {/* Brand name row */}
                <div className={`flex items-center gap-2 px-5 py-2 border-b ${activeColors?.border ?? 'border-slate-200'}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${activeColors?.dot}`} />
                  <span className={`font-bold text-sm ${activeColors?.text}`}>{activeBrand.name}</span>
                  <span className="ml-auto text-xs text-slate-400">{date}</span>
                </div>

                {/* Balance summary row — exactly at top of the entry area */}
                <div className="flex items-center gap-4 px-5 py-2.5">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Opening</p>
                      <p className="text-sm font-bold tabular-nums text-slate-700">{formatCurrency(activeBalance.opening)}</p>
                    </div>
                    <span className="text-slate-300 text-base">+</span>
                    <div className="text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stock</p>
                      <p className="text-sm font-bold tabular-nums text-blue-600">{formatCurrency(activeBalance.stockValue)}</p>
                    </div>
                    <span className="text-slate-300 text-base">−</span>
                    <div className="text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Paid</p>
                      <p className="text-sm font-bold tabular-nums text-emerald-600">{formatCurrency(activeBalance.paid)}</p>
                    </div>
                    <span className="text-slate-300 text-base">=</span>
                    <div className="text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{isOwing ? 'You Owe' : 'Settled'}</p>
                      <p className={`text-sm font-bold tabular-nums ${isOwing ? 'text-red-600' : 'text-emerald-600'}`}>
                        {formatCurrency(Math.abs(activeBalance.closing))}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-y-auto bg-white">

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
                ) : products.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">
                    No active products for {activeBrand?.name}. Add them in Setup → Products &amp; Pricing.
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
                        {/* Product name */}
                        <div className="col-span-5 min-w-0">
                          <p className={`text-sm font-semibold truncate ${filled ? 'text-indigo-800' : 'text-slate-800'}`}>
                            {p.name}
                          </p>
                        </div>

                        {/* Rate — read-only, muted */}
                        <div className="col-span-2 text-right">
                          <span className="text-xs text-slate-400 tabular-nums">₹{Number(p.dairyPrice).toFixed(2)}</span>
                        </div>

                        {/* Qty input */}
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

                        {/* Amount */}
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
              </div>

              {/* Footer: count + total + save */}
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
            </>
          )}

          {!activeBrand && (
            <div className="flex items-center justify-center flex-1 text-slate-400 text-sm">
              Select a brand from the list
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
