import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Save, Loader2, Package, TrendingUp, Search, X, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import DateSelector from '../../components/DateSelector';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

const ROUTE_LABELS = ['Route 1', 'Route 2', 'Route 3', 'Route 4'];

/** Compute container count from units */
function calcContainerDisplay(units, containerType, unitsPerContainer) {
  if (!containerType || !unitsPerContainer || !units) return '—';
  const count = parseFloat(units) / unitsPerContainer;
  if (count <= 0) return '—';
  const label = containerType.charAt(0).toUpperCase() + containerType.slice(1);
  const display = Number.isInteger(count) ? count : count.toFixed(2);
  return `${display} ${label}${count !== 1 ? 's' : ''}`;
}

export default function StockReceipt() {
  const { notify } = useNotification();
  const { brandName } = useParams();
  const [date, setDate]               = useState(getIndiaDate());
  const [activeBrand, setActiveBrand] = useState(null);
  const [products, setProducts]       = useState([]);
  const [categories, setCategories]   = useState([]);
  const [quantities, setQuantities]   = useState({});
  const [routeQty, setRouteQty]       = useState({});
  const [balance, setBalance]         = useState({ opening: 0, stockValue: 0, paid: 0, closing: 0 });
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]           = useState('');
  const inputRefs = useRef({});

  const isNandini = activeBrand?.name?.toLowerCase() === 'nandini';
  const COL_COUNT = isNandini ? 8 : 5;

  const getEffectiveQty = (productId) => {
    if (isNandini) {
      return (routeQty[productId] ?? []).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    }
    return parseFloat(quantities[productId]) || 0;
  };

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
    api.get(`/categories?brandId=${activeBrand.id}`)
      .then(r => setCategories(r.data.data ?? []))
      .catch(() => {});
  }, [activeBrand]);

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
        for (const r of receiptRes.data.data) qty[r.productId] = String(r.quantity);
        setQuantities(qty);

        const routes = {};
        for (const p of prods) routes[p.id] = ['', '', '', ''];
        for (const r of receiptRes.data.data) {
          if (routes[r.productId]) routes[r.productId][0] = String(r.quantity);
        }
        setRouteQty(routes);

        setCollapsedCategories({});
      })
      .catch(() => notify('Failed to load products', 'error'))
      .finally(() => setLoading(false));
  }, [activeBrand, date]);

  const filteredGrouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? products.filter(p =>
          p.name.toLowerCase().includes(q) ||
          (p.category ?? '').toLowerCase().includes(q)
        )
      : products;

    const grouped = filtered.reduce((acc, p) => {
      const key = p.category || 'Other';
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    }, {});

    const catOrderMap = Object.fromEntries(categories.map(c => [c.name, c.displayOrder]));
    return Object.entries(grouped).sort(([a], [b]) => {
      const oa = catOrderMap[a] ?? 9999;
      const ob = catOrderMap[b] ?? 9999;
      return oa !== ob ? oa - ob : a.localeCompare(b);
    });
  }, [products, categories, search]);

  const allFiltered = filteredGrouped.flatMap(([, items]) => items);

  const handleKeyDown = (e, productId) => {
    if (isNandini) return;
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
      .filter(p => getEffectiveQty(p.id) > 0)
      .map(p => ({
        productId: p.id,
        quantity:  getEffectiveQty(p.id),
        unitPrice: Number(p.costPrice),
      }));

    if (!items.length) { notify('Enter at least one quantity before saving.', 'warning'); return; }

    setSaving(true);
    try {
      await api.post('/stock-receipts/bulk', { brandId: activeBrand.id, date, items });
      notify('Receipt saved successfully!', 'success');
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

  const expandAll = () => {
    const next = {};
    filteredGrouped.forEach(([cat]) => { next[cat] = false; });
    setCollapsedCategories(next);
  };

  const collapseAll = () => {
    const next = {};
    filteredGrouped.forEach(([cat]) => { next[cat] = true; });
    setCollapsedCategories(next);
  };

  const totalAmount = products.reduce((s, p) => s + getEffectiveQty(p.id) * Number(p.costPrice), 0);
  const totalUnits  = products.reduce((s, p) => s + getEffectiveQty(p.id), 0);

  const totalCrates = products.reduce((s, p) => {
    const units = getEffectiveQty(p.id);
    if (!p.containerType || !p.unitsPerContainer || !units) return s;
    return s + units / p.unitsPerContainer;
  }, 0);

  const containerTypes = products
    .filter(p => p.containerType && p.unitsPerContainer && getEffectiveQty(p.id) > 0)
    .map(p => p.containerType);
  const crateLabel = containerTypes.length > 0
    ? (containerTypes[0].charAt(0).toUpperCase() + containerTypes[0].slice(1)) + 's'
    : 'Crates';

  const filledCount = products.filter(p => getEffectiveQty(p.id) > 0).length;
  const isOwing = balance.closing > 0;

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* ── Saving overlay ──────────────────────────────────── */}
      {saving && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-slate-700 font-semibold text-sm">Saving receipt…</p>
          </div>
        </div>
      )}

      {/* ── Page header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800">
        <div className="flex items-center gap-2.5">
          <Package size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">
              {activeBrand ? `${activeBrand.name} Stock Receipt` : 'Stock Receipt'}
            </h1>
            <p className="text-emerald-300 text-xs">Enter quantities received from dairy</p>
          </div>
        </div>
        <DateSelector date={date} onChange={setDate} dark />
      </div>

      {/* ── Balance summary card + action bar (fixed, non-scrolling) ── */}
      <div className="flex-shrink-0">

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

        {/* ── Action bar (search + expand/collapse + save) ── */}
        {products.length > 0 && (
          <div className="mx-4 mt-3 bg-white rounded-2xl border border-slate-200 px-3 py-3 flex flex-col gap-2.5">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by product or category…"
                className="w-full pl-8 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-300"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Expand / Collapse / Save row */}
            <div className="flex items-center gap-2">
              {filteredGrouped.length > 1 && (
                <>
                  <button
                    onClick={expandAll}
                    className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-emerald-300 hover:text-emerald-700 transition whitespace-nowrap"
                  >
                    <ChevronsUpDown size={12} />
                    Expand All
                  </button>
                  <button
                    onClick={collapseAll}
                    className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-emerald-300 hover:text-emerald-700 transition whitespace-nowrap"
                  >
                    <ChevronsDownUp size={12} />
                    Collapse All
                  </button>
                </>
              )}
              <div className="flex-1" />
              <button
                onClick={handleSave}
                disabled={saving || loading || filledCount === 0}
                className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold px-4 py-2 rounded-xl transition text-sm shadow-sm whitespace-nowrap"
              >
                {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                {saving ? 'Saving…' : 'Save Receipt'}
              </button>
            </div>
          </div>
        )}

      </div>{/* end fixed top section */}

      {/* ── Table — flex-1 own scroll context, sticky thead works here ── */}
      {products.length > 0 && (
        <div className="flex-1 min-h-0 mx-4 mb-4 mt-3 rounded-2xl border border-slate-200 overflow-auto">
          <table className="min-w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="bg-emerald-700 px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider rounded-tl-2xl">Product</th>
                {isNandini ? (
                  <>
                    {ROUTE_LABELS.map(label => (
                      <th key={label} className="bg-emerald-700 px-3 py-3 text-center text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap">{label}</th>
                    ))}
                    <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Rate</th>
                    <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Crates/Boxes</th>
                  </>
                ) : (
                  <>
                    <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Units</th>
                    <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Rate</th>
                    <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Crates/Boxes</th>
                  </>
                )}
                <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider rounded-tr-2xl">Amount</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {loading ? (
                <tr><td colSpan={COL_COUNT} className="py-20 text-center"><Loader2 className="w-7 h-7 text-emerald-600 animate-spin mx-auto" /></td></tr>
              ) : !activeBrand ? (
                <tr><td colSpan={COL_COUNT} className="py-16 text-center text-slate-400 text-sm">Brand not found.</td></tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className="py-16 text-center text-slate-400 text-sm px-4">
                    No active products for {activeBrand.name}.<br />
                    <span className="text-xs">Add them in Dairy → Product Setup.</span>
                  </td>
                </tr>
              ) : filteredGrouped.length === 0 ? (
                <tr><td colSpan={COL_COUNT} className="py-10 text-center text-slate-400 text-sm">No products match your search.</td></tr>
              ) : (
                <>
                  {filteredGrouped.map(([category, items], catIdx) => {
                    const isCollapsed  = collapsedCategories[category] ?? (catIdx !== 0);
                    const catAmount    = items.reduce((s, p) => s + getEffectiveQty(p.id) * Number(p.costPrice), 0);
                    const catFilled    = items.filter(p => getEffectiveQty(p.id) > 0).length;
                    const filledPct    = items.length > 0 ? Math.round((catFilled / items.length) * 100) : 0;

                    return (
                      <React.Fragment key={category}>
                        {/* Category header row */}
                        <tr
                          className="cursor-pointer select-none hover:bg-slate-200/60 transition-colors"
                          onClick={() => setCollapsedCategories(prev => ({ ...prev, [category]: !isCollapsed }))}
                        >
                          <td colSpan={COL_COUNT} className="border-l-4 border-emerald-500 bg-slate-100 border-b border-slate-200">
                            {/* Top line: name + items count + amount */}
                            <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
                              {isCollapsed
                                ? <ChevronRight size={14} className="text-slate-400 flex-shrink-0" />
                                : <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
                              }
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">{category}</span>
                              <span className="text-[10px] font-semibold text-slate-400 uppercase">{items.length} items</span>
                              {catAmount > 0 && (
                                <span className="ml-auto text-xs font-bold text-emerald-700 tabular-nums">
                                  Receipt: {formatCurrency(catAmount)}
                                </span>
                              )}
                            </div>
                            {/* Bottom line: filled progress */}
                            <div className="px-4 pb-2">
                              <span className={`text-[10px] font-semibold tabular-nums ${filledPct === 100 ? 'text-emerald-600' : filledPct > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                {catFilled}/{items.length} FILLED ({filledPct}%)
                              </span>
                            </div>
                          </td>
                        </tr>

                        {/* Product rows */}
                        {!isCollapsed && items.map((p) => {
                          const effectiveQty = getEffectiveQty(p.id);
                          const amount       = effectiveQty * Number(p.costPrice);
                          const filled       = effectiveQty > 0;

                          return (
                            <tr key={p.id} className="hover:bg-slate-50/60 transition-colors border-b border-slate-100">
                              {/* Product name + unit label below */}
                              <td className="px-4 py-3">
                                <div className="text-sm font-semibold text-slate-800 leading-tight">{p.name}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {p.unitType === 'ml' ? `${p.unitSize ?? '?'}ml` : p.unitType === 'gram' ? `${p.unitSize ?? '?'}g` : 'piece'}
                                </div>
                              </td>

                              {isNandini ? (
                                <>
                                  {ROUTE_LABELS.map((_, ri) => (
                                    <td key={ri} className="px-2 py-3 text-center">
                                      <input
                                        ref={el => { inputRefs.current[`${p.id}_r${ri}`] = el; }}
                                        type="number"
                                        inputMode="decimal"
                                        value={routeQty[p.id]?.[ri] ?? ''}
                                        onChange={e => setRouteQty(prev => {
                                          const updated = [...(prev[p.id] ?? ['', '', '', ''])];
                                          updated[ri] = e.target.value;
                                          return { ...prev, [p.id]: updated };
                                        })}
                                        step="1"
                                        min="0"
                                        placeholder="0"
                                        className="w-14 text-center px-1 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent tabular-nums transition-all placeholder:text-slate-300 bg-white text-slate-700"
                                      />
                                    </td>
                                  ))}
                                  <td className="px-4 py-3 text-center text-xs tabular-nums text-slate-500 whitespace-nowrap">
                                    ₹{Number(p.costPrice).toFixed(2)}
                                  </td>
                                  <td className="px-4 py-3 text-center text-xs tabular-nums text-slate-600 whitespace-nowrap">
                                    {calcContainerDisplay(effectiveQty, p.containerType, p.unitsPerContainer)}
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="px-4 py-3 text-center">
                                    <div className="inline-flex items-center gap-1.5">
                                      <input
                                        ref={el => { inputRefs.current[p.id] = el; }}
                                        type="number"
                                        inputMode="decimal"
                                        value={quantities[p.id] ?? ''}
                                        onChange={e => setQuantities(prev => ({ ...prev, [p.id]: e.target.value }))}
                                        onKeyDown={e => handleKeyDown(e, p.id)}
                                        step="1"
                                        min="0"
                                        placeholder="0"
                                        className="w-16 text-center px-1.5 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent tabular-nums transition-all placeholder:text-slate-300 bg-white text-slate-700"
                                      />
                                      <span className="text-xs text-slate-400">
                                        {p.unitType === 'piece' ? 'pcs' : p.unitType === 'gram' ? 'pkts' : 'units'}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-center text-xs tabular-nums text-slate-500 whitespace-nowrap">
                                    ₹{Number(p.costPrice).toFixed(2)}
                                  </td>
                                  <td className="px-4 py-3 text-center text-xs tabular-nums text-slate-600 whitespace-nowrap">
                                    {calcContainerDisplay(effectiveQty, p.containerType, p.unitsPerContainer)}
                                  </td>
                                </>
                              )}

                              <td className="px-4 py-3 text-center">
                                <span className={`text-sm font-bold tabular-nums whitespace-nowrap ${filled ? 'text-slate-800' : 'text-slate-300'}`}>
                                  {filled ? formatCurrency(amount) : '₹0.00'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
