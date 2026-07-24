import React, { useState, useEffect, useMemo } from 'react';
import { Save, Loader2, IndianRupee, Search, X, Globe, Edit2, Copy } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import Pagination from '../../components/Pagination';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import BrandedLoader from '../../components/ui/BrandedLoader';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate, formatDateShort } from '../../utils/dateUtils';
import api from '../../api/axios';

const ITEMS_PER_PAGE = 10;
const GLOBAL_ID = 'global';

function TogglePill({ enabled, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none flex-shrink-0 ${
        enabled ? 'bg-emerald-500' : 'bg-slate-200'
      }`}
    >
      <span
        className={`inline-block w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function SalesmanPricesSetup() {
  const { notify } = useNotification();
  const [salespeople, setSalespeople]       = useState([]);
  const [selectedSpId, setSelectedSpId]     = useState('');
  const [brands, setBrands]                 = useState([]);
  const [activeBrandId, setActiveBrandId]   = useState(null);

  // Per-person state
  const [prices, setPrices]                 = useState([]);
  const [dirtyToggles, setDirtyToggles]     = useState({});
  // Per-row price edit modal
  const [editingPrice, setEditingPrice]     = useState(null); // { productId, productName, currentPrice }
  const [priceForm, setPriceForm]           = useState({ sellingPrice: '', effectiveFrom: getIndiaDate() });
  const [savingPrice, setSavingPrice]       = useState(false);
  // Copy prices modal
  const [copyFromSpId, setCopyFromSpId]     = useState('');
  const [showCopyModal, setShowCopyModal]   = useState(false);
  const [copyingPrices, setCopyingPrices]   = useState(false);
  // Bulk update prices modal
  const [showBulkUpdateModal, setShowBulkUpdateModal] = useState(false);
  const [bulkUpdateForm, setBulkUpdateForm] = useState({
    selectedSalesmen: new Set(),
    productId: '',
    sellingPrice: '',
    effectiveFrom: getIndiaDate(),
  });
  const [updatingBulkPrices, setUpdatingBulkPrices] = useState(false);

  // Global state
  const [globalProducts, setGlobalProducts] = useState([]);
  const [dirtyGlobal, setDirtyGlobal]       = useState({});
  const [dirtyGlobalPrices, setDirtyGlobalPrices] = useState({});

  const [showEnabledOnly, setShowEnabledOnly] = useState(
    () => localStorage.getItem('sp_showEnabledOnly') !== 'false'
  );
  const [loading, setLoading]               = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [search, setSearch]                 = useState('');
  const [currentPage, setCurrentPage]       = useState(1);

  const isGlobal = selectedSpId === GLOBAL_ID;

  useEffect(() => {
    Promise.all([api.get('/salespeople?all=true'), api.get('/brands')])
      .then(([spRes, brandRes]) => {
        const sp = spRes.data.data.filter(s => s.isActive);
        setSalespeople(sp);
        if (sp.length) setSelectedSpId(String(sp[0].id));
        const b = brandRes.data.data;
        setBrands(b);
        if (b.length) setActiveBrandId(b[0].id);
      })
      .catch(() => notify('Failed to load data', 'error'));
  }, []);

  useEffect(() => {
    if (!selectedSpId) return;
    if (isGlobal) {
      fetchGlobal();
    } else {
      fetchPrices();
    }
    setSearch('');
    setCurrentPage(1);
  }, [selectedSpId]);

  useEffect(() => {
    setSearch('');
    setCurrentPage(1);
  }, [activeBrandId]);

  useEffect(() => { setCurrentPage(1); }, [search]);

  async function fetchPrices() {
    setLoading(true);
    try {
      const r = await api.get(`/salespeople/${selectedSpId}/prices`);
      setPrices(r.data.data);
      setDirtyToggles({});
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Per-row price edit ────────────────────────────────────────────────────────
  function openPriceEdit(p) {
    setEditingPrice({
      productId:             p.productId,
      productName:           p.productName,
      brandName:             p.brandName,
      category:              p.category,
      currentPrice:          p.sellingPrice,
      currentEffective:      p.effectiveFrom,
      upcomingPrice:         p.upcomingSellingPrice,
      upcomingEffective:     p.upcomingEffectiveFrom,
      dairyCostPrice:        p.dairyCostPrice,
      dairySellingPrice:     p.dairySellingPrice,
      unitType:              p.unitType,
      unitSize:              p.unitSize,
      containerType:         p.containerType,
      unitsPerContainer:     p.unitsPerContainer,
    });
    setPriceForm({
      sellingPrice: p.sellingPrice != null ? String(p.sellingPrice) : '',
      effectiveFrom: getIndiaDate(),
    });
  }
  function closePriceEdit() {
    setEditingPrice(null);
    setSavingPrice(false);
  }
  async function handleSavePrice(e) {
    e.preventDefault();
    const price = parseFloat(priceForm.sellingPrice);
    if (!(price >= 0)) { notify('Enter a valid price', 'warning'); return; }
    setSavingPrice(true);
    try {
      await api.post(`/salespeople/${selectedSpId}/prices/bulk`, {
        effectiveFrom: priceForm.effectiveFrom,
        prices: [{ productId: editingPrice.productId, sellingPrice: price, effectiveFrom: priceForm.effectiveFrom }],
      });
      notify('Price updated', 'success');
      closePriceEdit();
      fetchPrices();
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to save price', 'error');
      setSavingPrice(false);
    }
  }

  async function fetchGlobal() {
    setLoading(true);
    try {
      const r = await api.get('/products/salesperson-global');
      setGlobalProducts(r.data.data);
      setDirtyGlobal({});
      setDirtyGlobalPrices({});
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to load global products', 'error');
    } finally {
      setLoading(false);
    }
  }

  const handleToggle = (productId, currentEnabled, isGloballyDisabled) => {
    if (isGloballyDisabled && !currentEnabled) {
      notify('This product is disabled globally. Enable it in Global Settings first.', 'warning');
      return;
    }
    const newValue = !currentEnabled;
    setDirtyToggles(prev => ({ ...prev, [productId]: newValue }));
    setPrices(prev => prev.map(p => p.productId === productId ? { ...p, isEnabled: newValue } : p));
  };

  async function handleCopyPrices() {
    if (!copyFromSpId) { notify('Select a salesman to copy from', 'warning'); return; }
    setCopyingPrices(true);
    try {
      await api.post(`/salespeople/${selectedSpId}/prices/copy-from/${copyFromSpId}?brandId=${activeBrandId}`);
      notify('Prices copied successfully', 'success');
      setShowCopyModal(false);
      setCopyFromSpId('');
      fetchPrices();
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to copy prices', 'error');
      setCopyingPrices(false);
    }
  }

  const handleGlobalToggle = (productId, currentEnabled) => {
    const newValue = !currentEnabled;
    setDirtyGlobal(prev => ({ ...prev, [productId]: newValue }));
    setGlobalProducts(prev => prev.map(p => p.productId === productId ? { ...p, salespersonEnabled: newValue } : p));
  };

  const handleGlobalPriceChange = (productId, value) => {
    const price = value === '' ? null : parseFloat(value);
    setDirtyGlobalPrices(prev => ({ ...prev, [productId]: price }));
    setGlobalProducts(prev => prev.map(p =>
      p.productId === productId ? { ...p, salespersonDefaultPrice: price } : p
    ));
  };

  const handleBulkSalesmenToggle = (spId) => {
    setBulkUpdateForm(prev => {
      const newSet = new Set(prev.selectedSalesmen);
      if (newSet.has(spId)) {
        newSet.delete(spId);
      } else {
        newSet.add(spId);
      }
      return { ...prev, selectedSalesmen: newSet };
    });
  };

  async function handleBulkUpdate() {
    if (bulkUpdateForm.selectedSalesmen.size === 0) {
      notify('Select at least one salesman', 'warning');
      return;
    }
    if (!bulkUpdateForm.productId) {
      notify('Select a product', 'warning');
      return;
    }
    const price = parseFloat(bulkUpdateForm.sellingPrice);
    if (!(price >= 0)) {
      notify('Enter a valid price', 'warning');
      return;
    }
    setUpdatingBulkPrices(true);
    try {
      await api.post('/salespeople/bulk-update', {
        salespersonIds: Array.from(bulkUpdateForm.selectedSalesmen),
        productId: parseInt(bulkUpdateForm.productId, 10),
        sellingPrice: price,
        effectiveFrom: bulkUpdateForm.effectiveFrom,
      });
      notify(`Price updated for ${bulkUpdateForm.selectedSalesmen.size} salesmen`, 'success');
      setShowBulkUpdateModal(false);
      setBulkUpdateForm({
        selectedSalesmen: new Set(),
        productId: '',
        sellingPrice: '',
        effectiveFrom: getIndiaDate(),
      });
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to update prices', 'error');
      setUpdatingBulkPrices(false);
    }
  }

  const handleSave = async () => {
    if (isGlobal) {
      const changedToggles = Object.keys(dirtyGlobal);
      const changedPrices = Object.keys(dirtyGlobalPrices);
      const allChanged = new Set([...changedToggles, ...changedPrices]);
      if (!allChanged.size) { notify('No changes to save', 'warning'); return; }
      setSaving(true);
      try {
        await api.patch('/products/salesperson-global', {
          products: Array.from(allChanged).map(id => {
            const productId = parseInt(id, 10);
            const obj = { productId };
            if (changedToggles.includes(id)) obj.isEnabled = dirtyGlobal[id];
            if (changedPrices.includes(id)) obj.defaultPrice = dirtyGlobalPrices[id];
            return obj;
          }),
        });
        notify('Global settings saved', 'success');
        fetchGlobal();
      } catch (e) {
        notify(e.response?.data?.error ?? 'Failed to save', 'error');
      } finally {
        setSaving(false);
      }
      return;
    }

    // Per-person mode now only bulk-saves enable/disable toggles.
    // Price edits go through the per-row pencil modal (handleSavePrice).
    const hasToggleChanges = Object.keys(dirtyToggles).length > 0;
    if (!hasToggleChanges) { notify('No changes to save', 'warning'); return; }

    setSaving(true);
    try {
      await api.post(`/salespeople/${selectedSpId}/products/bulk`, {
        products: Object.keys(dirtyToggles).map(id => ({
          productId: parseInt(id, 10),
          isEnabled: dirtyToggles[id],
        })),
      });
      notify('Saved successfully', 'success');
      fetchPrices();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Filter + category-aware pagination ────────────────────────────────────────
  const filteredGrouped = useMemo(() => {
    const source = isGlobal ? globalProducts : prices;
    const brandItems = source
      .filter(p => p.brandId === activeBrandId)
      .filter(p => isGlobal || !showEnabledOnly || p.isEnabled || dirtyToggles[p.productId] !== undefined);
    const q = search.trim().toLowerCase();
    const filtered = q
      ? brandItems.filter(p =>
          p.productName.toLowerCase().includes(q) ||
          (p.category ?? '').toLowerCase().includes(q)
        )
      : brandItems;

    const grouped = filtered.reduce((acc, p) => {
      const key = p.category || 'Uncategorised';
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    }, {});

    return Object.entries(grouped);
  }, [isGlobal, globalProducts, prices, activeBrandId, search, showEnabledOnly, dirtyToggles]);

  const totalFiltered = filteredGrouped.reduce((s, [, arr]) => s + arr.length, 0);

  const pages = useMemo(() => {
    const result = [];
    let page = [];
    let count = 0;
    filteredGrouped.forEach(([cat, items]) => {
      if (count + items.length > ITEMS_PER_PAGE && count > 0) {
        result.push(page); page = []; count = 0;
      }
      page.push([cat, items]);
      count += items.length;
    });
    if (page.length) result.push(page);
    return result;
  }, [filteredGrouped]);

  const totalPages  = Math.max(1, pages.length);
  const pageGroups  = pages[currentPage - 1] ?? [];
  const startIdx    = pages.slice(0, currentPage - 1).reduce((s, p) => s + p.reduce((a, [, it]) => a + it.length, 0), 0);
  const endIdx      = startIdx + pageGroups.reduce((s, [, it]) => s + it.length, 0);

  const handleToggleAllGlobal = (enable) => {
    const brandItems = globalProducts.filter(p => p.brandId === activeBrandId);
    const updates = {};
    brandItems.forEach(p => { updates[p.productId] = enable; });
    setDirtyGlobal(prev => ({ ...prev, ...updates }));
    setGlobalProducts(prev => prev.map(p =>
      p.brandId === activeBrandId ? { ...p, salespersonEnabled: enable } : p
    ));
  };

  const brandGlobalItems  = globalProducts.filter(p => p.brandId === activeBrandId);
  const allBrandEnabled   = brandGlobalItems.length > 0 && brandGlobalItems.every(p => p.salespersonEnabled);
  const allBrandDisabled  = brandGlobalItems.length > 0 && brandGlobalItems.every(p => !p.salespersonEnabled);

  const hasDirty = isGlobal
    ? Object.keys(dirtyGlobal).length > 0 || Object.keys(dirtyGlobalPrices).length > 0
    : Object.keys(dirtyToggles).length > 0;

  const selectedSp = salespeople.find(s => String(s.id) === String(selectedSpId));
  const fmt = v => v > 0 ? `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—';

  const colSpan = isGlobal ? 5 : 10;

  return (
    <div className="flex flex-col h-full">

      <LoadingOverlay open={saving} message="Saving…" />

      {/* Page header */}
      <div className="flex items-center gap-2.5 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <IndianRupee size={17} className="text-emerald-300 flex-shrink-0" />
        <div>
          <h1 className="text-sm font-bold text-white leading-tight">Products &amp; Prices</h1>
          <p className="text-emerald-300 text-xs">Enable products and set selling prices per salesperson</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 md:p-8 max-w-5xl mx-auto space-y-5">

          {/* Controls bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Salesperson</label>
              <select
                value={selectedSpId}
                onChange={e => { setSelectedSpId(e.target.value); setDirtyToggles({}); setDirtyGlobal({}); setDirtyGlobalPrices({}); }}
                className="w-full ddm-input"
              >
                <option value={GLOBAL_ID}>— Global Settings (All Salespeople) —</option>
                {salespeople.map(sp => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name}{sp.route ? ` — ${sp.route}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Global mode banner */}
          {isGlobal && (
            <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <Globe size={15} className="text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-800">
                Changes here apply to <span className="font-bold">all salespeople</span>. Disabled products won't appear for any salesperson regardless of their individual settings.
              </p>
            </div>
          )}

          {(selectedSp || isGlobal) && (
            <>
              {brands.length > 0 && (
                <BrandTabs
                  brands={brands}
                  activeBrandId={activeBrandId}
                  onChange={id => setActiveBrandId(id)}
                />
              )}

              {/* Search + Save */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by product name or category…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X size={14} />
                    </button>
                  )}
                </div>
                {!isGlobal && (
                  <>
                    <button
                      onClick={() => setShowEnabledOnly(v => {
                        localStorage.setItem('sp_showEnabledOnly', String(!v));
                        return !v;
                      })}
                      className={`text-xs font-semibold px-3 py-2 rounded-xl border transition whitespace-nowrap flex-shrink-0 ${
                        showEnabledOnly
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600'
                      }`}
                    >
                      {showEnabledOnly ? 'Enabled only' : 'Show all'}
                    </button>
                    <button
                      onClick={() => setShowCopyModal(true)}
                      className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 transition whitespace-nowrap"
                    >
                      <Copy size={12} /> Copy Prices
                    </button>
                  </>
                )}
                {isGlobal && (
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      onClick={() => handleToggleAllGlobal(true)}
                      disabled={allBrandEnabled}
                      className="text-xs font-semibold px-3 py-2 rounded-xl border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
                    >
                      Enable All
                    </button>
                    <button
                      onClick={() => handleToggleAllGlobal(false)}
                      disabled={allBrandDisabled}
                      className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
                    >
                      Disable All
                    </button>
                    <button
                      onClick={() => setShowBulkUpdateModal(true)}
                      className="text-xs font-semibold px-3 py-2 rounded-xl border border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100 transition whitespace-nowrap"
                    >
                      Bulk Update Prices
                    </button>
                  </div>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || !hasDirty}
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold px-4 py-2 rounded-xl transition text-sm shadow-sm whitespace-nowrap"
                >
                  {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>

              <Pagination
                currentPage={currentPage} totalPages={totalPages}
                startIndex={startIdx} endIndex={endIdx} total={totalFiltered}
                onPageChange={setCurrentPage}
              />

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-emerald-700 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Product</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-emerald-200 uppercase tracking-wider w-28">Dairy Cost</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-emerald-200 uppercase tracking-wider w-28">Dairy Selling</th>
                        {isGlobal && (
                          <th className="px-4 py-3 text-right text-xs font-bold text-emerald-200 uppercase tracking-wider w-32">Default Price</th>
                        )}
                        {!isGlobal && (
                          <>
                            <th className="px-6 py-3 text-right text-xs font-bold text-white uppercase tracking-wider w-32">Selling Price</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-32">Prices From</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-emerald-200 uppercase tracking-wider w-32">Effective Price</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-amber-200 uppercase tracking-wider w-28">Upcoming</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-amber-200 uppercase tracking-wider w-32">From</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-20">Edit</th>
                          </>
                        )}
                        <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-24">
                          {isGlobal ? 'Global' : 'Access'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {loading ? (
                        <tr><td colSpan={colSpan}><BrandedLoader size="sm" hideBrand inlinePadY="py-12" /></td></tr>
                      ) : pageGroups.length === 0 ? (
                        <tr>
                          <td colSpan={colSpan} className="py-12 text-center text-slate-400 text-sm">
                            {search ? 'No products match your search.' : 'No products for this brand'}
                          </td>
                        </tr>
                      ) : (
                        pageGroups.map(([category, items]) => (
                          <React.Fragment key={category}>
                            <tr className="bg-slate-100 border-l-4 border-emerald-500">
                              <td colSpan={colSpan} className="px-6 py-2 text-left text-xs font-bold text-slate-600 uppercase tracking-widest">
                                {category}
                              </td>
                            </tr>
                            {items.map(p => {
                              if (isGlobal) {
                                const isDirty = dirtyGlobal[p.productId] !== undefined || dirtyGlobalPrices[p.productId] !== undefined;
                                const priceValue = dirtyGlobalPrices[p.productId] !== undefined ? dirtyGlobalPrices[p.productId] : p.salespersonDefaultPrice;
                                return (
                                  <tr
                                    key={p.productId}
                                    className={`transition-colors ${
                                      !p.salespersonEnabled ? 'bg-slate-50/60 opacity-70' : isDirty ? 'bg-emerald-50/40' : 'hover:bg-slate-50'
                                    }`}
                                  >
                                    <td className="px-6 py-3.5 align-middle">
                                      <div className="flex items-center gap-2">
                                        <span className={`text-sm font-semibold ${p.salespersonEnabled ? 'text-slate-800' : 'text-slate-400'}`}>
                                          {p.productName}
                                        </span>
                                        {isDirty && <span className="text-[10px] text-amber-600 font-bold">unsaved</span>}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                                      <span className="text-xs text-slate-400">{fmt(p.dairyCostPrice)}</span>
                                    </td>
                                    <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                                      <span className="text-xs text-slate-400">{fmt(p.dairySellingPrice)}</span>
                                    </td>
                                    <td className="px-4 py-3.5 text-right align-middle">
                                      <div className="relative">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={priceValue ?? ''}
                                          onChange={e => handleGlobalPriceChange(p.productId, e.target.value)}
                                          placeholder="—"
                                          className="w-full pl-5 pr-2 py-2 text-xs text-right font-semibold tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                                        />
                                      </div>
                                    </td>
                                    <td className="px-6 py-3.5 text-center align-middle">
                                      <TogglePill
                                        enabled={p.salespersonEnabled}
                                        onChange={() => handleGlobalToggle(p.productId, p.salespersonEnabled)}
                                      />
                                    </td>
                                  </tr>
                                );
                              }

                              // Per-person row
                              const hasPrice      = p.sellingPrice !== null;
                              const isToggleDirty = dirtyToggles[p.productId] !== undefined;
                              return (
                                <tr
                                  key={p.productId}
                                  className={`transition-colors ${
                                    !p.isEnabled
                                      ? 'bg-slate-50/60 opacity-70'
                                      : isToggleDirty
                                      ? 'bg-emerald-50/40'
                                      : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <td className="px-6 py-3.5 align-middle">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`text-sm font-semibold ${p.isEnabled ? 'text-slate-800' : 'text-slate-400'}`}>
                                        {p.productName}
                                      </span>
                                      {!hasPrice && p.isEnabled && (
                                        <span className="badge-amber text-[10px]">No price</span>
                                      )}
                                      {!p.salespersonEnabled && (
                                        <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-semibold">Global off</span>
                                      )}
                                      {isToggleDirty && (
                                        <span className="text-[10px] text-amber-600 font-bold">unsaved</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                                    <span className="text-xs text-slate-400">{fmt(p.dairyCostPrice)}</span>
                                  </td>
                                  <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                                    <span className="text-xs text-slate-400">{fmt(p.dairySellingPrice)}</span>
                                  </td>
                                  <td className="px-6 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                                    {hasPrice
                                      ? <span className="text-sm font-semibold text-slate-800">₹{Number(p.sellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                                      : <span className="text-amber-600 font-semibold text-xs">Not set</span>
                                    }
                                  </td>
                                  <td className="px-4 py-3.5 text-center align-middle whitespace-nowrap">
                                    {p.effectiveFrom
                                      ? <span className="text-xs font-semibold text-amber-600 tabular-nums">{formatDateShort(p.effectiveFrom)}</span>
                                      : <span className="text-xs text-slate-300">—</span>}
                                  </td>
                                  <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                                    {p.sellingPrice != null ? (
                                      <span className="text-sm font-bold text-emerald-700">₹{Number(p.sellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                                    ) : (
                                      <span className="text-xs text-slate-400 font-semibold">from global</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                                    {p.upcomingSellingPrice != null
                                      ? <span className="text-sm font-semibold text-amber-700">₹{Number(p.upcomingSellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                                      : <span className="text-xs text-slate-300">—</span>}
                                  </td>
                                  <td className="px-4 py-3.5 text-center align-middle whitespace-nowrap">
                                    {p.upcomingEffectiveFrom
                                      ? <span className="text-xs font-semibold text-amber-700 tabular-nums">{formatDateShort(p.upcomingEffectiveFrom)}</span>
                                      : <span className="text-xs text-slate-300">—</span>}
                                  </td>
                                  <td className="px-4 py-3.5 text-center align-middle">
                                    <button
                                      onClick={() => openPriceEdit(p)}
                                      className="text-emerald-600 hover:text-emerald-800 transition-colors p-1.5 rounded-lg hover:bg-emerald-50"
                                      title="Edit price"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                  <td className="px-6 py-3.5 text-center align-middle">
                                    <div title={!p.salespersonEnabled ? 'This product is disabled globally' : ''}>
                                      <TogglePill
                                        enabled={p.isEnabled && p.salespersonEnabled}
                                        onChange={() => handleToggle(p.productId, p.isEnabled, !p.salespersonEnabled)}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Per-row price edit modal */}
      {editingPrice && (() => {
        const unitLabel = editingPrice.unitType === 'ml' && editingPrice.unitSize
          ? `${editingPrice.unitSize} ml`
          : editingPrice.unitType === 'gram' && editingPrice.unitSize
          ? `${editingPrice.unitSize} g`
          : editingPrice.unitType ?? '—';
        const containerLabel = editingPrice.containerType && editingPrice.unitsPerContainer
          ? `${editingPrice.unitsPerContainer} / ${editingPrice.containerType}`
          : null;
        return (
          <div className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={closePriceEdit}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              {/* Emerald header bar — matches the app's page-header chrome */}
              <div className="bg-emerald-700 px-5 py-4 flex items-center justify-between rounded-t-2xl">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white leading-tight">Edit Price</h3>
                  <p className="text-[11px] text-emerald-200 mt-0.5">Update salesperson selling price</p>
                </div>
                <button onClick={closePriceEdit} className="p-1.5 text-emerald-200 hover:text-white hover:bg-emerald-600 rounded-lg transition">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSavePrice} className="px-5 py-5 space-y-5">

                {/* Product details — read only */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900 leading-tight">{editingPrice.productName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {editingPrice.brandName && (
                        <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{editingPrice.brandName}</span>
                      )}
                      {editingPrice.category && (
                        <span className="text-[10px] font-semibold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{editingPrice.category}</span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                    <div>
                      <p className="text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Unit</p>
                      <p className="text-slate-700 font-semibold tabular-nums">{unitLabel}</p>
                    </div>
                    {containerLabel && (
                      <div>
                        <p className="text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Pack</p>
                        <p className="text-slate-700 font-semibold tabular-nums">{containerLabel}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Dairy Cost</p>
                      <p className="text-slate-700 font-semibold tabular-nums">{fmt(editingPrice.dairyCostPrice)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Dairy Selling</p>
                      <p className="text-slate-700 font-semibold tabular-nums">{fmt(editingPrice.dairySellingPrice)}</p>
                    </div>
                    {editingPrice.currentPrice != null && (
                      <div className="col-span-2 pt-2 border-t border-slate-200">
                        <p className="text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Current Price</p>
                        <div className="flex items-baseline justify-between">
                          <p className="text-sm text-emerald-700 font-bold tabular-nums">{fmt(editingPrice.currentPrice)}</p>
                          {editingPrice.currentEffective && (
                            <p className="text-[10px] text-slate-500 tabular-nums">since {formatDateShort(editingPrice.currentEffective)}</p>
                          )}
                        </div>
                      </div>
                    )}
                    {editingPrice.upcomingPrice != null && (
                      <div className="col-span-2 pt-2 border-t border-amber-200 bg-amber-50/40 -mx-4 -mb-4 px-4 py-2 rounded-b-xl">
                        <p className="text-amber-600 uppercase tracking-wider font-semibold mb-0.5">Upcoming · saving will replace this</p>
                        <div className="flex items-baseline justify-between">
                          <p className="text-sm text-amber-700 font-bold tabular-nums">{fmt(editingPrice.upcomingPrice)}</p>
                          {editingPrice.upcomingEffective && (
                            <p className="text-[10px] text-amber-700/80 tabular-nums">from {formatDateShort(editingPrice.upcomingEffective)}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Editable: Selling Price */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    New Selling Price (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                    <input
                      autoFocus
                      type="number" step="0.0001" min="0"
                      value={priceForm.sellingPrice}
                      onChange={e => setPriceForm(f => ({ ...f, sellingPrice: e.target.value }))}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2.5 text-sm text-right font-semibold tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                {/* Editable: Effective From — today or any future date.
                    Past dates are blocked via min so admin can't accidentally
                    back-date a change that would either be invisible or
                    re-bill old transactions. */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Prices From
                  </label>
                  <input
                    type="date"
                    value={priceForm.effectiveFrom}
                    onChange={e => setPriceForm(f => ({ ...f, effectiveFrom: e.target.value }))}
                    min={getIndiaDate()}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Pick today to make it the current price, or a future date to schedule the change.
                  </p>
                </div>

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={closePriceEdit} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition">
                    Cancel
                  </button>
                  <button type="submit" disabled={savingPrice} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 text-white rounded-xl transition flex items-center justify-center gap-2 shadow-sm">
                    {savingPrice ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                    {savingPrice ? 'Saving…' : 'Save Price'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Copy Prices Modal */}
      {showCopyModal && (
        <div className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCopyModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="bg-emerald-700 px-5 py-4 flex items-center justify-between rounded-t-2xl">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-white leading-tight">Copy Prices</h3>
                <p className="text-[11px] text-emerald-200 mt-0.5">Copy prices from another salesman for this brand</p>
              </div>
              <button onClick={() => setShowCopyModal(false)} className="p-1.5 text-emerald-200 hover:text-white hover:bg-emerald-600 rounded-lg transition">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Copy from</label>
                <select
                  value={copyFromSpId}
                  onChange={e => setCopyFromSpId(e.target.value)}
                  className="w-full ddm-input"
                >
                  <option value="">— Select a salesman —</option>
                  {salespeople
                    .filter(sp => String(sp.id) !== String(selectedSpId))
                    .map(sp => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name}{sp.route ? ` — ${sp.route}` : ''}
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  All prices for {brands.find(b => b.id === activeBrandId)?.name || 'this brand'} will be copied.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowCopyModal(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCopyPrices}
                  disabled={copyingPrices || !copyFromSpId}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 text-white rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
                >
                  {copyingPrices ? <Loader2 className="animate-spin" size={14} /> : <Copy size={14} />}
                  {copyingPrices ? 'Copying…' : 'Copy Prices'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Update Prices Modal */}
      {showBulkUpdateModal && (
        <div className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowBulkUpdateModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-purple-700 px-5 py-4 flex items-center justify-between rounded-t-2xl sticky top-0 z-10">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-white leading-tight">Bulk Update Prices</h3>
                <p className="text-[11px] text-purple-200 mt-0.5">Apply the same price to multiple salespeople</p>
              </div>
              <button onClick={() => setShowBulkUpdateModal(false)} className="p-1.5 text-purple-200 hover:text-white hover:bg-purple-600 rounded-lg transition">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-5 space-y-5">
              {/* Product Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Product</label>
                <select
                  value={bulkUpdateForm.productId}
                  onChange={e => setBulkUpdateForm(f => ({ ...f, productId: e.target.value }))}
                  className="w-full ddm-input"
                >
                  <option value="">— Select a product —</option>
                  {globalProducts
                    .filter(p => p.brandId === activeBrandId && p.salespersonEnabled)
                    .map(p => (
                      <option key={p.productId} value={p.productId}>
                        {p.productName} {p.category ? `(${p.category})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              {/* Price Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  New Selling Price (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={bulkUpdateForm.sellingPrice}
                    onChange={e => setBulkUpdateForm(f => ({ ...f, sellingPrice: e.target.value }))}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2.5 text-sm text-right font-semibold tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Effective From */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Prices From
                </label>
                <input
                  type="date"
                  value={bulkUpdateForm.effectiveFrom}
                  onChange={e => setBulkUpdateForm(f => ({ ...f, effectiveFrom: e.target.value }))}
                  min={getIndiaDate()}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Pick today to make it the current price, or a future date to schedule the change.
                </p>
              </div>

              {/* Salesmen Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Apply to Salespeople ({bulkUpdateForm.selectedSalesmen.size} selected)
                </label>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                  {salespeople.length === 0 ? (
                    <p className="text-xs text-slate-400">No salespeople found</p>
                  ) : (
                    salespeople.map(sp => (
                      <label key={sp.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={bulkUpdateForm.selectedSalesmen.has(sp.id)}
                          onChange={() => handleBulkSalesmenToggle(sp.id)}
                          className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
                        />
                        <span className="text-sm text-slate-700">
                          {sp.name}{sp.route ? ` — ${sp.route}` : ''}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBulkUpdateModal(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkUpdate}
                  disabled={updatingBulkPrices || bulkUpdateForm.selectedSalesmen.size === 0}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-purple-700 hover:bg-purple-800 disabled:bg-purple-300 text-white rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
                >
                  {updatingBulkPrices ? <Loader2 className="animate-spin" size={14} /> : <IndianRupee size={14} />}
                  {updatingBulkPrices ? 'Updating…' : `Update Prices (${bulkUpdateForm.selectedSalesmen.size})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
