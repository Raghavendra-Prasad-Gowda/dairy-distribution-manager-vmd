import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Save, Loader2, Package } from 'lucide-react';
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
  const colors      = activeBrand ? (BRAND_COLORS[activeBrand.name] ?? BRAND_COLORS['Nandini']) : null;
  const isOwing     = balance.closing > 0;

  return (
    <div className="flex flex-col h-full">
      <SaveOverlay status={saveStatus} onClose={() => setSaveStatus(null)} successMessage="Receipt Saved!" />

      {/* ── Page header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          {colors && (
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.bg} border ${colors.border}`}>
              <Package size={18} className={colors.text} />
            </div>
          )}
          <div>
            <h1 className="text-base font-bold text-slate-900 leading-tight">
              {activeBrand ? `${activeBrand.name} Stock Receipt` : 'Stock Receipt'}
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">Enter quantities received from dairy</p>
          </div>
        </div>
        <DateSelector date={date} onChange={setDate} />
      </div>

      {/* ── Balance summary bar ──────────────────────────────── */}
      {activeBrand && (
        <div className="overflow-x-auto bg-white border-b border-slate-200">
          <div className="flex min-w-max">
            {[
              { label: 'Opening Balance', value: balance.opening,    color: 'text-slate-700',   sub: null },
              { label: 'Stock Added',     value: balance.stockValue, color: 'text-blue-600',    sub: '+' },
              { label: 'Paid',            value: balance.paid,       color: 'text-emerald-600', sub: '−' },
              {
                label: isOwing ? 'You Owe' : 'Settled',
                value: Math.abs(balance.closing),
                color: isOwing ? 'text-red-600' : 'text-emerald-600',
                sub: '=',
                highlight: true,
              },
            ].map(({ label, value, color, sub, highlight }) => (
              <div
                key={label}
                className={`flex items-center gap-2.5 px-5 py-3.5 border-r border-slate-100 last:border-r-0 ${highlight ? (isOwing ? 'bg-red-50' : 'bg-emerald-50') : ''}`}
              >
                {sub && (
                  <span className="text-slate-300 font-semibold text-sm w-3 text-center flex-shrink-0">{sub}</span>
                )}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 leading-none mb-1">{label}</p>
                  <p className={`text-sm font-bold tabular-nums leading-none ${color}`}>{formatCurrency(value)}</p>
                </div>
                {highlight && (
                  <span className={`ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${isOwing ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {isOwing ? 'DUE' : 'CLEAR'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Product table ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse" style={{ minWidth: 340 }}>

            {/* Header */}
            <thead>
              <tr className="bg-white border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[46%]">
                  Product
                </th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[18%]">
                  Rate
                </th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[20%]">
                  Qty
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[16%]">
                  Amount
                </th>
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center py-20">
                    <Loader2 className="w-7 h-7 text-blue-600 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : !activeBrand ? (
                <tr>
                  <td colSpan={4} className="text-center py-16 text-slate-400 text-sm">Brand not found.</td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-16 text-slate-400 text-sm px-4">
                    No active products for {activeBrand.name}.<br />
                    <span className="text-xs">Add them in Dairy → Product Setup.</span>
                  </td>
                </tr>
              ) : (
                products.map((p, idx) => {
                  const qty    = parseFloat(quantities[p.id]) || 0;
                  const amount = qty * Number(p.dairyPrice);
                  const filled = qty > 0;

                  return (
                    <tr
                      key={p.id}
                      className={`border-b border-slate-100 transition-colors ${
                        filled ? 'bg-blue-50' : idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-100/60'
                      }`}
                    >
                      {/* Product name */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          {filled && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                          )}
                          <span className={`text-sm font-semibold leading-tight ${filled ? 'text-blue-800' : 'text-slate-800'}`}>
                            {p.name}
                          </span>
                        </div>
                      </td>

                      {/* Rate */}
                      <td className="px-3 py-3.5 text-right">
                        <span className={`text-xs tabular-nums font-medium ${filled ? 'text-slate-500' : 'text-slate-400'}`}>
                          ₹{Number(p.dairyPrice).toFixed(2)}
                        </span>
                      </td>

                      {/* Qty input */}
                      <td className="px-3 py-2.5 text-center">
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
                          className={`w-full text-center px-2 py-2.5 border rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent tabular-nums transition-all ${
                            filled
                              ? 'border-blue-400 bg-white text-blue-700 shadow-sm'
                              : 'border-slate-200 bg-white text-slate-600 placeholder:text-slate-300'
                          }`}
                          style={{ minWidth: 56 }}
                        />
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3.5 text-right">
                        {filled ? (
                          <span className="text-sm font-bold text-blue-700 tabular-nums">{formatCurrency(amount)}</span>
                        ) : (
                          <span className="text-slate-200 text-lg leading-none">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        {!loading && products.length > 0 && (
          <div className="border-t border-slate-200 bg-white px-4 md:px-6 py-3 flex items-center gap-4 flex-wrap">

            {/* Fill progress */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex gap-0.5">
                {products.slice(0, 12).map(p => (
                  <span
                    key={p.id}
                    className={`block h-1.5 w-2.5 rounded-full transition-colors ${
                      (parseFloat(quantities[p.id]) || 0) > 0 ? 'bg-blue-500' : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {filledCount > 0
                  ? <><b className="text-blue-600">{filledCount}</b>/{products.length} filled</>
                  : `${products.length} products`}
              </span>
            </div>

            {/* Total */}
            <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-4 py-2 border border-blue-100">
              <span className="text-xs text-blue-500 font-semibold uppercase tracking-wide">Total</span>
              <span className="text-lg font-bold text-blue-700 tabular-nums">{formatCurrency(totalAmount)}</span>
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || loading || filledCount === 0}
              className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold px-5 py-2.5 rounded-xl transition text-sm shadow-sm"
            >
              {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
              {saving ? 'Saving…' : 'Save Receipt'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
