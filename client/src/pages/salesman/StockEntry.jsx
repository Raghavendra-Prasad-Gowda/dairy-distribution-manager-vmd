import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Save, Loader2, ShoppingCart, TrendingUp, Search, X,
  ChevronDown, ChevronRight, Lock, Unlock, CheckCircle, AlertCircle,
} from 'lucide-react';
import DateSelector from '../../components/DateSelector';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcContainerDisplay(units, containerType, unitsPerContainer) {
  if (!containerType || !unitsPerContainer || !units) return null;
  const count = parseFloat(units) / unitsPerContainer;
  if (count <= 0) return null;
  const label = containerType.charAt(0).toUpperCase() + containerType.slice(1);
  return `${Number.isInteger(count) ? count : count.toFixed(2)} ${label}${count !== 1 ? 's' : ''}`;
}

// Compute whether an entry is locked given the API response + today's date
function computeLockState(dispatch, today) {
  if (!dispatch) return { isLocked: false, reason: null };
  const dateStr = dispatch.dispatchDate
    ? dispatch.dispatchDate.slice(0, 10)
    : null;
  const isPast = dateStr && dateStr < today;
  if ((isPast || dispatch.isSubmitted) && !dispatch.isAdminUnlocked) {
    return {
      isLocked: true,
      reason: dispatch.isSubmitted ? 'submitted' : 'past-date',
    };
  }
  return { isLocked: false, reason: null };
}

