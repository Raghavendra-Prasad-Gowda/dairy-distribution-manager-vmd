import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Save, Loader2, Package, TrendingUp, Search, X, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, AlertCircle } from 'lucide-react';
import DateSelector from '../../components/DateSelector';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

// Colour palette cycling across route pills
const ROUTE_COLORS = [
  { pill: 'bg-sky-500 text-white border-sky-500 shadow-sm',       pillInactive: 'bg-white text-sky-600 border-sky-200 hover:border-sky-400',     dot: 'bg-sky-400',     ring: 'focus:ring-sky-400' },
  { pill: 'bg-violet-500 text-white border-violet-500 shadow-sm', pillInactive: 'bg-white text-violet-600 border-violet-200 hover:border-violet-400', dot: 'bg-violet-400', ring: 'focus:ring-violet-400' },
  { pill: 'bg-amber-500 text-white border-amber-500 shadow-sm',   pillInactive: 'bg-white text-amber-600 border-amber-200 hover:border-amber-400',   dot: 'bg-amber-400',   ring: 'focus:ring-amber-400' },
  { pill: 'bg-rose-500 text-white border-rose-500 shadow-sm',     pillInactive: 'bg-white text-rose-600 border-rose-200 hover:border-rose-400',     dot: 'bg-rose-400',   ring: 'focus:ring-rose-400' },
  { pill: 'bg-emerald-500 text-white border-emerald-500 shadow-sm', pillInactive: 'bg-white text-emerald-600 border-emerald-200 hover:border-emerald-400', dot: 'bg-emerald-400', ring: 'focus:ring-emerald-400' },
];

function calcContainerDisplay(units, containerType, unitsPerContainer) {
  if (!containerType || !unitsPerContainer || !units) return '—';
  const count = parseFloat(units) / unitsPerContainer;
  if (count <= 0) return '—';
  const label = containerType.charAt(0).toUpperCase() + containerType.slice(1);
  return `${Number.isInteger(count) ? count : count.toFixed(2)} ${label}${count !== 1 ? 's' : ''}`;
}

