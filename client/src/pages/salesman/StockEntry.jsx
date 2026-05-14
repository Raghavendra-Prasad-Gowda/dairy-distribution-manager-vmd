import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Save, Loader2, ShoppingCart, TrendingUp, Search, X, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import DateSelector from '../../components/DateSelector';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { getIndiaDate, formatCurrency } from '../../utils/dateUtils';
import api from '../../api/axios';

function calcContainerDisplay(units, containerType, unitsPerContainer) {
  if (!containerType || !unitsPerContainer || !units) return '—';
  const count = parseFloat(units) / unitsPerContainer;
  if (count <= 0) return '—';
  const label = containerType.charAt(0).toUpperCase() + containerType.slice(1);
  return `${Number.isInteger(count) ? count : count.toFixed(2)} ${label}${count !== 1 ? 's' : ''}`;
}

export default function SalespersonStockEntry() {
  const { notify } = useNotification();
  const { user } = useAuth();

  const [date, setDate]               = useState(getIndiaDate());
  const [brands, setBrands]           = useState([]);
  const [activeBrandId, setActiveBrandId] = useState(null);
  const [allProducts, setAllProducts] = useState([]); // across all brands, with salesperson prices
  const [categories, setCategories]   = useState([]); // for active brand
  const [qty, setQty]                 = useState({}); // { productId: string }
  const [balance, setBalance]         = useState({ opening: 0, stockGiven: 0, paid: 0, closing: 0 });
  const [collapsedCats, setCollapsedCats] = useState({});
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]           = useState('');
  const inputRefs = useRef({});
  const today = getIndiaDate();
  const salespersonId = user?.salespersonId;

  // ─── Load brands once ────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/brands')
      .then(r => {
        const b = r.data.data ?? [];
        setBrands(b);
        if (b.length) setActiveBrandId(b[0].id);
      })
      .catch(() => notify('Failed to load brands', 'error'));
  }, []);

  // ─── Load all products + salesperson prices + existing dispatch ───────────
  useEffect(() => {
    if (!salespersonId) return;
    setLoading(true);
    Promise.all([
      api.get(`/salespeople/${salespersonId}/prices`),
      api.get(`/dispatches?date=${date}&salespersonId=${salespersonId}`),
    ])
      .then(([priceRes, dispatchRes]) => {
        const priceItems = priceRes.data.data ?? []; // includes product fields
        const dispatches = dispatchRes.data.data ?? [];

        setAllProducts(priceItems);

        // Build qty map from existing dispatch items for this date
        const qtyMap = {};
        for (const dispatch of dispatches) {
          for (const item of dispatch.items ?? []) {
            qtyMap[item.productId] = String(item.quantity);
          }
        }
        setQty(qtyMap);
        setCollapsedCats({});
      })
      .catch(() => notify('Failed to load products', 'error'))
      .finally(() => setLoading(false));
  }, [salespersonId, date]);

  // ─── Load categories for active brand ────────────────────────────────────
  useEffect(() => {
    if (!activeBrandId) return;
    api.get(`/categories?brandId=${activeBrandId}`)
      .then(r => setCategories(r.data.data ?? []))
      .catch(() => {});
  }, [activeBrandId]);

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
  }, [salespersonId, date]);

  // ─── Products for active brand ────────────────────────────────────────────
  const brandProducts = useMemo(
    () => allProducts.filter(p => p.brandId === activeBrandId),
    [allProducts, activeBrandId]
  );

  // ─── Grouped and filtered for active brand ────────────────────────────────
  const groupedData = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = brandProducts.filter(p =>
      !q || p.productName.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q)
    );
    const grouped = base.reduce((acc, p) => {
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
  }, [brandProducts, categories, search]);

  // Flat list for keyboard nav
  const allFiltered = useMemo(
    () => groupedData.flatMap(([, items]) => items),
    [groupedData]
  );

  const handleKeyDown = (e, productId) => {
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    const idx = allFiltered.findIndex(p => p.productId === productId);
    if (idx < allFiltered.length - 1) {
      e.preventDefault();
      inputRefs.current[allFiltered[idx + 1]?.productId]?.focus();
    }
  };

  // ─── Totals (all brands, not just active) ────────────────────────────────
  const totalCostAllBrands = allProducts.reduce((s, p) => {
    const q = parseFloat(qty[p.productId]) || 0;
    const price = p.sellingPrice ?? 0;
    return s + q * price;
  }, 0);

  const filledCount = allProducts.filter(p => (parseFloat(qty[p.productId]) || 0) > 0).length;

  // Active brand totals (for table footer)
  const displayTotal = brandProducts.reduce((s, p) => s + (parseFloat(qty[p.productId]) || 0) * (p.sellingPrice ?? 0), 0);
  const displayUnits = brandProducts.reduce((s, p) => s + (parseFloat(qty[p.productId]) || 0), 0);

  // ─── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const items = allProducts
      .map(p => ({
        productId: p.productId,
        quantity:  parseFloat(qty[p.productId]) || 0,
        unitPrice: p.sellingPrice ?? 0,
      }))
      .filter(item => item.quantity > 0);

    if (!items.length) {
      notify('Enter at least one quantity before saving.', 'warning');
      return;
    }

    setSaving(true);
    try {
      await api.post('/dispatches', {
        dispatchDate: date,
        items,
      });
      notify('Stock entry saved!', 'success');
      // Refresh balance
      const r = await api.get(`/salesperson-balance/${salespersonId}?date=${date}`);
      const b = r.data.data;
      setBalance({
        opening:    Number(b?.openingBalance ?? 0),
        stockGiven: Number(b?.stockGiven ?? 0),
        paid:       Number(b?.amountPaid ?? 0),
        closing:    Number(b?.closingBalance ?? 0),
      });
    } catch (e) {
      notify(e.response?.data?.error ?? 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const expandAll   = () => { const n = {}; groupedData.forEach(([c]) => { n[c] = false; }); setCollapsedCats(n); };
  const collapseAll = () => { const n = {}; groupedData.forEach(([c]) => { n[c] = true;  }); setCollapsedCats(n); };

  const isOwing = balance.closing > 0;

  return (
    <div className="bg-slate-100 pb-6">

      {saving && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-slate-700 font-semibold text-sm">Saving stock entry…</p>
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
            <p className="text-emerald-300 text-xs">Enter quantities you are taking today</p>
          </div>
        </div>
        <DateSelector date={date} onChange={setDate} dark />
      </div>

      {/* Balance card */}
      <div className="mx-4 mt-4 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)' }}>
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-blue-200" />
            <p className="text-xs font-bold text-blue-200 uppercase tracking-widest">My Account Balance</p>
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
          {/* Today's bill */}
          <div className="bg-amber-400 rounded-xl px-3 py-2.5">
            <p className="text-[10px] font-bold text-amber-800 uppercase tracking-widest mb-2">Today's Total Cost</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-amber-300/60 rounded-lg px-3 py-2 text-center">
                <p className="text-[10px] font-semibold text-amber-800 mb-0.5">All Brands</p>
                <p className="text-sm font-bold text-amber-900 tabular-nums">{formatCurrency(totalCostAllBrands)}</p>
              </div>
              {filledCount > 0 && (
                <p className="text-xs text-amber-800 font-semibold flex-shrink-0">{filledCount} item{filledCount !== 1 ? 's' : ''}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Brand tabs */}
      {brands.length > 0 && (
        <div className="mx-4 mt-3 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {/* Tab strip */}
          <div className="flex border-b border-slate-200">
            {brands.map(b => {
              const brandCount = allProducts.filter(p => p.brandId === b.id && (parseFloat(qty[p.productId]) || 0) > 0).length;
              return (
                <button
                  key={b.id}
                  onClick={() => setActiveBrandId(b.id)}
                  className={`flex-1 py-3 px-2 text-sm font-semibold transition-colors text-center relative ${
                    activeBrandId === b.id
                      ? 'text-emerald-700 bg-emerald-50'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {b.name}
                  {brandCount > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-600 text-white text-[9px] font-bold">
                      {brandCount}
                    </span>
                  )}
                  {activeBrandId === b.id && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Search + Expand/Collapse + Save */}
          <div className="px-3 py-2 flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search product…"
                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-300"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={13} />
                </button>
              )}
            </div>
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
            <button
              onClick={handleSave}
              disabled={saving || loading || filledCount === 0}
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold px-4 py-1.5 rounded-xl transition text-sm shadow-sm whitespace-nowrap"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Product table */}
      {brandProducts.length > 0 && (
        <div className="mx-4 mb-4 mt-3 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[65vh]" style={{ WebkitOverflowScrolling: 'touch' }}>
            <table className="w-full text-sm border-separate border-spacing-0" style={{ minWidth: 480 }}>
              <colgroup>
                <col style={{ width: '40%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '24%' }} />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="bg-emerald-700 px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600">Product</th>
                  <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600">Qty</th>
                  <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-emerald-600">Rate</th>
                  <th className="bg-emerald-700 px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {loading ? (
                  <tr><td colSpan={4} className="py-20 text-center"><Loader2 className="w-7 h-7 text-emerald-600 animate-spin mx-auto" /></td></tr>
                ) : groupedData.length === 0 ? (
                  <tr><td colSpan={4} className="py-10 text-center text-slate-400 text-sm">No products match your search.</td></tr>
                ) : (
                  groupedData.map(([category, items], catIdx) => {
                    const isCollapsed = collapsedCats[category] ?? (catIdx !== 0);
                    const catUnits    = items.reduce((s, p) => s + (parseFloat(qty[p.productId]) || 0), 0);
                    const catAmount   = items.reduce((s, p) => s + (parseFloat(qty[p.productId]) || 0) * (p.sellingPrice ?? 0), 0);

                    return (
                      <React.Fragment key={category}>
                        <tr
                          className="cursor-pointer select-none hover:bg-gray-100 transition-colors"
                          onClick={() => setCollapsedCats(prev => ({ ...prev, [category]: !isCollapsed }))}
                        >
                          <td colSpan={4} className="border-l-4 border-emerald-500 bg-gray-50 border-b border-gray-200 px-4 py-2.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              {isCollapsed ? <ChevronRight size={13} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={13} className="text-slate-400 flex-shrink-0" />}
                              <span className="text-xs font-bold uppercase tracking-wide text-gray-800">{category}</span>
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-normal">{items.length} items</span>
                              {catUnits > 0 && (
                                <>
                                  <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold tabular-nums">{catUnits} units</span>
                                  {catAmount > 0 && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-semibold tabular-nums ml-auto">{formatCurrency(catAmount)}</span>}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>

                        {!isCollapsed && items.map(p => {
                          const qtyVal  = qty[p.productId] ?? '';
                          const qtyNum  = parseFloat(qtyVal) || 0;
                          const price   = p.sellingPrice ?? 0;
                          const amount  = qtyNum * price;
                          const filled  = qtyNum > 0;
                          const noPrice = p.sellingPrice === null;

                          return (
                            <tr key={p.productId} className={`hover:bg-gray-50 transition-colors ${noPrice ? 'bg-amber-50/30' : ''}`}>
                              <td className="px-4 py-2.5 border-b border-gray-200 border-r border-gray-100">
                                <div className="text-sm font-medium text-gray-900 leading-tight">{p.productName}</div>
                                <div className="text-[10px] text-gray-400 mt-0.5">
                                  {p.unitType === 'ml' ? `${p.unitSize ?? '?'}ml` : p.unitType === 'gram' ? `${p.unitSize ?? '?'}g` : 'piece'}
                                  {noPrice && <span className="ml-2 text-amber-600 font-semibold">No price set</span>}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-center border-b border-gray-200 border-r border-gray-100">
                                <div className="inline-flex items-center gap-1.5">
                                  <input
                                    ref={el => { inputRefs.current[p.productId] = el; }}
                                    type="number"
                                    inputMode="decimal"
                                    value={qtyVal}
                                    onChange={e => setQty(prev => ({ ...prev, [p.productId]: e.target.value }))}
                                    onKeyDown={e => handleKeyDown(e, p.productId)}
                                    step="1" min="0" placeholder="0"
                                    disabled={noPrice}
                                    className="w-16 text-center px-1.5 py-1.5 border rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent tabular-nums transition-all placeholder:text-gray-300 bg-white text-gray-800 border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
                                  />
                                  <span className="text-xs text-gray-400">
                                    {p.unitType === 'piece' ? 'pcs' : p.unitType === 'gram' ? 'pkts' : 'units'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-center text-xs tabular-nums text-gray-600 whitespace-nowrap border-b border-gray-200 border-r border-gray-100 bg-slate-50">
                                {noPrice
                                  ? <span className="text-amber-600">—</span>
                                  : `₹${parseFloat(Number(price).toFixed(4))}`
                                }
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
              <tfoot className="sticky bottom-0 z-10">
                <tr>
                  <td className="bg-emerald-800 px-4 py-3 text-xs font-bold text-white border-r border-emerald-700">TOTALS</td>
                  <td className="bg-emerald-800 px-4 py-3 text-center border-r border-emerald-700">
                    <span className="text-xs font-bold text-white tabular-nums">{displayUnits > 0 ? displayUnits : '—'}</span>
                  </td>
                  <td className="bg-emerald-800 px-4 py-3 text-center border-r border-emerald-700" />
                  <td className="bg-emerald-800 px-4 py-3 text-center">
                    <span className="text-sm font-bold text-amber-300 tabular-nums">{displayTotal > 0 ? formatCurrency(displayTotal) : '—'}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {!loading && brandProducts.length === 0 && brands.length > 0 && (
        <div className="mx-4 mt-4 bg-white rounded-2xl border border-slate-200 px-5 py-8 text-center text-slate-400 text-sm">
          No products configured for this brand. Ask admin to set up products.
        </div>
      )}
    </div>
  );
}
