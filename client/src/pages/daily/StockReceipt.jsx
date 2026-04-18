import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Save, Loader2, Package, TrendingUp, Search, X } from 'lucide-react';
import DateSelector from '../../components/DateSelector';
import SaveOverlay from '../../components/SaveOverlay';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

/** Convert litres entered by user to crates using mlPerCrate config */
function litresToCrates(litres, mlPerCrate) {
  if (!mlPerCrate || !litres) return litres;
  return (parseFloat(litres) * 1000) / mlPerCrate;
}

export default function StockReceipt() {
  const { notify } = useNotification();
  const { brandName } = useParams();
  const [date, setDate]               = useState(getIndiaDate());
  const [activeBrand, setActiveBrand] = useState(null);
  const [products, setProducts]       = useState([]);
  const [quantities, setQuantities]   = useState({});  // stores litres (user input)
  const [balance, setBalance]         = useState({ opening: 0, stockValue: 0, paid: 0, closing: 0 });
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saveStatus, setSaveStatus]   = useState(null);
  const [search, setSearch]           = useState('');
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
        const prods = prodRes.data.data.filter(p => p.showInStockReceipt !== false);
        setProducts(prods);
        const qty = {};
        for (const p of prods) qty[p.id] = '';
        for (const r of receiptRes.data.data) {
          // Convert stored crates back to litres for display if mlPerCrate is set
          const prod = prods.find(p => p.id === r.productId);
          if (prod?.mlPerCrate && r.quantity) {
            qty[r.productId] = String(
              parseFloat(r.quantity) * prod.mlPerCrate / 1000
            );
          } else {
            qty[r.productId] = String(r.quantity);
          }
        }
        setQuantities(qty);
      })
      .catch(() => notify('Failed to load products', 'error'))
      .finally(() => setLoading(false));
  }, [activeBrand, date]);

  // Group products by category, apply search filter
  const filteredGrouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? products.filter(p =>
          p.name.toLowerCase().includes(q) ||
          (p.category ?? '').toLowerCase().includes(q)
        )
      : products;

    return filtered.reduce((acc, p) => {
      const key = p.category || 'Other';
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    }, {});
  }, [products, search]);

  const allFiltered = Object.values(filteredGrouped).flat();

  const handleKeyDown = (e, productId) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      const idx = allFiltered.findIndex(p => p.id === productId);
      if (idx < allFiltered.length - 1) {
        e.preventDefault();
        inputRefs.current[allFiltered[idx + 1]?.id]?.focus();
      }
    }
  };

  const handleSave = async () => {
    const items = products
      .filter(p => quantities[p.id] && parseFloat(quantities[p.id]) > 0)
      .map(p => {
        const inputVal = parseFloat(quantities[p.id]);
        // If mlPerCrate is set, user entered litres — convert to crates for storage
        const quantity = p.mlPerCrate
          ? litresToCrates(inputVal, p.mlPerCrate)
          : inputVal;
        return { productId: p.id, quantity, unitPrice: Number(p.dairyPrice) };
      });

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

  // Totals based on crates (converted from litres if needed)
  const totalAmount = products.reduce((s, p) => {
    const inputVal = parseFloat(quantities[p.id]) || 0;
    const crates = p.mlPerCrate ? litresToCrates(inputVal, p.mlPerCrate) : inputVal;
    return s + crates * Number(p.dairyPrice);
  }, 0);

  const filledCount = products.filter(p => (parseFloat(quantities[p.id]) || 0) > 0).length;
  const isOwing = balance.closing > 0;

  return (
    <div className="flex flex-col h-full bg-slate-100">
      <SaveOverlay status={saveStatus} onClose={() => setSaveStatus(null)} successMessage="Receipt Saved!" />

      {/* ── Page header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2.5">
          <Package size={17} className="text-emerald-600 flex-shrink-0" />
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
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  { label: 'Opening Balance', value: balance.opening,    color: 'text-white' },
                  { label: 'Stock Added',     value: balance.stockValue, color: 'text-blue-200' },
                  { label: 'Amount Paid',     value: balance.paid,       color: 'text-emerald-300' },
                  { label: isOwing ? 'You Owe' : 'Settled', value: Math.abs(balance.closing), color: isOwing ? 'text-red-300' : 'text-emerald-300' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white/10 rounded-xl px-3 py-2.5">
                    <p className="text-[10px] text-blue-200 font-medium mb-0.5">{label}</p>
                    <p className={`text-base font-bold tabular-nums ${color}`}>{formatCurrency(value)}</p>
                  </div>
                ))}
              </div>
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

        {/* ── Search bar ──────────────────────────────────── */}
        {products.length > 0 && (
          <div className="mx-4 mt-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by product or category…"
                className="w-full pl-8 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-300"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Product table ───────────────────────────────── */}
        <div className="mx-4 mt-3 mb-4 bg-white rounded-2xl overflow-hidden border border-slate-200">

          {/* Table header */}
          <div className="grid items-center bg-slate-50 border-b border-slate-200 px-4 py-2.5"
               style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr' }}>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product</div>
            <div className="text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Rate</div>
            <div className="text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Qty (Litres)</div>
            <div className="text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Crates</div>
            <div className="text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-7 h-7 text-emerald-600 animate-spin" />
            </div>
          ) : !activeBrand ? (
            <div className="text-center py-16 text-slate-400 text-sm">Brand not found.</div>
          ) : products.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm px-4">
              No active products for {activeBrand.name}.<br />
              <span className="text-xs">Add them in Dairy → Product Setup.</span>
            </div>
          ) : Object.keys(filteredGrouped).length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">No products match your search.</div>
          ) : (
            Object.entries(filteredGrouped).map(([category, items]) => (
              <div key={category}>
                {/* Category header */}
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{category}</span>
                </div>

                {items.map((p) => {
                  const inputVal = parseFloat(quantities[p.id]) || 0;
                  const crates   = p.mlPerCrate ? litresToCrates(inputVal, p.mlPerCrate) : inputVal;
                  const amount   = crates * Number(p.dairyPrice);
                  const filled   = inputVal > 0;
                  const usesLitres = !!p.mlPerCrate;

                  return (
                    <div
                      key={p.id}
                      className="grid items-center px-4 border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors"
                      style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', minHeight: 52 }}
                    >
                      {/* Product name */}
                      <div className="py-3 pr-2">
                        <p className="text-sm font-semibold text-slate-800 leading-tight">{p.name}</p>
                      </div>

                      {/* Rate */}
                      <div className="text-right py-3">
                        <span className="text-xs tabular-nums text-slate-500">
                          ₹{Number(p.dairyPrice).toFixed(2)}
                        </span>
                      </div>

                      {/* Qty input (litres) */}
                      <div className="flex justify-end py-2">
                        <input
                          ref={el => { inputRefs.current[p.id] = el; }}
                          type="number"
                          inputMode="decimal"
                          value={quantities[p.id] ?? ''}
                          onChange={e => setQuantities(prev => ({ ...prev, [p.id]: e.target.value }))}
                          onKeyDown={e => handleKeyDown(e, p.id)}
                          step="0.5"
                          min="0"
                          placeholder="0"
                          className="w-16 text-center px-1.5 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent tabular-nums transition-all placeholder:text-slate-300 bg-white text-slate-700"
                        />
                      </div>

                      {/* Crates */}
                      <div className="text-right py-3">
                        <span className={`text-xs tabular-nums ${filled ? 'text-slate-600' : 'text-slate-300'}`}>
                          {filled ? (usesLitres ? crates.toFixed(2) : inputVal.toFixed(2)) : '—'}
                        </span>
                      </div>

                      {/* Amount */}
                      <div className="text-right py-3">
                        <span className={`text-sm font-bold tabular-nums ${filled ? 'text-slate-800' : 'text-slate-300'}`}>
                          {filled ? formatCurrency(amount) : '₹0.00'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Footer / Save bar ──────────────────────────────── */}
      {!loading && products.length > 0 && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 flex items-center gap-3">
          <div className="flex-1" />
          <div className="text-right">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide leading-none mb-0.5">Total</p>
            <p className="text-base font-bold text-slate-800 tabular-nums leading-none">{formatCurrency(totalAmount)}</p>
          </div>
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
