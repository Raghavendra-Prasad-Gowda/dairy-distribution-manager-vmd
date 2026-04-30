import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Save, Loader2, Package, TrendingUp, Search, X, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import DateSelector from '../../components/DateSelector';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

// Cycling color palette for route tabs
const ROUTE_COLORS = [
  {
    pill:        'bg-sky-500 text-white border-sky-500 shadow-sm',
    pillInactive:'bg-white text-sky-600 border-sky-200 hover:border-sky-400 hover:text-sky-700',
    dot:         'bg-sky-400',
    ring:        'focus:ring-sky-400',
    summaryCard: 'border-sky-200 bg-sky-50/70',
    summaryTitle:'text-sky-700',
    badge:       'text-sky-700 bg-sky-50',
  },
  {
    pill:        'bg-violet-500 text-white border-violet-500 shadow-sm',
    pillInactive:'bg-white text-violet-600 border-violet-200 hover:border-violet-400 hover:text-violet-700',
    dot:         'bg-violet-400',
    ring:        'focus:ring-violet-400',
    summaryCard: 'border-violet-200 bg-violet-50/70',
    summaryTitle:'text-violet-700',
    badge:       'text-violet-700 bg-violet-50',
  },
  {
    pill:        'bg-amber-500 text-white border-amber-500 shadow-sm',
    pillInactive:'bg-white text-amber-600 border-amber-200 hover:border-amber-400 hover:text-amber-700',
    dot:         'bg-amber-400',
    ring:        'focus:ring-amber-400',
    summaryCard: 'border-amber-200 bg-amber-50/70',
    summaryTitle:'text-amber-700',
    badge:       'text-amber-700 bg-amber-50',
  },
  {
    pill:        'bg-rose-500 text-white border-rose-500 shadow-sm',
    pillInactive:'bg-white text-rose-600 border-rose-200 hover:border-rose-400 hover:text-rose-700',
    dot:         'bg-rose-400',
    ring:        'focus:ring-rose-400',
    summaryCard: 'border-rose-200 bg-rose-50/70',
    summaryTitle:'text-rose-700',
    badge:       'text-rose-700 bg-rose-50',
  },
  {
    pill:        'bg-emerald-500 text-white border-emerald-500 shadow-sm',
    pillInactive:'bg-white text-emerald-600 border-emerald-200 hover:border-emerald-400 hover:text-emerald-700',
    dot:         'bg-emerald-400',
    ring:        'focus:ring-emerald-400',
    summaryCard: 'border-emerald-200 bg-emerald-50/70',
    summaryTitle:'text-emerald-700',
    badge:       'text-emerald-700 bg-emerald-50',
  },
];

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
  // Non-Nandini: { productId: string }
  const [quantities, setQuantities]   = useState({});
  // Nandini: { productId: { routeId: string } }  keyed by actual route DB id
  const [routeQty, setRouteQty]       = useState({});
  const [routes, setRoutes]           = useState([]);
  const [activeRouteIdx, setActiveRouteIdx] = useState(0);
  const [balance, setBalance]         = useState({ opening: 0, stockValue: 0, paid: 0, closing: 0 });
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]           = useState('');
  const inputRefs = useRef({});

  const isNandini = activeBrand?.name?.toLowerCase() === 'nandini';
  const COL_COUNT = 5;

  // Sum across ALL routes — used only for balance card totals and route summary panel
  const getEffectiveQty = (productId) => {
    if (isNandini) {
      return Object.values(routeQty[productId] ?? {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    }
    return parseFloat(quantities[productId]) || 0;
  };

  // Quantity for the currently active route (or the only route for non-Nandini)
  // Used for table display: input, amount column, crates column, category totals, footer
  const getDisplayQty = (productId) => {
    if (isNandini && activeRoute) return parseFloat(routeQty[productId]?.[activeRoute.id]) || 0;
    return parseFloat(quantities[productId]) || 0;
  };

  // Quantity for a specific route
  const getRouteQty = (productId, routeId) => routeQty[productId]?.[routeId] ?? '';

  const activeRoute = routes[activeRouteIdx] ?? null;

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

  // Fetch routes for Nandini
  useEffect(() => {
    if (!activeBrand) return;
    if (activeBrand.name?.toLowerCase() === 'nandini') {
      api.get(`/routes?brandId=${activeBrand.id}`)
        .then(r => { setRoutes(r.data.data ?? []); setActiveRouteIdx(0); })
        .catch(() => {});
    } else {
      setRoutes([]);
      setActiveRouteIdx(0);
    }
  }, [activeBrand]);

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

        const receipts = receiptRes.data.data;

        // Non-Nandini: single quantity per product (routeId=0)
        const qty = {};
        for (const p of prods) qty[p.id] = '';
        for (const r of receipts) {
          if (r.routeId === 0 || r.routeId === null) qty[r.productId] = String(r.quantity);
        }
        setQuantities(qty);

        // Nandini: per-route quantities keyed by routeId
        const rqty = {};
        for (const p of prods) rqty[p.id] = {};
        for (const r of receipts) {
          if (r.routeId && r.routeId !== 0) {
            if (rqty[r.productId] !== undefined) {
              rqty[r.productId][r.routeId] = String(r.quantity);
            }
          }
        }
        setRouteQty(rqty);

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
    if (e.key === 'Enter' || e.key === 'Tab') {
      const idx = allFiltered.findIndex(p => p.id === productId);
      if (idx < allFiltered.length - 1) {
        e.preventDefault();
        const nextId = allFiltered[idx + 1]?.id;
        const key = isNandini ? `${nextId}_r${activeRouteIdx}` : nextId;
        inputRefs.current[key]?.focus();
      }
    }
  };

  const handleSave = async () => {
    let items;

    if (isNandini) {
      if (!activeRoute) { notify('No route selected.', 'warning'); return; }
      // Save only the active route's quantities
      items = products
        .map(p => ({
          productId: p.id,
          quantity:  parseFloat(getRouteQty(p.id, activeRoute.id)) || 0,
          unitPrice: Number(p.costPrice),
        }))
        .filter(item => item.quantity > 0);
    } else {
      items = products
        .filter(p => getEffectiveQty(p.id) > 0)
        .map(p => ({
          productId: p.id,
          quantity:  getEffectiveQty(p.id),
          unitPrice: Number(p.costPrice),
        }));
    }

    if (!items.length) { notify('Enter at least one quantity before saving.', 'warning'); return; }

    setSaving(true);
    try {
      const payload = {
        brandId: activeBrand.id,
        date,
        items,
        ...(isNandini && activeRoute ? { routeId: activeRoute.id } : { routeId: 0 }),
      };
      await api.post('/stock-receipts/bulk', payload);
      notify(
        isNandini && activeRoute
          ? `Route ${activeRoute.routeNumber} receipt saved!`
          : 'Receipt saved successfully!',
        'success'
      );
      // Refresh balance
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

  // Grand totals across ALL routes — used only in balance card
  const totalAmount = products.reduce((s, p) => s + getEffectiveQty(p.id) * Number(p.costPrice), 0);
  const totalUnits  = products.reduce((s, p) => s + getEffectiveQty(p.id), 0);

  // Display totals — active route only for Nandini, used in table footer and category headers
  const displayTotalAmount = products.reduce((s, p) => s + getDisplayQty(p.id) * Number(p.costPrice), 0);
  const displayTotalUnits  = products.reduce((s, p) => s + getDisplayQty(p.id), 0);

  // Per-route summary
  const routeSummary = routes.map((r, ri) => {
    const color  = ROUTE_COLORS[ri % ROUTE_COLORS.length];
    const units  = products.reduce((s, p) => s + (parseFloat(routeQty[p.id]?.[r.id]) || 0), 0);
    const amount = products.reduce((s, p) => s + (parseFloat(routeQty[p.id]?.[r.id]) || 0) * Number(p.costPrice), 0);
    const crates = products.reduce((s, p) => {
      const q = parseFloat(routeQty[p.id]?.[r.id]) || 0;
      if (!p.containerType || !p.unitsPerContainer || !q) return s;
      return s + q / p.unitsPerContainer;
    }, 0);
    const crateType = products.find(p => p.containerType && (parseFloat(routeQty[p.id]?.[r.id]) || 0) > 0)?.containerType;
    return { routeNumber: r.routeNumber, routeId: r.id, units, amount, crates, crateType, color };
  });
  const hasRouteSummary = isNandini && routeSummary.some(r => r.units > 0);

  // Footer/table totals — based on display qty (active route for Nandini)
  const displayTotalCrates = products.reduce((s, p) => {
    const units = getDisplayQty(p.id);
    if (!p.containerType || !p.unitsPerContainer || !units) return s;
    return s + units / p.unitsPerContainer;
  }, 0);

  const displayContainerTypes = products
    .filter(p => p.containerType && p.unitsPerContainer && getDisplayQty(p.id) > 0)
    .map(p => p.containerType);
  const crateLabel = displayContainerTypes.length > 0
    ? (displayContainerTypes[0].charAt(0).toUpperCase() + displayContainerTypes[0].slice(1)) + 's'
    : 'Crates';

  // filledCount: count products with any quantity entered across all routes (for balance card badge)
  const filledCount = products.filter(p => getEffectiveQty(p.id) > 0).length;
  const isOwing = balance.closing > 0;
  const activeColor = isNandini ? (ROUTE_COLORS[activeRouteIdx % ROUTE_COLORS.length]) : null;

  return (
    <div className="flex flex-col min-h-full bg-slate-100">
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

      {/* ── Fixed top section ── */}
      <div className="flex-shrink-0">

        {/* Desktop: balance card + controls side-by-side; Mobile: stacked */}
        <div className="lg:flex lg:gap-3 lg:items-start mx-4 mt-4">

          {/* Balance card */}
          {activeBrand && (
            <div className="lg:flex-1 min-w-0 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)' }}>
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

          {/* Right column: action bar + route strip (stacks vertically within column) */}
          {products.length > 0 && (
            <div className="flex flex-col gap-2 mt-3 lg:mt-0 lg:w-72 lg:flex-shrink-0">

              {/* Action bar */}
              <div className="bg-white rounded-2xl border border-slate-200 px-3 py-3 flex flex-col gap-2.5">
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
                {filteredGrouped.length > 1 && (
                  <div className="flex items-center gap-2">
                    <button onClick={expandAll} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:border-emerald-300 hover:text-emerald-700 transition">
                      <ChevronsUpDown size={14} /> Expand All
                    </button>
                    <button onClick={collapseAll} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:border-emerald-300 hover:text-emerald-700 transition">
                      <ChevronsDownUp size={14} /> Collapse All
                    </button>
                  </div>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || loading || (isNandini ? !activeRoute : filledCount === 0)}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold px-4 py-2.5 rounded-xl transition text-sm shadow-sm"
                >
                  {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                  {saving
                    ? 'Saving…'
                    : isNandini && activeRoute
                      ? `Save Route ${activeRoute.routeNumber} Receipt`
                      : 'Save Receipt'}
                </button>
              </div>

              {/* Route Strip (Nandini only) */}
              {isNandini && routes.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 px-3 py-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Select Route</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {routes.map((r, ri) => {
                      const color     = ROUTE_COLORS[ri % ROUTE_COLORS.length];
                      const isActive  = ri === activeRouteIdx;
                      const hasFilled = products.some(p => parseFloat(routeQty[p.id]?.[r.id]) > 0);
                      return (
                        <button
                          key={r.id}
                          onClick={() => setActiveRouteIdx(ri)}
                          className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all ${isActive ? color.pill : color.pillInactive}`}
                        >
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-white/70' : color.dot}`} />
                          Route {r.routeNumber}
                          {hasFilled && !isActive && (
                            <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white ${color.dot}`} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          )}

        </div>{/* end desktop 2-col */}

        {/* Route Summary — full width below the 2-col section */}
        {hasRouteSummary && (
          <div className="mx-4 mt-2">
            <div className="bg-white rounded-2xl border border-slate-200 px-3 py-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Route Summary</p>
              <div className="flex gap-2 flex-wrap">
                {routeSummary.map((r, ri) => {
                  const hasData  = r.units > 0;
                  const crateStr = r.crateType
                    ? `${Number.isInteger(r.crates) ? r.crates : r.crates.toFixed(1)} ${r.crateType.charAt(0).toUpperCase() + r.crateType.slice(1)}${r.crates !== 1 ? 's' : ''}`
                    : null;
                  return (
                    <button
                      key={r.routeId}
                      onClick={() => setActiveRouteIdx(ri)}
                      className={`flex-1 min-w-[80px] rounded-xl border px-2.5 py-2 text-left transition-all ${hasData ? r.color.summaryCard : 'border-slate-100 bg-slate-50/60 opacity-40'}`}
                    >
                      <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${hasData ? r.color.summaryTitle : 'text-slate-400'}`}>
                        {r.routeNumber}
                      </p>
                      {hasData ? (
                        <div className="flex flex-wrap gap-1">
                          <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md ${r.color.badge}`}>{r.units}u</span>
                          {crateStr && <span className="text-[10px] font-bold tabular-nums text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md">{crateStr}</span>}
                          <span className="text-[10px] font-bold tabular-nums text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md">{formatCurrency(r.amount)}</span>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-300 font-medium">—</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      </div>{/* end fixed top section */}

      {/* ── Table ── */}
      {products.length > 0 && (
        <div className="flex-1 mx-4 mb-4 mt-3 rounded-2xl border border-slate-200 overflow-auto" style={{ minHeight: 400 }}>
          <table className="w-full table-fixed text-sm border-separate border-spacing-0" style={{ minWidth: 560 }}>
            <colgroup>
              <col style={{ width: '38%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '14%' }} />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="bg-emerald-700 px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider rounded-tl-2xl">Product</th>
                <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap">
                  {isNandini && activeRoute ? `Route ${activeRoute.routeNumber}` : 'Units'}
                </th>
                <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Rate</th>
                <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Crates/Boxes</th>
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
                    const isCollapsed   = collapsedCategories[category] ?? (catIdx !== 0);
                    const catAmount     = items.reduce((s, p) => s + getDisplayQty(p.id) * Number(p.costPrice), 0);
                    const catFilled     = items.filter(p => getDisplayQty(p.id) > 0).length;
                    const filledPct     = items.length > 0 ? Math.round((catFilled / items.length) * 100) : 0;
                    const catTotalUnits = items.reduce((s, p) => s + getDisplayQty(p.id), 0);
                    const catCrateItems = items.filter(p => p.containerType && p.unitsPerContainer && getDisplayQty(p.id) > 0);
                    const catCrateCount = catCrateItems.reduce((s, p) => s + getDisplayQty(p.id) / p.unitsPerContainer, 0);
                    const catCrateType  = catCrateItems[0]?.containerType;
                    const catCrateLabel = catCrateType
                      ? `${Number.isInteger(catCrateCount) ? catCrateCount : catCrateCount.toFixed(1)} ${catCrateType.charAt(0).toUpperCase() + catCrateType.slice(1)}${catCrateCount !== 1 ? 's' : ''}`
                      : null;

                    return (
                      <React.Fragment key={category}>
                        <tr
                          className="cursor-pointer select-none hover:bg-slate-200/60 transition-colors"
                          onClick={() => setCollapsedCategories(prev => ({ ...prev, [category]: !isCollapsed }))}
                        >
                          <td colSpan={COL_COUNT} className="border-l-4 border-emerald-500 bg-slate-100 border-b border-slate-200">
                            <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
                              {isCollapsed
                                ? <ChevronRight size={14} className="text-slate-400 flex-shrink-0" />
                                : <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
                              }
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">{category}</span>
                              <span className="text-[10px] font-semibold text-slate-400 uppercase">{items.length} items</span>
                              {catTotalUnits > 0 && (
                                <div className="ml-auto flex items-center gap-1.5">
                                  <span className="text-[11px] font-bold text-blue-600 tabular-nums bg-blue-50 px-2 py-0.5 rounded-lg">{catTotalUnits} units</span>
                                  {catCrateLabel && (
                                    <span className="text-[11px] font-bold text-amber-600 tabular-nums bg-amber-50 px-2 py-0.5 rounded-lg">{catCrateLabel}</span>
                                  )}
                                  {catAmount > 0 && (
                                    <span className="text-[11px] font-bold text-emerald-700 tabular-nums bg-emerald-50 px-2 py-0.5 rounded-lg">{formatCurrency(catAmount)}</span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="px-4 pb-2">
                              <span className={`text-[10px] font-semibold tabular-nums ${filledPct === 100 ? 'text-emerald-600' : filledPct > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                {catFilled}/{items.length} FILLED ({filledPct}%)
                              </span>
                            </div>
                          </td>
                        </tr>

                        {!isCollapsed && items.map((p) => {
                          const displayQty = getDisplayQty(p.id);
                          const inputVal   = isNandini && activeRoute
                            ? getRouteQty(p.id, activeRoute.id)
                            : (quantities[p.id] ?? '');
                          const amount = displayQty * Number(p.costPrice);
                          const filled = displayQty > 0;

                          return (
                            <tr key={p.id} className="hover:bg-slate-50/60 transition-colors border-b border-slate-100">
                              <td className="px-4 py-3">
                                <div className="text-sm font-semibold text-slate-800 leading-tight">{p.name}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {p.unitType === 'ml' ? `${p.unitSize ?? '?'}ml` : p.unitType === 'gram' ? `${p.unitSize ?? '?'}g` : 'piece'}
                                </div>
                              </td>

                              <td className="px-4 py-3 text-center">
                                <div className="inline-flex items-center gap-1.5">
                                  <input
                                    ref={el => {
                                      inputRefs.current[isNandini ? `${p.id}_r${activeRouteIdx}` : p.id] = el;
                                    }}
                                    type="number"
                                    inputMode="decimal"
                                    value={inputVal}
                                    onChange={e => {
                                      if (isNandini && activeRoute) {
                                        setRouteQty(prev => ({
                                          ...prev,
                                          [p.id]: { ...(prev[p.id] ?? {}), [activeRoute.id]: e.target.value },
                                        }));
                                      } else {
                                        setQuantities(prev => ({ ...prev, [p.id]: e.target.value }));
                                      }
                                    }}
                                    onKeyDown={e => handleKeyDown(e, p.id)}
                                    step="1"
                                    min="0"
                                    placeholder="0"
                                    className={`w-16 text-center px-1.5 py-2 border rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:border-transparent tabular-nums transition-all placeholder:text-slate-300 bg-white text-slate-700 ${
                                      isNandini && activeColor
                                        ? `border-slate-200 ${activeColor.ring}`
                                        : 'border-slate-200 focus:ring-emerald-500'
                                    }`}
                                  />
                                  {!isNandini && (
                                    <span className="text-xs text-slate-400">
                                      {p.unitType === 'piece' ? 'pcs' : p.unitType === 'gram' ? 'pkts' : 'units'}
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="px-4 py-3 text-center text-xs tabular-nums text-slate-500 whitespace-nowrap">
                                ₹{Number(p.costPrice).toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-center text-xs tabular-nums text-slate-600 whitespace-nowrap">
                                {calcContainerDisplay(displayQty, p.containerType, p.unitsPerContainer)}
                              </td>
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

            {/* Sticky footer */}
            <tfoot className="sticky bottom-0 z-10">
              <tr>
                <td className="bg-emerald-800 px-4 py-3 text-xs font-bold text-white rounded-bl-2xl">
                  {isNandini && activeRoute ? `Route ${activeRoute.routeNumber}` : 'Total'}
                </td>
                <td className="bg-emerald-800 px-4 py-3 text-center">
                  <span className="text-xs font-bold text-white tabular-nums">
                    {displayTotalUnits > 0 ? displayTotalUnits : '—'}
                  </span>
                </td>
                <td className="bg-emerald-800 px-4 py-3 text-center text-xs text-emerald-300" />
                <td className="bg-emerald-800 px-4 py-3 text-center">
                  <span className="text-xs font-bold text-white tabular-nums">
                    {displayTotalCrates > 0
                      ? `${Number.isInteger(displayTotalCrates) ? displayTotalCrates : displayTotalCrates.toFixed(2)} ${crateLabel}`
                      : '—'}
                  </span>
                </td>
                <td className="bg-emerald-800 px-4 py-3 text-center rounded-br-2xl">
                  <span className="text-sm font-bold text-amber-300 tabular-nums">
                    {displayTotalAmount > 0 ? formatCurrency(displayTotalAmount) : '—'}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
