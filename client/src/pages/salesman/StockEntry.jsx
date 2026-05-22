import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Save, Loader2, ShoppingCart, TrendingUp, Search, X,
  ChevronDown, ChevronRight, CheckCircle, AlertCircle, Minus, Plus, Lock,
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

function unitLabel(p) {
  if (p.unitType === 'ml')    return `${p.unitSize ?? '?'}ml`;
  if (p.unitType === 'gram')  return `${p.unitSize ?? '?'}g`;
  return 'piece';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BrandHeader({ brand, collapsed, totalValue, totalCrates, crateLabel, totalUnits, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 bg-emerald-800 active:bg-emerald-700 px-4 py-4 text-left select-none transition-colors"
    >
      {collapsed
        ? <ChevronRight size={16} className="text-emerald-300 flex-shrink-0" />
        : <ChevronDown  size={16} className="text-emerald-300 flex-shrink-0" />
      }
      <span className="flex-1 text-base font-extrabold text-white uppercase tracking-wide leading-tight">
        {brand.brandName}
      </span>
      <div className="text-right flex-shrink-0">
        {totalValue > 0 && (
          <p className="text-sm font-bold text-amber-300 tabular-nums leading-tight">
            {formatCurrency(totalValue)}
          </p>
        )}
        {totalCrates > 0 && (
          <p className="text-[11px] text-emerald-300 tabular-nums leading-tight">
            {Number.isInteger(totalCrates) ? totalCrates : totalCrates.toFixed(1)} {crateLabel}{totalCrates !== 1 ? 's' : ''}
          </p>
        )}
        {!totalValue && totalUnits > 0 && (
          <p className="text-xs text-emerald-300 tabular-nums">{totalUnits} units</p>
        )}
      </div>
    </button>
  );
}

function CategoryHeader({ name, count, collapsed, totalUnits, totalAmount, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 bg-slate-50 active:bg-slate-100 border-l-4 border-emerald-400 px-4 py-3 text-left select-none transition-colors"
    >
      {collapsed
        ? <ChevronRight size={13} className="text-slate-400 flex-shrink-0" />
        : <ChevronDown  size={13} className="text-slate-400 flex-shrink-0" />
      }
      <span className="flex-1 text-xs font-bold uppercase tracking-wider text-slate-600 leading-tight">
        {name}
      </span>
      <span className="text-[11px] text-slate-400 tabular-nums">{count}</span>
      {totalUnits > 0 && (
        <span className="text-[11px] font-semibold text-emerald-700 tabular-nums bg-emerald-50 px-2 py-0.5 rounded-full">
          {totalUnits} units
        </span>
      )}
      {totalAmount > 0 && (
        <span className="text-[11px] font-bold text-amber-700 tabular-nums">
          {formatCurrency(totalAmount)}
        </span>
      )}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SalespersonStockEntry() {
  const { notify } = useNotification();
  const { user } = useAuth();

  const [date, setDate]               = useState(getIndiaDate());
  const [products, setProducts]       = useState([]);
  const [qty, setQty]                 = useState({});
  const [dispatch, setDispatch]       = useState(null);
  const [balance, setBalance]         = useState({ opening: 0, stockGiven: 0, paid: 0, closing: 0 });
  const [collapsedBrands, setCollapsedBrands] = useState({});
  const [collapsedCats, setCollapsedCats]     = useState({});
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [search, setSearch]           = useState('');
  const inputRefs = useRef({});

  const today = getIndiaDate();
  const salespersonId = user?.salespersonId;

  // ─── Load products + dispatch ─────────────────────────────────────────────
  useEffect(() => {
    if (!salespersonId) return;
    setLoading(true);
    Promise.all([
      api.get(`/salespeople/${salespersonId}/prices`),
      api.get(`/dispatches?date=${date}`),
    ])
      .then(([priceRes, dispatchRes]) => {
        const priceItems    = priceRes.data.data ?? [];
        const todayDispatch = (dispatchRes.data.data ?? [])[0] ?? null;
        setProducts(priceItems);
        setDispatch(todayDispatch);
        const qtyMap = {};
        for (const item of todayDispatch?.items ?? []) {
          qtyMap[item.productId] = String(item.quantity);
        }
        setQty(qtyMap);
        const allBrandIds = [...new Set(priceItems.map(p => p.brandId))];
        setCollapsedBrands(Object.fromEntries(allBrandIds.map(id => [id, true])));
        const allCatKeys = [...new Set(priceItems.map(p => `${p.brandId}:${p.category || 'General'}`))];
        setCollapsedCats(Object.fromEntries(allCatKeys.map(k => [k, true])));
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

  // ─── Build hierarchy ──────────────────────────────────────────────────────
  const hierarchy = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? products.filter(p =>
          p.productName.toLowerCase().includes(q) ||
          (p.category ?? '').toLowerCase().includes(q) ||
          p.brandName.toLowerCase().includes(q)
        )
      : products;

    const brandMap = {};
    for (const p of base) {
      if (!brandMap[p.brandId]) {
        brandMap[p.brandId] = {
          brandId: p.brandId,
          brandName: p.brandName,
          brandDisplayOrder: p.brandDisplayOrder ?? 0,
          categories: {},
        };
      }
      const catKey = p.category || 'General';
      if (!brandMap[p.brandId].categories[catKey]) {
        brandMap[p.brandId].categories[catKey] = {
          name: catKey,
          categoryDisplayOrder: p.categoryDisplayOrder ?? 999,
          products: [],
        };
      }
      brandMap[p.brandId].categories[catKey].products.push(p);
    }

    for (const brand of Object.values(brandMap)) {
      for (const cat of Object.values(brand.categories)) {
        cat.products.sort((a, b) => a.displayOrder - b.displayOrder || a.productName.localeCompare(b.productName));
      }
    }

    return Object.values(brandMap).sort(
      (a, b) => a.brandDisplayOrder - b.brandDisplayOrder || a.brandName.localeCompare(b.brandName)
    );
  }, [products, search]);

  const flatProducts = useMemo(
    () => hierarchy.flatMap(br =>
      Object.values(br.categories)
        .sort((a, b) => a.categoryDisplayOrder - b.categoryDisplayOrder || a.name.localeCompare(b.name))
        .flatMap(c => c.products)
    ),
    [hierarchy]
  );

  // ─── Per-brand totals ──────────────────────────────────────────────────────
  const brandTotals = useMemo(() => {
    return hierarchy.map(br => {
      let value = 0, crates = 0, crateLabel = null;
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

  const totalUnits   = products.reduce((s, p) => s + (parseFloat(qty[p.productId]) || 0), 0);
  const filledCount  = products.filter(p => (parseFloat(qty[p.productId]) || 0) > 0).length;

  // ─── Keyboard nav ─────────────────────────────────────────────────────────
  const handleKeyDown = (e, productId) => {
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    const idx = flatProducts.findIndex(p => p.productId === productId);
    if (idx < flatProducts.length - 1) {
      e.preventDefault();
      inputRefs.current[flatProducts[idx + 1]?.productId]?.focus();
    }
  };

  // ─── Stepper ──────────────────────────────────────────────────────────────
  const handleDecrement = (productId) => {
    setQty(prev => {
      const cur = parseFloat(prev[productId]) || 0;
      if (cur <= 0) return prev;
      const next = cur - 1;
      return { ...prev, [productId]: next === 0 ? '' : String(next) };
    });
  };

  const handleIncrement = (productId) => {
    setQty(prev => {
      const cur = parseFloat(prev[productId]) || 0;
      return { ...prev, [productId]: String(cur + 1) };
    });
  };

  // ─── Expand / Collapse all ────────────────────────────────────────────────
  const handleExpandAll = () => {
    setCollapsedBrands({});
    setCollapsedCats({});
  };
  const handleCollapseAll = () => {
    const brandIds = [...new Set(products.map(p => p.brandId))];
    setCollapsedBrands(Object.fromEntries(brandIds.map(id => [id, true])));
    const catKeys = [...new Set(products.map(p => `${p.brandId}:${p.category || 'General'}`))];
    setCollapsedCats(Object.fromEntries(catKeys.map(k => [k, true])));
  };

  // ─── Refresh after save/submit ────────────────────────────────────────────
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

  // ─── Save / Submit ─────────────────────────────────────────────────────────
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

  const handleSaveAndSubmit = async () => {
    const items = products
      .map(p => ({ productId: p.productId, quantity: parseFloat(qty[p.productId]) || 0, unitPrice: p.sellingPrice ?? 0 }))
      .filter(i => i.quantity > 0);
    if (!items.length) { notify('Enter at least one quantity before submitting.', 'warning'); return; }
    setSubmitting(true);
    try {
      const saveRes = await api.post('/dispatches', { dispatchDate: date, items });
      const savedId = saveRes.data.data?.id ?? dispatch?.id;
      if (savedId) await api.patch(`/dispatches/${savedId}/submit`);
      notify('Stock entry submitted and locked.', 'success');
      await refreshState();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Submit failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const isBusy    = saving || submitting || loading;
  const isOwing   = balance.closing > 0;
  const isPast    = date < today;
  // Locked: submitted or past date, unless admin explicitly unlocked it
  const isLocked  = dispatch
    ? dispatch.isLocked
    : isPast; // past date with no dispatch → implicitly locked

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-100">

      {/* Fullscreen loading overlay */}
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

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3.5 bg-emerald-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <ShoppingCart size={17} className="text-emerald-300 flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white leading-tight truncate">
              {user?.salespersonName ? `${user.salespersonName}'s Stock` : 'Stock Entry'}
            </h1>
            <p className="text-emerald-300 text-xs">Enter today's quantities</p>
          </div>
        </div>
        <DateSelector date={date} onChange={setDate} dark />
      </div>

      {/* ── Scrollable content ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Balance card ─────────────────────────────────────────────────── */}
        <div className="mx-3 mt-3 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)' }}>
          <div className="px-4 pt-4 pb-3">

            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={14} className="text-blue-200" />
              <p className="text-xs font-bold text-blue-200 uppercase tracking-widest">My Balance</p>
            </div>

            {/* 4 balance metrics — 2-column grid on mobile */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                { label: 'Opening',     value: balance.opening,           color: 'text-white' },
                { label: 'Stock Taken', value: balance.stockGiven,        color: 'text-blue-200' },
                { label: 'Amount Paid', value: balance.paid,              color: 'text-emerald-300' },
                { label: isOwing ? 'Balance Due' : 'Settled',
                  value: Math.abs(balance.closing),
                  color: isOwing ? 'text-red-300' : 'text-emerald-300' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white/10 rounded-xl px-3 py-2.5">
                  <p className="text-[10px] text-blue-200 font-medium mb-0.5">{label}</p>
                  <p className={`text-base font-bold tabular-nums leading-tight ${color}`}>{formatCurrency(value)}</p>
                </div>
              ))}
            </div>

            {/* Per-brand totals */}
            <div className="bg-amber-400 rounded-xl px-3 py-2.5">
              <p className="text-[10px] font-bold text-amber-800 uppercase tracking-widest mb-2">Today's Stock Cost</p>
              {/* Brand boxes — flex-1 so they fill available width in any orientation */}
              <div className="flex items-stretch gap-1 mb-1.5">
                {brandTotals.map((b, idx) => (
                  <React.Fragment key={b.brandId}>
                    {idx > 0 && (
                      <span className="flex-shrink-0 text-amber-700 font-bold text-base self-center px-0.5">+</span>
                    )}
                    <div className="flex-1 min-w-0 bg-amber-300/60 rounded-lg px-3 py-2">
                      <p className="text-[10px] font-bold text-amber-800 mb-1 truncate">{b.brandName}</p>
                      <p className="text-sm font-bold text-amber-900 tabular-nums">{formatCurrency(b.value)}</p>
                      {b.crates > 0 && (
                        <p className="text-[10px] font-semibold text-amber-700 tabular-nums">
                          {Number.isInteger(b.crates) ? b.crates : b.crates.toFixed(1)} {b.crateLabel}{b.crates !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  </React.Fragment>
                ))}
              </div>
              {/* Total row — full width, same style */}
              {brandTotals.length > 1 && (
                <div className="bg-amber-300/60 rounded-lg px-3 py-2 flex items-center justify-between gap-4">
                  <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wide">Total</p>
                  <div className="flex items-center gap-3">
                    {grandTotal.crates > 0 && (
                      <p className="text-[10px] font-bold text-amber-800 tabular-nums">
                        {Number.isInteger(grandTotal.crates) ? grandTotal.crates : grandTotal.crates.toFixed(1)} Crates
                      </p>
                    )}
                    <p className="text-sm font-bold text-amber-900 tabular-nums">{formatCurrency(grandTotal.value)}</p>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ── Search bar + expand/collapse ──────────────────────────────────── */}
        {!loading && products.length > 0 && (
          <div className="mx-3 mt-3 space-y-2">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search product, category or brand…"
                className="w-full pl-10 pr-9 py-3 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-300 shadow-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExpandAll}
                className="flex-1 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-50 transition"
              >
                Expand All
              </button>
              <button
                onClick={handleCollapseAll}
                className="flex-1 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-50 transition"
              >
                Collapse All
              </button>
            </div>
          </div>
        )}

        {/* ── Product list ──────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="mx-3 mt-3 bg-white rounded-2xl border border-amber-200 px-5 py-8 flex items-start gap-3">
            <AlertCircle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-slate-800">No products enabled for your account</p>
              <p className="text-xs text-slate-500 mt-1">Ask your admin to enable products in the salesperson setup.</p>
            </div>
          </div>
        ) : hierarchy.length === 0 ? (
          <div className="mx-3 mt-3 bg-white rounded-2xl border border-slate-200 px-5 py-8 text-center text-slate-400 text-sm">
            No products match your search.
          </div>
        ) : (
          <div className="mx-3 mt-3 mb-2 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            {hierarchy.map(brand => {
              const bt             = brandTotals.find(b => b.brandId === brand.brandId);
              const brandCollapsed = collapsedBrands[brand.brandId] ?? false;
              const brandUnits     = Object.values(brand.categories)
                .flatMap(c => c.products)
                .reduce((s, p) => s + (parseFloat(qty[p.productId]) || 0), 0);
              const catList = Object.values(brand.categories).sort(
                (a, b) => a.categoryDisplayOrder - b.categoryDisplayOrder || a.name.localeCompare(b.name)
              );

              return (
                <React.Fragment key={brand.brandId}>
                  <BrandHeader
                    brand={brand}
                    collapsed={brandCollapsed}
                    totalValue={bt?.value ?? 0}
                    totalCrates={bt?.crates ?? 0}
                    crateLabel={bt?.crateLabel ?? 'Crate'}
                    totalUnits={brandUnits}
                    onClick={() => setCollapsedBrands(prev => ({ ...prev, [brand.brandId]: !prev[brand.brandId] }))}
                  />

                  {!brandCollapsed && catList.map(cat => {
                    const catKey    = `${brand.brandId}:${cat.name}`;
                    const catCollapsed = collapsedCats[catKey] ?? false;
                    const catUnits  = cat.products.reduce((s, p) => s + (parseFloat(qty[p.productId]) || 0), 0);
                    const catAmount = cat.products.reduce((s, p) => s + (parseFloat(qty[p.productId]) || 0) * (p.sellingPrice ?? 0), 0);

                    return (
                      <React.Fragment key={catKey}>
                        <CategoryHeader
                          name={cat.name}
                          count={cat.products.length}
                          collapsed={catCollapsed}
                          totalUnits={catUnits}
                          totalAmount={catAmount}
                          onClick={() => setCollapsedCats(prev => ({ ...prev, [catKey]: !prev[catKey] }))}
                        />

                        {!catCollapsed && cat.products.map((p, pIdx) => {
                          const qtyVal  = qty[p.productId] ?? '';
                          const qtyNum  = parseFloat(qtyVal) || 0;
                          const price   = p.sellingPrice ?? 0;
                          const amount  = qtyNum * price;
                          const noPrice = p.sellingPrice === null;
                          const crateStr = calcContainerDisplay(qtyNum, p.containerType, p.unitsPerContainer);
                          const isLast  = pIdx === cat.products.length - 1;

                          return (
                            <div
                              key={p.productId}
                              className={`px-4 pt-3 pb-3 ${!isLast ? 'border-b border-slate-100' : ''} ${noPrice ? 'bg-amber-50/40' : ''}`}
                            >
                              {/* Row 1: Product name + amount */}
                              <div className="flex items-start justify-between gap-2 mb-2.5">
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-semibold leading-snug ${noPrice ? 'text-slate-400' : 'text-slate-900'}`}>
                                    {p.productName}
                                  </p>
                                  <p className="text-xs text-slate-400 mt-0.5">
                                    {unitLabel(p)}
                                    {noPrice
                                      ? <span className="ml-2 text-amber-500 font-semibold">No price set</span>
                                      : <span className="ml-2">₹{parseFloat(Number(price).toFixed(4))}/unit</span>
                                    }
                                  </p>
                                </div>
                                {qtyNum > 0 && (
                                  <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-bold text-emerald-700 tabular-nums leading-tight">
                                      {formatCurrency(amount)}
                                    </p>
                                    {crateStr && (
                                      <p className="text-[11px] text-amber-600 tabular-nums leading-tight">{crateStr}</p>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Row 2: Stepper */}
                              <div className="flex items-center gap-2">
                                {/* Decrement */}
                                <button
                                  type="button"
                                  onPointerDown={e => e.preventDefault()}
                                  onClick={() => handleDecrement(p.productId)}
                                  disabled={noPrice || qtyNum <= 0}
                                  className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 disabled:opacity-25 active:bg-slate-200 active:scale-95 transition select-none"
                                >
                                  <Minus size={16} />
                                </button>

                                {/* Qty input */}
                                <input
                                  ref={el => { inputRefs.current[p.productId] = el; }}
                                  type="number"
                                  inputMode="decimal"
                                  value={qtyVal}
                                  onChange={e => setQty(prev => ({ ...prev, [p.productId]: e.target.value }))}
                                  onKeyDown={e => handleKeyDown(e, p.productId)}
                                  step="1"
                                  min="0"
                                  placeholder="0"
                                  disabled={noPrice}
                                  className="flex-1 h-11 text-center font-bold text-lg border-2 rounded-xl focus:outline-none focus:border-emerald-500 tabular-nums disabled:bg-slate-50 disabled:text-slate-300 border-slate-200 text-slate-900 bg-white"
                                />

                                {/* Increment */}
                                <button
                                  type="button"
                                  onPointerDown={e => e.preventDefault()}
                                  onClick={() => handleIncrement(p.productId)}
                                  disabled={noPrice}
                                  className="w-11 h-11 rounded-xl bg-emerald-600 flex items-center justify-center text-white disabled:opacity-25 active:bg-emerald-700 active:scale-95 transition select-none"
                                >
                                  <Plus size={16} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}

            {/* Grand total footer */}
            {filledCount > 0 && (
              <div className="flex items-center justify-between bg-emerald-800 px-4 py-3.5">
                <div>
                  <p className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Grand Total</p>
                  <p className="text-xs text-emerald-400 mt-0.5">{filledCount} product{filledCount !== 1 ? 's' : ''} · {totalUnits} units</p>
                </div>
                <p className="text-xl font-extrabold text-amber-300 tabular-nums">{formatCurrency(grandTotal.value)}</p>
              </div>
            )}
          </div>
        )}

        {/* Bottom padding so content doesn't hide behind action bar */}
        <div className="h-4" />
      </div>

      {/* ── Sticky action bar ────────────────────────────────────────────────── */}
      {!loading && products.length > 0 && (
        isLocked ? (
          <div className="flex-shrink-0 bg-slate-800 border-t border-slate-700 px-4 py-3.5 flex items-center gap-3">
            <Lock size={16} className="text-slate-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-white leading-tight">
                {dispatch?.isAdminUnlocked === false && dispatch?.isSubmitted
                  ? 'Submitted & locked'
                  : isPast
                  ? 'Past date — locked'
                  : 'Locked'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Contact your admin to make changes</p>
            </div>
          </div>
        ) : (
          <div className="flex-shrink-0 bg-white border-t border-slate-200 px-3 py-3 space-y-2">
            {filledCount > 0 && (
              <p className="text-xs text-center text-slate-500 font-medium">
                {filledCount} product{filledCount !== 1 ? 's' : ''} · {totalUnits} units ·{' '}
                <span className="font-bold text-emerald-700">{formatCurrency(grandTotal.value)}</span>
              </p>
            )}
            <div className="flex gap-2.5">
              <button
                onClick={handleSave}
                disabled={isBusy || filledCount === 0}
                className="flex-1 flex items-center justify-center gap-2 h-13 min-h-[52px] rounded-2xl border-2 border-slate-200 bg-white text-slate-700 font-bold text-sm disabled:opacity-40 active:bg-slate-50 transition"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                Save Draft
              </button>
              <button
                onClick={handleSaveAndSubmit}
                disabled={isBusy || filledCount === 0}
                className="flex-1 flex items-center justify-center gap-2 h-13 min-h-[52px] rounded-2xl bg-emerald-700 text-white font-bold text-sm disabled:opacity-40 active:bg-emerald-800 transition shadow-sm"
              >
                {submitting ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                Save &amp; Submit
              </button>
            </div>
          </div>
        )
      )}

    </div>
  );
}
