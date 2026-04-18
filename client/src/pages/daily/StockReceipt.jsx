import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Save, Loader2, Package, TrendingUp } from 'lucide-react';
import DateSelector from '../../components/DateSelector';
import SaveOverlay from '../../components/SaveOverlay';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import { BRAND_COLORS } from '../../utils/constants';
import api from '../../api/axios';

export default function StockReceipt() {
  const { notify } = useNotification();
  const { brandName } = useParams();
  const [date, setDate]               = useState(getIndiaDate());
  const [activeBrand, setActiveBrand] = useState(null);
  const [products, setProducts]       = useState([]);
  const [quantities, setQuantities]   = useState({});
  const [balance, setBalance]         = useState({ opening: 0, stockValue: 0, paid: 0, closing: 0 });
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saveStatus, setSaveStatus]   = useState(null);
  const inputRefs = useRef({});

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
  const isOwing     = balance.closing > 0;

  return (
    <div className="flex flex-col h-full bg-slate-100">
      <SaveOverlay status={saveStatus} onClose={() => setSaveStatus(null)} successMessage="Receipt Saved!" />

      {/* ── Page header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2.5">
          <Package size={17} className="text-blue-600 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-tight">
              {activeBrand ? `${activeBrand.name} Stock Receipt` : 'Stock Receipt'}
            </h1>
            <p className="text-slate-400 text-xs">Enter quantities received from dairy</p>
          </div>
        </div>
        <DateSelector date={date} onChange={setDate} />
      </div>

      <div className="flex-1 overflow-auto">

        {/* ── Balance summary card ─────────────────────────── */}
        {activeBrand && (
          <div className="mx-4 mt-4 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)' }}>
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={14} className="text-blue-200" />
                <p className="text-xs font-bold text-blue-200 uppercase tracking-widest">Account Balance</p>
              </div>

              {/* Balance grid */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  { label: 'Opening Balance', value: balance.opening, color: 'text-white' },
                  { label: 'Stock Added',     value: balance.stockValue, color: 'text-blue-200' },
                  { label: 'Amount Paid',     value: balance.paid, color: 'text-emerald-300' },
                  { label: isOwing ? 'You Owe' : 'Settled', value: Math.abs(balance.closing), color: isOwing ? 'text-red-300' : 'text-emerald-300' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white/10 rounded-xl px-3 py-2.5">
                    <p className="text-[10px] text-blue-200 font-medium mb-0.5">{label}</p>
                    <p className={`text-base font-bold tabular-nums ${color}`}>{formatCurrency(value)}</p>
                  </div>
                ))}
              </div>

              {/* Today's receipt total */}
              <div className="flex gap-2">
                <div className="flex-1 flex items-center justify-between bg-amber-400 rounded-xl px-3 py-2">
                  <span className="text-xs font-bold text-amber-900">Today's Receipt</span>
                  <span className="text-sm font-bold text-amber-900 tabular-nums">{formatCurrency(totalAmount)}</span>
                </div>
                <div className="flex items-center bg-emerald-500 rounded-xl px-3 py-2 gap-1.5">
                  <span className="text-xs font-bold text-white">{filledCount}</span>
                  <span className="text-xs text-emerald-100">/ {products.length} items</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Product table ───────────────────────────────── */}
        <div className="mx-4 mt-4 mb-4 bg-white rounded-2xl overflow-hidden border border-slate-200">

          {/* Table header */}
          <div className="grid items-center bg-white border-b border-slate-200 px-4 py-3"
               style={{ gridTemplateColumns: '1fr 72px 80px 80px' }}>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product</div>
            <div className="text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Rate (₹)</div>
            <div className="text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Qty</div>
            <div className="text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Amount (₹)</div>
          </div>

          {/* Body */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
            </div>
          ) : !activeBrand ? (
            <div className="text-center py-16 text-slate-400 text-sm">Brand not found.</div>
          ) : products.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm px-4">
              No active products for {activeBrand.name}.<br />
              <span className="text-xs">Add them in Dairy → Product Setup.</span>
            </div>
          ) : (
            products.map((p, idx) => {
              const qty    = parseFloat(quantities[p.id]) || 0;
              const amount = qty * Number(p.dairyPrice);
              const filled = qty > 0;

              return (
                <div
                  key={p.id}
                  className={`grid items-center px-4 border-b border-slate-100 last:border-0 transition-colors ${
                    filled ? 'bg-blue-50/60' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                  }`}
                  style={{ gridTemplateColumns: '1fr 72px 80px 80px', minHeight: 52 }}
                >
                  {/* Product */}
                  <div className="py-3 pr-2">
                    <div className="flex items-center gap-2">
                      {filled && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                      <div>
                        <p className={`text-sm font-bold leading-tight ${filled ? 'text-blue-800' : 'text-slate-800'}`}>
                          {p.name}
                        </p>
                        {p.unit && (
                          <p className="text-[11px] text-slate-400 leading-tight mt-0.5">{p.unit}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Rate */}
                  <div className="text-right py-3">
                    <span className="text-xs tabular-nums font-semibold text-slate-500">
                      {Number(p.dairyPrice).toFixed(2)}
                    </span>
                  </div>

                  {/* Qty input */}
                  <div className="flex justify-center py-2">
                    <input
                      ref={el => { inputRefs.current[p.id] = el; }}
                      type="number"
                      inputMode="decimal"
                      value={quantities[p.id] ?? ''}
                      onChange={e => setQuantities(prev => ({ ...prev, [p.id]: e.target.value }))}
                      onKeyDown={e => handleKeyDown(e, p.id)}
                      step="0.5"
                      min="0"
                      placeholder="—"
                      className={`w-16 text-center px-1.5 py-2 border rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent tabular-nums transition-all placeholder:text-slate-300 ${
                        filled
                          ? 'border-blue-400 bg-white text-blue-700 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    />
                  </div>

                  {/* Amount */}
                  <div className="text-right py-3">
                    {filled ? (
                      <span className="text-sm font-bold text-blue-700 tabular-nums">{formatCurrency(amount)}</span>
                    ) : (
                      <span className="text-xs font-semibold text-amber-500">Pending</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Footer / Save bar ──────────────────────────────── */}
      {!loading && products.length > 0 && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 flex items-center gap-3">
          <div className="flex-1" />

          {/* Total */}
          <div className="text-right">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide leading-none mb-0.5">Total</p>
            <p className="text-base font-bold text-blue-700 tabular-nums leading-none">{formatCurrency(totalAmount)}</p>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving || loading || filledCount === 0}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold px-5 py-2.5 rounded-xl transition text-sm shadow-sm whitespace-nowrap"
          >
            {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
            {saving ? 'Saving…' : 'Save Receipt'}
          </button>
        </div>
      )}
    </div>
  );
}