export default function SalespersonStockEntry() {
  const { notify } = useNotification();
  const { user } = useAuth();

  const [date, setDate]             = useState(getIndiaDate());
  const [products, setProducts]     = useState([]); // all enabled products with prices
  const [qty, setQty]               = useState({}); // { productId: string }
  const [dispatch, setDispatch]     = useState(null); // existing dispatch for this date
  const [balance, setBalance]       = useState({ opening: 0, stockGiven: 0, paid: 0, closing: 0 });
  const [collapsedBrands, setCollapsedBrands] = useState({});
  const [collapsedCats, setCollapsedCats]     = useState({});
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch]         = useState('');
  const inputRefs = useRef({});

  const today = getIndiaDate();
  const salespersonId = user?.salespersonId;

  const { isLocked, reason: lockReason } = useMemo(
    () => computeLockState(dispatch, today),
    [dispatch, today]
  );

  // ─── Load products + existing dispatch for selected date ──────────────────
  useEffect(() => {
    if (!salespersonId) return;
    setLoading(true);
    Promise.all([
      api.get(`/salespeople/${salespersonId}/prices`),
      api.get(`/dispatches?date=${date}`),
    ])
      .then(([priceRes, dispatchRes]) => {
        const priceItems  = priceRes.data.data ?? [];
        const dispatches  = dispatchRes.data.data ?? [];
        const todayDispatch = dispatches[0] ?? null;

        setProducts(priceItems);
        setDispatch(todayDispatch);

        const qtyMap = {};
        for (const item of todayDispatch?.items ?? []) {
          qtyMap[item.productId] = String(item.quantity);
        }
        setQty(qtyMap);
        setCollapsedBrands({});
        setCollapsedCats({});
      })
      .catch(() => notify('Failed to load products', 'error'))
      .finally(() => setLoading(false));
  }, [salespersonId, date]);

  // ─── Load balance ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!salespersonId) return;
    api.get(`/salesperson-balance/${salespersonId}?date=${date}`)
      .then(r => {
        const b = r.data.data;
        setBalance({
          opening:    Number(b?.openingBalance ?? 0),
          stockGiven: Number(b?.stockGiven ?? 0),
          paid:       Number(b?.amountPaid ?? 0),
          closing:    Number(b?.closingBalance ?? 0),
        });
      })
      .catch(() => {});
  }, [salespersonId, date, dispatch]);

  // ─── Build hierarchy: brands → categories → products ────────────────────
  const hierarchy = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? products.filter(p => p.productName.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q) || p.brandName.toLowerCase().includes(q))
      : products;

    // Group by brand
    const brandMap = {};
    for (const p of base) {
      if (!brandMap[p.brandId]) brandMap[p.brandId] = { brandId: p.brandId, brandName: p.brandName, categories: {} };
      const catKey = p.category || 'General';
      if (!brandMap[p.brandId].categories[catKey]) {
        brandMap[p.brandId].categories[catKey] = { name: catKey, products: [] };
      }
      brandMap[p.brandId].categories[catKey].products.push(p);
    }

    // Sort products by displayOrder within each category
    for (const brand of Object.values(brandMap)) {
      for (const cat of Object.values(brand.categories)) {
        cat.products.sort((a, b) => a.displayOrder - b.displayOrder || a.productName.localeCompare(b.productName));
      }
    }

    return Object.values(brandMap).sort((a, b) => a.brandName.localeCompare(b.brandName));
  }, [products, search]);

  // Flat product list for keyboard nav
  const flatProducts = useMemo(
    () => hierarchy.flatMap(br => Object.values(br.categories).flatMap(c => c.products)),
    [hierarchy]
  );

  // ─── Per-brand totals ──────────────────────────────────────────────────────
  const brandTotals = useMemo(() => {
    return hierarchy.map(br => {
      let value  = 0;
      let crates = 0;
      let crateLabel = null;
      for (const cat of Object.values(br.categories)) {
        for (const p of cat.products) {
          const q = parseFloat(qty[p.productId]) || 0;
          value += q * (p.sellingPrice ?? 0);
          if (p.containerType && p.unitsPerContainer && q > 0) {
            crates += q / p.unitsPerContainer;
            if (!crateLabel) crateLabel = p.containerType.charAt(0).toUpperCase() + p.containerType.slice(1);
          }
        }
      }
      return { brandId: br.brandId, brandName: br.brandName, value, crates, crateLabel };
    });
  }, [hierarchy, qty]);

  const grandTotal = useMemo(() => ({
    value:  brandTotals.reduce((s, b) => s + b.value, 0),
    crates: brandTotals.reduce((s, b) => s + b.crates, 0),
  }), [brandTotals]);

  const filledCount = products.filter(p => (parseFloat(qty[p.productId]) || 0) > 0).length;

  // ─── Keyboard nav ─────────────────────────────────────────────────────────
  const handleKeyDown = (e, productId) => {
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    const idx = flatProducts.findIndex(p => p.productId === productId);
    if (idx < flatProducts.length - 1) {
      e.preventDefault();
      inputRefs.current[flatProducts[idx + 1]?.productId]?.focus();
    }
  };

  // ─── Refresh balance + dispatch after save/submit ─────────────────────────
  async function refreshState() {
    const [dispatchRes, balRes] = await Promise.all([
      api.get(`/dispatches?date=${date}`),
      api.get(`/salesperson-balance/${salespersonId}?date=${date}`),
    ]);
    const d = dispatchRes.data.data?.[0] ?? null;
    setDispatch(d);
    const b = balRes.data.data;
    setBalance({
      opening:    Number(b?.openingBalance ?? 0),
      stockGiven: Number(b?.stockGiven ?? 0),
      paid:       Number(b?.amountPaid ?? 0),
      closing:    Number(b?.closingBalance ?? 0),
    });
  }

  // ─── Save (draft) ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    const items = products
      .map(p => ({ productId: p.productId, quantity: parseFloat(qty[p.productId]) || 0, unitPrice: p.sellingPrice ?? 0 }))
      .filter(i => i.quantity > 0);

    if (!items.length) { notify('Enter at least one quantity before saving.', 'warning'); return; }

    setSaving(true);
    try {
      await api.post('/dispatches', { dispatchDate: date, items });
      notify('Stock entry saved as draft.', 'success');
      await refreshState();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Save & Submit ─────────────────────────────────────────────────────────
  const handleSaveAndSubmit = async () => {
    const items = products
      .map(p => ({ productId: p.productId, quantity: parseFloat(qty[p.productId]) || 0, unitPrice: p.sellingPrice ?? 0 }))
      .filter(i => i.quantity > 0);

    if (!items.length) { notify('Enter at least one quantity before submitting.', 'warning'); return; }

    setSubmitting(true);
    try {
      // Save first, then submit
      const saveRes = await api.post('/dispatches', { dispatchDate: date, items });
      const savedDispatchId = saveRes.data.data?.id ?? dispatch?.id;
      if (savedDispatchId) {
        await api.patch(`/dispatches/${savedDispatchId}/submit`);
      }
      notify('Stock entry submitted and locked.', 'success');
      await refreshState();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Submit failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const isBusy = saving || submitting || loading;
  const isOwing = balance.closing > 0;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="bg-slate-100 pb-6">

      {isBusy && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-slate-700 font-semibold text-sm">
              {submitting ? 'Submitting entry…' : 'Saving entry…'}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800">
        <div className="flex items-center gap-2.5">
          <ShoppingCart size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">
              {user?.salespersonName ? `${user.salespersonName}'s Stock Entry` : 'Stock Entry'}
            </h1>
            <p className="text-emerald-300 text-xs">Enter stock quantities for today</p>
          </div>
        </div>
        <DateSelector date={date} onChange={setDate} dark />
      </div>

      {/* Balance card */}
      <div className="mx-4 mt-4 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)' }}>
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-blue-200" />
            <p className="text-xs font-bold text-blue-200 uppercase tracking-widest">My Balance</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
            {[
              { label: 'Opening Balance', value: balance.opening,    color: 'text-white' },
              { label: 'Stock Taken',     value: balance.stockGiven,  color: 'text-blue-200' },
              { label: 'Amount Paid',     value: balance.paid,        color: 'text-emerald-300' },
              { label: isOwing ? 'Balance Due' : 'Settled', value: Math.abs(balance.closing), color: isOwing ? 'text-red-300' : 'text-emerald-300' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white/10 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-blue-200 font-medium mb-0.5">{label}</p>
                <p className={`text-base font-bold tabular-nums ${color}`}>{formatCurrency(value)}</p>
              </div>
            ))}
          </div>

          {/* Per-brand totals + grand total */}
          <div className="bg-amber-400 rounded-xl px-3 py-2.5">
            <p className="text-[10px] font-bold text-amber-800 uppercase tracking-widest mb-2">Today's Cost Summary</p>
            <div className="flex flex-wrap gap-2">
              {brandTotals.map(b => (
                <div key={b.brandId} className="flex-1 min-w-[120px] bg-amber-300/60 rounded-lg px-3 py-2">
                  <p className="text-[10px] font-bold text-amber-800 mb-1">{b.brandName}</p>
                  <p className="text-sm font-bold text-amber-900 tabular-nums">{formatCurrency(b.value)}</p>
                  {b.crates > 0 && (
                    <p className="text-[10px] text-amber-700 tabular-nums">
                      {Number.isInteger(b.crates) ? b.crates : b.crates.toFixed(1)} {b.crateLabel}{b.crates !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              ))}
              {brandTotals.length > 1 && (
                <div className="flex-1 min-w-[120px] bg-amber-900/20 rounded-lg px-3 py-2 border border-amber-600/30">
                  <p className="text-[10px] font-bold text-amber-900 mb-1">Grand Total</p>
                  <p className="text-sm font-bold text-amber-900 tabular-nums">{formatCurrency(grandTotal.value)}</p>
                  {grandTotal.crates > 0 && (
                    <p className="text-[10px] text-amber-800 tabular-nums">
                      {Number.isInteger(grandTotal.crates) ? grandTotal.crates : grandTotal.crates.toFixed(1)} Crates
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lock state banner */}
      {isLocked && (
        <div className={`mx-4 mt-3 rounded-xl px-4 py-3 flex items-center gap-3 ${lockReason === 'submitted' ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
          {lockReason === 'submitted'
            ? <CheckCircle size={18} className="text-emerald-600 flex-shrink-0" />
            : <Lock size={18} className="text-amber-600 flex-shrink-0" />
          }
          <div>
            <p className={`text-sm font-bold ${lockReason === 'submitted' ? 'text-emerald-800' : 'text-amber-800'}`}>
              {lockReason === 'submitted' ? 'Entry Submitted & Locked' : 'Entry Locked (Past Date)'}
            </p>
            <p className={`text-xs mt-0.5 ${lockReason === 'submitted' ? 'text-emerald-600' : 'text-amber-600'}`}>
              {lockReason === 'submitted'
                ? 'This entry has been submitted. Contact admin if changes are needed.'
                : 'Past-date entries are locked. Contact admin to unlock for editing.'}
            </p>
          </div>
        </div>
      )}

      {/* Controls bar */}
      {!loading && products.length > 0 && (
        <div className="mx-4 mt-3 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 flex items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-0">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search product, category or brand…"
                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-300"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={13} />
                </button>
              )}
            </div>

            {!isLocked && (
              <>
                <button
                  onClick={handleSave}
                  disabled={isBusy || filledCount === 0}
                  className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold px-3 py-1.5 rounded-xl transition text-sm whitespace-nowrap border border-slate-200"
                >
                  {saving ? <Loader2 className="animate-spin" size={13} /> : <Save size={13} />}
                  Save
                </button>
                <button
                  onClick={handleSaveAndSubmit}
                  disabled={isBusy || filledCount === 0}
                  className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white font-bold px-3 py-1.5 rounded-xl transition text-sm shadow-sm whitespace-nowrap"
                >
                  {submitting ? <Loader2 className="animate-spin" size={13} /> : <CheckCircle size={13} />}
                  Save & Submit
                </button>
              </>
            )}

            {isLocked && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold whitespace-nowrap">
                <Lock size={13} />
                Locked
              </div>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      {products.length > 0 && (
        <div className="mx-4 mb-4 mt-3 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[65vh]" style={{ WebkitOverflowScrolling: 'touch' }}>
            <table className="w-full text-sm border-separate border-spacing-0" style={{ minWidth: 480 }}>
              <colgroup>
                <col style={{ width: '40%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '14%' }} />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="bg-emerald-700 px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600">Product</th>
                  <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600">Qty</th>
                  <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600">Rate</th>
                  <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600">Crates</th>
                  <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {loading ? (
                  <tr><td colSpan={5} className="py-20 text-center"><Loader2 className="w-7 h-7 text-emerald-600 animate-spin mx-auto" /></td></tr>
                ) : hierarchy.length === 0 ? (
                  <tr><td colSpan={5} className="py-10 text-center text-slate-400 text-sm">No products match your search.</td></tr>
                ) : (
                  hierarchy.map((brand, bi) => {
                    const brandCollapsed = collapsedBrands[brand.brandId] ?? false;
                    const bt = brandTotals.find(b => b.brandId === brand.brandId);
                    const brandUnits = Object.values(brand.categories).flatMap(c => c.products).reduce((s, p) => s + (parseFloat(qty[p.productId]) || 0), 0);
                    const catList = Object.values(brand.categories).sort((a, b) => a.name.localeCompare(b.name));

                    return (
                      <React.Fragment key={brand.brandId}>
                        {/* ── Brand row ── */}
                        <tr
                          className="cursor-pointer select-none bg-emerald-800 hover:bg-emerald-700 transition-colors"
                          onClick={() => setCollapsedBrands(prev => ({ ...prev, [brand.brandId]: !prev[brand.brandId] }))}
                        >
                          <td colSpan={5} className="px-4 py-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              {brandCollapsed
                                ? <ChevronRight size={14} className="text-emerald-300 flex-shrink-0" />
                                : <ChevronDown size={14} className="text-emerald-300 flex-shrink-0" />
                              }
                              <span className="text-sm font-extrabold text-white uppercase tracking-wide">{brand.brandName}</span>
                              {brandUnits > 0 && (
                                <span className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded-full font-semibold tabular-nums">{brandUnits} units</span>
                              )}
                              {bt?.value > 0 && (
                                <span className="ml-auto text-xs font-bold text-amber-300 tabular-nums">{formatCurrency(bt.value)}</span>
                              )}
                              {bt?.crates > 0 && (
                                <span className="text-xs text-emerald-300 tabular-nums">
                                  {Number.isInteger(bt.crates) ? bt.crates : bt.crates.toFixed(1)} {bt.crateLabel}{bt.crates !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>

                        {!brandCollapsed && catList.map(cat => {
                          const catKey = `${brand.brandId}:${cat.name}`;
                          const catCollapsed = collapsedCats[catKey] ?? false;
                          const catUnits  = cat.products.reduce((s, p) => s + (parseFloat(qty[p.productId]) || 0), 0);
                          const catAmount = cat.products.reduce((s, p) => s + (parseFloat(qty[p.productId]) || 0) * (p.sellingPrice ?? 0), 0);

                          return (
                            <React.Fragment key={catKey}>
                              {/* ── Category row ── */}
                              <tr
                                className="cursor-pointer select-none hover:bg-gray-100 transition-colors"
                                onClick={() => setCollapsedCats(prev => ({ ...prev, [catKey]: !prev[catKey] }))}
                              >
                                <td colSpan={5} className="border-l-4 border-emerald-400 bg-gray-50 border-b border-gray-200 px-4 py-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {catCollapsed
                                      ? <ChevronRight size={12} className="text-slate-400 flex-shrink-0" />
                                      : <ChevronDown size={12} className="text-slate-400 flex-shrink-0" />
                                    }
                                    <span className="text-xs font-bold uppercase tracking-wide text-gray-700">{cat.name}</span>
                                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{cat.products.length}</span>
                                    {catUnits > 0 && (
                                      <>
                                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold tabular-nums">{catUnits} units</span>
                                        {catAmount > 0 && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-semibold tabular-nums ml-auto">{formatCurrency(catAmount)}</span>}
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>

                              {/* ── Product rows ── */}
                              {!catCollapsed && cat.products.map(p => {
                                const qtyVal  = qty[p.productId] ?? '';
                                const qtyNum  = parseFloat(qtyVal) || 0;
                                const price   = p.sellingPrice ?? 0;
                                const amount  = qtyNum * price;
                                const noPrice = p.sellingPrice === null;
                                const crateStr = calcContainerDisplay(qtyNum, p.containerType, p.unitsPerContainer);

                                return (
                                  <tr key={p.productId} className={`hover:bg-gray-50 transition-colors ${noPrice ? 'bg-amber-50/30' : ''}`}>
                                    <td className="px-4 py-2.5 border-b border-gray-200 border-r border-gray-100 pl-8">
                                      <div className="text-sm font-medium text-gray-900 leading-tight">{p.productName}</div>
                                      <div className="text-[10px] text-gray-400 mt-0.5">
                                        {p.unitType === 'ml' ? `${p.unitSize ?? '?'}ml` : p.unitType === 'gram' ? `${p.unitSize ?? '?'}g` : 'piece'}
                                        {noPrice && <span className="ml-2 text-amber-600 font-semibold">No price set</span>}
                                      </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-center border-b border-gray-200 border-r border-gray-100">
                                      {isLocked ? (
                                        <span className="text-sm font-bold tabular-nums text-slate-700">{qtyNum > 0 ? qtyNum : '—'}</span>
                                      ) : (
                                        <div className="inline-flex items-center gap-1">
                                          <input
                                            ref={el => { inputRefs.current[p.productId] = el; }}
                                            type="number"
                                            inputMode="decimal"
                                            value={qtyVal}
                                            onChange={e => setQty(prev => ({ ...prev, [p.productId]: e.target.value }))}
                                            onKeyDown={e => handleKeyDown(e, p.productId)}
                                            step="1" min="0" placeholder="0"
                                            disabled={noPrice}
                                            className="w-16 text-center px-1.5 py-1.5 border rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent tabular-nums placeholder:text-gray-300 bg-white text-gray-800 border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
                                          />
                                          <span className="text-xs text-gray-400">{p.unitType === 'piece' ? 'pcs' : p.unitType === 'gram' ? 'pkts' : 'u'}</span>
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5 text-center text-xs tabular-nums text-gray-600 whitespace-nowrap border-b border-gray-200 border-r border-gray-100 bg-slate-50">
                                      {noPrice ? <span className="text-amber-500">—</span> : `₹${parseFloat(Number(price).toFixed(4))}`}
                                    </td>
                                    <td className="px-4 py-2.5 text-center text-xs tabular-nums text-amber-700 whitespace-nowrap border-b border-gray-200 border-r border-gray-100 bg-amber-50/40">
                                      {crateStr ?? '—'}
                                    </td>
                                    <td className="px-4 py-2.5 text-center border-b border-gray-200 bg-yellow-50/50">
                                      <span className={`text-sm font-bold tabular-nums ${qtyNum > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                                        {qtyNum > 0 ? formatCurrency(amount) : '—'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>

              {/* Grand total footer */}
              <tfoot className="sticky bottom-0 z-10">
                <tr>
                  <td className="bg-emerald-800 px-4 py-3 text-xs font-bold text-white border-r border-emerald-700">GRAND TOTAL</td>
                  <td className="bg-emerald-800 px-4 py-3 text-center border-r border-emerald-700">
                    <span className="text-xs font-bold text-white tabular-nums">
                      {filledCount > 0 ? `${products.reduce((s, p) => s + (parseFloat(qty[p.productId]) || 0), 0)} units` : '—'}
                    </span>
                  </td>
                  <td className="bg-emerald-800 px-4 py-3 border-r border-emerald-700" />
                  <td className="bg-emerald-800 px-4 py-3 text-center border-r border-emerald-700">
                    <span className="text-xs font-bold text-white tabular-nums">
                      {grandTotal.crates > 0 ? `${Number.isInteger(grandTotal.crates) ? grandTotal.crates : grandTotal.crates.toFixed(1)} Crates` : '—'}
                    </span>
                  </td>
                  <td className="bg-emerald-800 px-4 py-3 text-center">
                    <span className="text-sm font-bold text-amber-300 tabular-nums">
                      {grandTotal.value > 0 ? formatCurrency(grandTotal.value) : '—'}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {!loading && products.length === 0 && (
        <div className="mx-4 mt-4 bg-white rounded-2xl border border-amber-200 px-5 py-8 flex items-start gap-3">
          <AlertCircle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-slate-800">No products enabled for your account</p>
            <p className="text-xs text-slate-500 mt-0.5">Ask your admin to enable products for you in the salesperson setup.</p>
          </div>
        </div>
      )}
    </div>
  );
}