export default function StockReceipt() {
  const { notify } = useNotification();
  const { brandName } = useParams();

  const [date, setDate]                         = useState(getIndiaDate());
  const [activeBrand, setActiveBrand]           = useState(null);
  const [products, setProducts]                 = useState([]);
  const [categories, setCategories]             = useState([]);
  const [routeQty, setRouteQty]                 = useState({}); // { productId: { routeId: qty } }
  const [savedRouteIds, setSavedRouteIds]       = useState(new Set()); // route IDs that have saved receipts
  const [routes, setRoutes]                     = useState([]);
  const [routesLoading, setRoutesLoading]       = useState(false);
  const [activeRouteIdx, setActiveRouteIdx]     = useState(0);
  const [balance, setBalance]                   = useState({ opening: 0, stockValue: 0, depositValue: 0, paid: 0, closing: 0 });
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [loading, setLoading]                   = useState(false);
  const [saving, setSaving]                     = useState(false);
  const [search, setSearch]                     = useState('');
  const inputRefs = useRef({});

  const COL_COUNT  = 5;
  const today       = getIndiaDate();
  const activeRoute = routes[activeRouteIdx] ?? null;
  const activeColor = ROUTE_COLORS[activeRouteIdx % ROUTE_COLORS.length];
  const hasRoutes   = routes.length > 0;

  // Qty for the currently selected route — drives the table
  const getDisplayQty = (productId) =>
    activeRoute ? (parseFloat(routeQty[productId]?.[activeRoute.id]) || 0) : 0;

  // Raw string in the input box
  const getInputVal = (productId) =>
    activeRoute ? (routeQty[productId]?.[activeRoute.id] ?? '') : '';

  // Sum across ALL routes — drives the balance card
  const getEffectiveQty = (productId) =>
    Object.values(routeQty[productId] ?? {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  // ─── Brand ────────────────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/brands')
      .then(r => {
        const brands   = r.data.data;
        const matched  = brandName
          ? brands.find(b => b.name.toLowerCase() === brandName.toLowerCase())
          : brands[0];
        setActiveBrand(matched ?? null);
      })
      .catch(() => notify('Failed to load brands', 'error'));
  }, [brandName]);

  // ─── Routes (all brands) ──────────────────────────────────────────────────
  useEffect(() => {
    if (!activeBrand) return;
    setRoutesLoading(true);
    api.get(`/routes?brandId=${activeBrand.id}`)
      .then(r => { setRoutes(r.data.data ?? []); setActiveRouteIdx(0); })
      .catch(() => setRoutes([]))
      .finally(() => setRoutesLoading(false));
  }, [activeBrand]);

  // ─── Balance ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeBrand) return;
    api.get(`/dairy-balance?date=${date}`)
      .then(r => {
        const entry = (r.data.data?.brands ?? []).find(b => b.brandId === activeBrand.id);
        setBalance(entry
          ? { opening: entry.openingBalance, stockValue: entry.stockValue, depositValue: Number(entry.depositValue ?? 0), paid: entry.amountPaid, closing: entry.closingBalance }
          : { opening: 0, stockValue: 0, depositValue: 0, paid: 0, closing: 0 });
      })
      .catch(() => {});
  }, [activeBrand, date]);

  // ─── Categories ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeBrand) return;
    api.get(`/categories?brandId=${activeBrand.id}`)
      .then(r => setCategories(r.data.data ?? []))
      .catch(() => {});
  }, [activeBrand]);

  // ─── Products + Receipts ──────────────────────────────────────────────────
  useEffect(() => {
    if (!activeBrand) return;
    setLoading(true);
    Promise.all([
      api.get(`/products?brandId=${activeBrand.id}&date=${date}`),
      api.get(`/stock-receipts?date=${date}&brandId=${activeBrand.id}`),
    ])
      .then(([prodRes, receiptRes]) => {
        const prods    = prodRes.data.data.filter(p => p.showInStockReceipt !== false);
        const receipts = receiptRes.data.data;

        setProducts(prods);

        // Map saved receipts back into routeQty (keyed by actual route DB id)
        const rqty = {};
        for (const p of prods) rqty[p.id] = {};
        const routeIdsWithData = new Set();
        for (const r of receipts) {
          if (r.routeId && r.routeId !== 0 && rqty[r.productId] !== undefined) {
            rqty[r.productId][r.routeId] = String(r.quantity);
            routeIdsWithData.add(r.routeId);
          }
        }
        setRouteQty(rqty);
        setSavedRouteIds(routeIdsWithData);
        setCollapsedCategories({});
      })
      .catch(() => notify('Failed to load products', 'error'))
      .finally(() => setLoading(false));
  }, [activeBrand, date]);

  // ─── Keyboard nav ─────────────────────────────────────────────────────────
  const allFiltered = useMemo(
    () => filteredGrouped().flatMap(([, items]) => items),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, categories, search, routeQty, date, savedRouteIds]
  );

  function filteredGrouped() {
    const q        = search.trim().toLowerCase();
    // For past dates: show only purchased products — but only when data exists.
    // If nothing was saved for this date (client forgot / was busy), show all
    // products so they can still enter the missing data.
    const isPast       = date < today;
    const hasAnyData   = savedRouteIds.size > 0;
    const base         = (isPast && hasAnyData) ? products.filter(p => getEffectiveQty(p.id) > 0) : products;
    const filtered = q
      ? base.filter(p => p.name.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q))
      : base;
    const grouped  = filtered.reduce((acc, p) => {
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
  }

  const groupedData = useMemo(filteredGrouped, [products, categories, search, savedRouteIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = (e, productId) => {
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    const idx = allFiltered.findIndex(p => p.id === productId);
    if (idx < allFiltered.length - 1) {
      e.preventDefault();
      inputRefs.current[allFiltered[idx + 1]?.id]?.focus();
    }
  };

  // ─── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!activeRoute) { notify('Select a route first.', 'warning'); return; }

    const items = products
      .map(p => ({
        productId: p.id,
        quantity:  parseFloat(getInputVal(p.id)) || 0,
        unitPrice: Number(p.costPrice),
      }))
      .filter(item => item.quantity > 0);

    if (!items.length && !savedRouteIds.has(activeRoute.id)) {
      notify('Enter at least one quantity before saving.', 'warning');
      return;
    }

    setSaving(true);
    try {
      await api.post('/stock-receipts/bulk', {
        brandId: activeBrand.id,
        date,
        items,
        routeId: activeRoute.id,
      });
      notify(`Route ${activeRoute.routeNumber} receipt saved!`, 'success');
      api.get(`/dairy-balance?date=${date}`).then(r => {
        const entry = (r.data.data?.brands ?? []).find(b => b.brandId === activeBrand.id);
        if (entry) setBalance({ opening: entry.openingBalance, stockValue: entry.stockValue, depositValue: Number(entry.depositValue ?? 0), paid: entry.amountPaid, closing: entry.closingBalance });
      }).catch(() => {});
    } catch (e) {
      notify(e.response?.data?.error ?? 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const expandAll  = () => { const n = {}; groupedData.forEach(([c]) => { n[c] = false; }); setCollapsedCategories(n); };
  const collapseAll = () => { const n = {}; groupedData.forEach(([c]) => { n[c] = true;  }); setCollapsedCategories(n); };

  // ─── Derived totals ───────────────────────────────────────────────────────
  // Balance card — sum across ALL routes
  const totalAmount = products.reduce((s, p) => s + getEffectiveQty(p.id) * Number(p.costPrice), 0);
  const filledCount = products.filter(p => getEffectiveQty(p.id) > 0).length;

  // Live deposit — recomputes as quantities are entered, mirrors balance service logic
  const liveDepositValue = React.useMemo(() => {
    if (!activeBrand?.depositEnabled || !Number(activeBrand.depositPerLitre)) return 0;
    const depositPerLitre = Number(activeBrand.depositPerLitre);
    const enabledCatNames = new Set(categories.filter(c => c.depositEnabled).map(c => c.name));
    return products.reduce((sum, p) => {
      if (
        p.depositEnabled &&
        (p.unitType === 'ml' || p.unitType === 'gram') &&
        p.containerType === 'crate' &&
        p.unitSize &&
        enabledCatNames.has(p.category ?? '')
      ) {
        return sum + getEffectiveQty(p.id) * (Number(p.unitSize) / 1000) * depositPerLitre;
      }
      return sum;
    }, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand, categories, products, routeQty]);

  // Table / footer — active route only
  const displayTotalUnits  = products.reduce((s, p) => s + getDisplayQty(p.id), 0);
  const displayTotalAmount = products.reduce((s, p) => s + getDisplayQty(p.id) * Number(p.costPrice), 0);
  const displayTotalCrates = products.reduce((s, p) => {
    const u = getDisplayQty(p.id);
    return (!p.containerType || !p.unitsPerContainer || !u) ? s : s + u / p.unitsPerContainer;
  }, 0);
  const displayCrateTypes  = products.filter(p => p.containerType && p.unitsPerContainer && getDisplayQty(p.id) > 0).map(p => p.containerType);
  const crateLabel         = displayCrateTypes.length > 0
    ? (displayCrateTypes[0].charAt(0).toUpperCase() + displayCrateTypes[0].slice(1)) + 's'
    : 'Crates';

  // Per-route summary (for route strip detail)
  const routeSummary = routes.map(r => {
    const units  = products.reduce((s, p) => s + (parseFloat(routeQty[p.id]?.[r.id]) || 0), 0);
    const amount = products.reduce((s, p) => s + (parseFloat(routeQty[p.id]?.[r.id]) || 0) * Number(p.costPrice), 0);
    const crates = products.reduce((s, p) => {
      const q = parseFloat(routeQty[p.id]?.[r.id]) || 0;
      return (!p.containerType || !p.unitsPerContainer || !q) ? s : s + q / p.unitsPerContainer;
    }, 0);
    const crateType = products.find(p => p.containerType && (parseFloat(routeQty[p.id]?.[r.id]) || 0) > 0)?.containerType;
    return { routeId: r.id, routeNumber: r.routeNumber, units, amount, crates, crateType };
  });

  const isOwing = balance.closing > 0;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="bg-slate-100 pb-6">

      {/* Saving overlay */}
      {saving && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-slate-700 font-semibold text-sm">Saving receipt…</p>
          </div>
        </div>
      )}

      {/* Page header */}
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

      {/* ── Balance card (full width) ── */}
      {activeBrand && (
        <div className="mx-4 mt-4 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)' }}>
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={14} className="text-blue-200" />
              <p className="text-xs font-bold text-blue-200 uppercase tracking-widest">Account Balance</p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
              {[
                { label: 'Opening Balance', value: balance.opening,                                    color: 'text-white' },
                { label: "Today's Amount",  value: balance.stockValue + balance.depositValue,           color: 'text-blue-200' },
                { label: 'Amount Paid',     value: balance.paid,                                       color: 'text-emerald-300' },
                { label: isOwing ? 'You Owe' : 'Settled', value: Math.abs(balance.closing),            color: isOwing ? 'text-red-300' : 'text-emerald-300' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white/10 rounded-xl px-3 py-2.5">
                  <p className="text-[10px] text-blue-200 font-medium mb-0.5">{label}</p>
                  <p className={`text-base font-bold tabular-nums ${color}`}>{formatCurrency(value)}</p>
                </div>
              ))}
            </div>
            <div className="bg-amber-400 rounded-xl px-3 py-2.5">
              <p className="text-[10px] font-bold text-amber-800 uppercase tracking-widest mb-2">Today's Bill</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-amber-300/60 rounded-lg px-3 py-2 text-center">
                  <p className="text-[10px] font-semibold text-amber-800 mb-0.5">Stock</p>
                  <p className="text-sm font-bold text-amber-900 tabular-nums">{formatCurrency(totalAmount)}</p>
                </div>
                {liveDepositValue > 0 && (
                  <>
                    <span className="text-amber-700 font-bold text-sm">+</span>
                    <div className="flex-1 bg-amber-300/60 rounded-lg px-3 py-2 text-center">
                      <p className="text-[10px] font-semibold text-amber-800 mb-0.5">Deposit</p>
                      <p className="text-sm font-bold text-amber-900 tabular-nums">{formatCurrency(liveDepositValue)}</p>
                    </div>
                    <span className="text-amber-700 font-bold text-sm">=</span>
                    <p className="text-base font-bold text-amber-900 tabular-nums flex-shrink-0">{formatCurrency(totalAmount + liveDepositValue)}</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Controls bar (below balance) ── */}
      {products.length > 0 && hasRoutes && (
        <div className="mx-4 mt-2 bg-white rounded-2xl border border-slate-200 overflow-hidden">

          {/* Route summary cards — equal-width grid, always same height */}
          {(() => {
            const n = routes.length;
            const gridClass =
              n === 1 ? 'grid-cols-1' :
              n === 2 ? 'grid-cols-2' :
              n === 3 ? 'grid-cols-3' :
              n === 4 ? 'grid-cols-2 sm:grid-cols-4' :
                        'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5';
            // Check if ANY route has crate data — if so all cards show that row
            const showCratesRow = routeSummary.some(s => s.crateType && s.crates > 0);
            return (
              <div className={`grid ${gridClass} gap-2 px-3 pt-3 pb-3`}>
                {routeSummary.map((s, ri) => {
                  const color    = ROUTE_COLORS[ri % ROUTE_COLORS.length];
                  const isActive = ri === activeRouteIdx;
                  const hasData  = s.units > 0;
                  const crateVal = s.crateType && s.crates > 0
                    ? `${Number.isInteger(s.crates) ? s.crates : s.crates.toFixed(1)} ${s.crateType.charAt(0).toUpperCase() + s.crateType.slice(1)}${s.crates !== 1 ? 's' : ''}`
                    : null;
                  return (
                    <button
                      key={s.routeId}
                      onClick={() => setActiveRouteIdx(ri)}
                      className={`text-left rounded-xl px-3.5 py-3 border-2 transition-all ${
                        isActive
                          ? color.pill
                          : hasData
                            ? 'border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300'
                            : 'border-dashed border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <p className={`text-sm font-extrabold tracking-tight mb-2.5 ${isActive ? 'text-white' : 'text-slate-700'}`}>
                        Route {s.routeNumber}
                      </p>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-[11px] ${isActive ? 'text-white/70' : 'text-slate-400'}`}>Total Units</span>
                          <span className={`text-sm font-bold tabular-nums ${isActive ? 'text-white' : 'text-slate-800'}`}>
                            {hasData ? s.units : <span className="text-slate-300">—</span>}
                          </span>
                        </div>
                        {showCratesRow && (
                          <div className="flex items-center justify-between gap-1">
                            <span className={`text-[11px] ${isActive ? 'text-white/70' : 'text-slate-400'}`}>Total Crates</span>
                            <span className={`text-sm font-bold tabular-nums ${isActive ? 'text-white' : 'text-amber-600'}`}>
                              {crateVal ?? <span className={isActive ? 'text-white/30' : 'text-slate-300'}>—</span>}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-[11px] ${isActive ? 'text-white/70' : 'text-slate-400'}`}>Total Amount</span>
                          <span className={`text-sm font-bold tabular-nums ${isActive ? 'text-white' : 'text-emerald-700'}`}>
                            {hasData ? formatCurrency(s.amount) : <span className={isActive ? 'text-white/30' : 'text-slate-300'}>—</span>}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* Row 3: Search + Expand/Collapse + Save */}
          <div className="border-t border-slate-100 px-3 py-2 flex items-center gap-2">

            {/* Search */}
            <div className="relative flex-1 min-w-0">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search product or category…"
                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-300"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Expand / Collapse */}
            {groupedData.length > 1 && (
              <>
                <button onClick={expandAll} className="flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-emerald-300 hover:text-emerald-700 transition whitespace-nowrap">
                  <ChevronsUpDown size={12} /> Expand
                </button>
                <button onClick={collapseAll} className="flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-emerald-300 hover:text-emerald-700 transition whitespace-nowrap">
                  <ChevronsDownUp size={12} /> Collapse
                </button>
              </>
            )}

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || loading || !activeRoute || (displayTotalUnits === 0 && !savedRouteIds.has(activeRoute?.id))}
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold px-4 py-1.5 rounded-xl transition text-sm shadow-sm whitespace-nowrap"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
              {saving ? 'Saving…' : `Save Route ${activeRoute?.routeNumber ?? '—'}`}
            </button>
          </div>

        </div>
      )}

      {/* ── No routes configured ── */}
      {!routesLoading && activeBrand && !hasRoutes && (
        <div className="mx-4 mt-4 bg-white rounded-2xl border border-amber-200 px-5 py-6 flex items-start gap-3">
          <AlertCircle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-slate-800">No routes configured for {activeBrand.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Go to <span className="font-semibold text-emerald-700">Setup → Routes</span> and add at least one route to start entering stock receipts.
            </p>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      {hasRoutes && products.length > 0 && (
        <div className="mx-4 mb-4 mt-3 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[65vh]" style={{ WebkitOverflowScrolling: 'touch' }}>
            <table className="w-full text-sm border-separate border-spacing-0" style={{ minWidth: 560 }}>
              <colgroup>
                <col style={{ width: '38%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '14%' }} />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="bg-emerald-700 px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600">Product</th>
                  <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600 whitespace-nowrap">
                    {activeRoute ? `Route ${activeRoute.routeNumber}` : 'Units'}
                  </th>
                  <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600">Rate</th>
                  <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600">Crates/Boxes</th>
                  <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Amount</th>
                </tr>
              </thead>

              <tbody className="bg-white">
                {loading ? (
                  <tr><td colSpan={COL_COUNT} className="py-20 text-center"><Loader2 className="w-7 h-7 text-emerald-600 animate-spin mx-auto" /></td></tr>
                ) : groupedData.length === 0 ? (
                  <tr><td colSpan={COL_COUNT} className="py-10 text-center text-slate-400 text-sm">No products match your search.</td></tr>
                ) : (
                  groupedData.map(([category, items], catIdx) => {
                    const isCollapsed   = collapsedCategories[category] ?? (catIdx !== 0);
                    const catUnits      = items.reduce((s, p) => s + getDisplayQty(p.id), 0);
                    const catAmount     = items.reduce((s, p) => s + getDisplayQty(p.id) * Number(p.costPrice), 0);
                    const catFilled     = items.filter(p => getDisplayQty(p.id) > 0).length;
                    const catCrateItems = items.filter(p => p.containerType && p.unitsPerContainer && getDisplayQty(p.id) > 0);
                    const catCrateCount = catCrateItems.reduce((s, p) => s + getDisplayQty(p.id) / p.unitsPerContainer, 0);
                    const catCrateType  = catCrateItems[0]?.containerType;
                    const catCrateLabel = catCrateType
                      ? `${Number.isInteger(catCrateCount) ? catCrateCount : catCrateCount.toFixed(1)} ${catCrateType.charAt(0).toUpperCase() + catCrateType.slice(1)}${catCrateCount !== 1 ? 's' : ''}`
                      : null;

                    return (
                      <React.Fragment key={category}>
                        {/* Category row */}
                        <tr
                          className="cursor-pointer select-none hover:bg-gray-100 transition-colors"
                          onClick={() => setCollapsedCategories(prev => ({ ...prev, [category]: !isCollapsed }))}
                        >
                          <td colSpan={COL_COUNT} className="border-l-4 border-emerald-500 bg-gray-50 border-b border-gray-200 px-4 py-2.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              {isCollapsed ? <ChevronRight size={13} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={13} className="text-slate-400 flex-shrink-0" />}
                              <span className="text-xs font-bold uppercase tracking-wide text-gray-800">{category}</span>
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-normal">{items.length} items</span>
                              {catUnits > 0 && (
                                <>
                                  <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold tabular-nums">{catUnits} units</span>
                                  {catCrateLabel && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold tabular-nums">{catCrateLabel}</span>}
                                  {catAmount > 0 && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-semibold tabular-nums ml-auto">{formatCurrency(catAmount)}</span>}
                                </>
                              )}
                              {catUnits === 0 && (
                                <span className={`text-[10px] font-semibold ml-auto ${catFilled > 0 ? 'text-amber-500' : 'text-slate-400'}`}>
                                  {catFilled}/{items.length} filled
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Product rows */}
                        {!isCollapsed && items.map(p => {
                          const displayQty = getDisplayQty(p.id);
                          const inputVal   = getInputVal(p.id);
                          const amount     = displayQty * Number(p.costPrice);
                          const filled     = displayQty > 0;

                          return (
                            <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-2.5 border-b border-gray-200 border-r border-gray-100">
                                <div className="text-sm font-medium text-gray-900 leading-tight">{p.name}</div>
                                <div className="text-[10px] text-gray-400 mt-0.5">
                                  {p.unitType === 'ml' ? `${p.unitSize ?? '?'}ml` : p.unitType === 'gram' ? `${p.unitSize ?? '?'}g` : 'piece'}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-center border-b border-gray-200 border-r border-gray-100">
                                <div className="inline-flex items-center gap-1.5">
                                  <input
                                    ref={el => { inputRefs.current[p.id] = el; }}
                                    type="number"
                                    inputMode="decimal"
                                    value={inputVal}
                                    onChange={e => {
                                      if (!activeRoute) return;
                                      setRouteQty(prev => ({
                                        ...prev,
                                        [p.id]: { ...(prev[p.id] ?? {}), [activeRoute.id]: e.target.value },
                                      }));
                                    }}
                                    onKeyDown={e => handleKeyDown(e, p.id)}
                                    step="1" min="0" placeholder="0"
                                    className={`w-16 text-center px-1.5 py-1.5 border rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:border-transparent tabular-nums transition-all placeholder:text-gray-300 bg-white text-gray-800 border-gray-200 ${activeColor.ring}`}
                                  />
                                  <span className="text-xs text-gray-400">
                                    {p.unitType === 'piece' ? 'pcs' : p.unitType === 'gram' ? 'pkts' : 'units'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-center text-xs tabular-nums text-gray-600 whitespace-nowrap border-b border-gray-200 border-r border-gray-100 bg-slate-50">
                                ₹{Number(p.costPrice).toFixed(2)}
                              </td>
                              <td className="px-4 py-2.5 text-center text-xs tabular-nums text-amber-700 whitespace-nowrap border-b border-gray-200 border-r border-gray-100 bg-amber-50/40">
                                {calcContainerDisplay(displayQty, p.containerType, p.unitsPerContainer)}
                              </td>
                              <td className="px-4 py-2.5 text-center border-b border-gray-200 bg-yellow-50/50">
                                <span className={`text-sm font-bold tabular-nums whitespace-nowrap ${filled ? 'text-gray-900' : 'text-gray-300'}`}>
                                  {filled ? formatCurrency(amount) : '—'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>

              {/* Footer */}
              <tfoot className="sticky bottom-0 z-10">
                <tr>
                  <td className="bg-emerald-800 px-4 py-3 text-xs font-bold text-white border-r border-emerald-700">
                    {activeRoute ? `Route ${activeRoute.routeNumber}` : 'TOTALS'}
                  </td>
                  <td className="bg-emerald-800 px-4 py-3 text-center border-r border-emerald-700">
                    <span className="text-xs font-bold text-white tabular-nums">{displayTotalUnits > 0 ? displayTotalUnits : '—'}</span>
                  </td>
                  <td className="bg-emerald-800 px-4 py-3 text-center text-xs text-emerald-400 border-r border-emerald-700" />
                  <td className="bg-emerald-800 px-4 py-3 text-center border-r border-emerald-700">
                    <span className="text-xs font-bold text-white tabular-nums">
                      {displayTotalCrates > 0 ? `${Number.isInteger(displayTotalCrates) ? displayTotalCrates : displayTotalCrates.toFixed(2)} ${crateLabel}` : '—'}
                    </span>
                  </td>
                  <td className="bg-emerald-800 px-4 py-3 text-center">
                    <span className="text-sm font-bold text-amber-300 tabular-nums">{displayTotalAmount > 0 ? formatCurrency(displayTotalAmount) : '—'}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
