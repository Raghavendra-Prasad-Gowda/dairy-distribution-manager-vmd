import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Archive, Search, X, Package } from 'lucide-react';
import { getIndiaDate } from '../../utils/dateUtils';
import BrandTabs from '../../components/BrandTabs';
import Pagination from '../../components/Pagination';
import ConfirmationModal from '../../components/ConfirmationModal';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import BrandedLoader from '../../components/ui/BrandedLoader';
import { useNotification } from '../../context/NotificationContext';
import { useApiResources } from '../../hooks/useApiResources';
import { useMutation } from '../../hooks/useMutation';
import { useDisclosure } from '../../hooks/useDisclosure';
import api from '../../api/axios';

const ITEMS_PER_PAGE = 10;

function fmtPriceDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return { date, time };
}
// One list for ml and gram. 425, 440, 475, 950 and 10000 came from Godrej Jersey's 04 Nov 2026 price revision
// (475 ml milk, 425 g / 440 g / 950 g curd pouches, 10 kg bucket).
const UNIT_SIZES = [8, 10, 12, 20, 25, 30, 50, 75, 100, 140, 160, 180, 200, 210, 225, 250, 400, 425, 440, 450, 475, 490, 500, 950, 1000, 2000, 5000, 10000, 15000];
// An existing product may carry a size that is not in the list; keep it selectable so editing never blanks it.
function sizeOptions(current) {
  const n = parseInt(current, 10);
  return Number.isInteger(n) && n > 0 && !UNIT_SIZES.includes(n) ? [...UNIT_SIZES, n].sort((a, b) => a - b) : UNIT_SIZES;
}
const EMPTY_FORM = { name: '', categoryId: '', unitType: 'ml', unitSize: '500', containerType: '', unitsPerContainer: '', costPrice: '', sellingPrice: '', effectiveFrom: getIndiaDate() };

export default function ProductsSetup() {
  const { notify } = useNotification();
  const [brands, setBrands]         = useState([]);
  const [activeBrandId, setActive]  = useState(null);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [search, setSearch]         = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const modal = useDisclosure();
  const [editingProduct, setEditingProduct] = useState(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [confirmation, setConfirmation] = useState({ isOpen: false });

  useEffect(() => {
    api.get('/brands')
      .then(r => { const b = r.data.data; setBrands(b); if (b.length) setActive(b[0].id); })
      .catch(() => notify('Failed to load brands', 'error'))
      .finally(() => setBrandsLoading(false));
  }, [notify]);

  const { data, loading, refetch: fetchAll, setData } = useApiResources(
    activeBrandId ? [`/products?brandId=${activeBrandId}`, `/categories?brandId=${activeBrandId}`] : null,
    { initialData: [[], []] }
  );
  const [products, categories] = data;
  // Drop-in replacement for the old `setProducts` useState setter — updates
  // just the products slot, leaving categories untouched. Used by
  // toggleShowInReceipt's optimistic update (no full refetch needed there).
  const setProducts = (updater) => {
    setData(([prods, cats]) => [typeof updater === 'function' ? updater(prods) : updater, cats]);
  };

  // Reset search + pagination when the active brand changes, and pagination
  // alone when the search term changes. Adjusted during render (rather than
  // in an Effect) since this is just state derived from other state —
  // see https://react.dev/learn/you-might-not-need-an-effect
  const [prevActiveBrandId, setPrevActiveBrandId] = useState(activeBrandId);
  const [prevSearch, setPrevSearch] = useState(search);
  if (activeBrandId && activeBrandId !== prevActiveBrandId) {
    setPrevActiveBrandId(activeBrandId);
    setPrevSearch('');
    setSearch('');
    setCurrentPage(1);
  } else if (search !== prevSearch) {
    setPrevSearch(search);
    setCurrentPage(1);
  }

  // ── Filter + category-aware pagination ────────────────────────────────────────
  const filteredGrouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? products.filter(p => p.name.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q))
      : products;

    const grouped = filtered.reduce((acc, p) => {
      const key = p.category || 'Uncategorised';
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    }, {});

    // Sort category groups by the dairy layout display order, then alphabetically.
    const catOrderMap = new Map(categories.map(c => [c.name, c.displayOrder]));
    return Object.entries(grouped).sort(([a], [b]) => {
      const oa = catOrderMap.get(a) ?? 9999;
      const ob = catOrderMap.get(b) ?? 9999;
      return oa !== ob ? oa - ob : a.localeCompare(b);
    });
  }, [products, categories, search]);

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

  const totalPages   = Math.max(1, pages.length);
  const pageGroups   = pages[currentPage - 1] ?? [];
  const startIdx     = pages.slice(0, currentPage - 1).reduce((s, p) => s + p.reduce((a, [, it]) => a + it.length, 0), 0);
  const endIdx       = startIdx + pageGroups.reduce((s, [, it]) => s + it.length, 0);

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const { mutate: saveProduct, loading: savingProduct } = useMutation(
    ({ isEdit, id, payload }) =>
      isEdit ? api.put(`/products/${id}`, payload) : api.post('/products', { brandId: activeBrandId, ...payload }),
    {
      onSuccess: (_res, { isEdit }) => {
        notify(isEdit ? 'Product updated' : 'Product added', 'success');
        closeModal();
        fetchAll();
      },
    }
  );

  const { mutate: archiveProduct, loading: archiving } = useMutation(
    (p) => api.put(`/products/${p.id}`, { isActive: false }),
    { successMessage: 'Product archived', onSuccess: fetchAll }
  );

  const { mutate: toggleShowInReceipt } = useMutation(
    (p) => api.put(`/products/${p.id}`, { showInStockReceipt: !p.showInStockReceipt }),
    {
      onSuccess: (_res, p) => {
        setProducts(prev => prev.map(x => x.id === p.id ? { ...x, showInStockReceipt: !x.showInStockReceipt } : x));
      },
    }
  );

  const submitting = savingProduct || archiving;
  const busyMsg    = savingProduct
    ? (editingProduct ? 'Updating product…' : 'Adding product…')
    : archiving ? 'Archiving product…' : '';

  // ── Modal ─────────────────────────────────────────────────────────────────────
  const openAdd = () => { setEditingProduct(null); setForm(EMPTY_FORM); modal.open(); };

  const openEdit = (p) => {
    const cat = categories.find(c => c.name === p.category);
    setEditingProduct(p);
    // Effective date defaults to today — past dates are blocked by min, and
    // pre-filling with the existing (possibly-old) effective date would just
    // bounce off the picker's min constraint.
    setForm({ name: p.name, categoryId: cat?.id ?? '', unitType: p.unitType ?? 'piece', unitSize: p.unitSize ?? '', containerType: p.containerType ?? '', unitsPerContainer: p.unitsPerContainer ?? '', costPrice: Number(p.costPrice), sellingPrice: Number(p.sellingPrice), effectiveFrom: getIndiaDate() });
    modal.open();
  };

  const closeModal = () => { modal.close(); setEditingProduct(null); };

  const handleSubmit = (e) => {
    e.preventDefault();
    const categoryName = categories.find(c => c.id === Number(form.categoryId))?.name ?? null;
    const payload = {
      name:              form.name.trim(),
      category:          categoryName,
      unitType:          form.unitType || 'piece',
      unitSize:          form.unitType !== 'piece' && form.unitSize ? parseInt(form.unitSize, 10) : null,
      containerType:     form.containerType || null,
      unitsPerContainer: form.containerType && form.unitsPerContainer ? parseInt(form.unitsPerContainer, 10) : null,
      costPrice:         parseFloat(form.costPrice) || 0,
      sellingPrice:      parseFloat(form.sellingPrice) || 0,
      ...(form.effectiveFrom ? { effectiveFrom: form.effectiveFrom, sellingPriceEffectiveFrom: form.effectiveFrom } : {}),
    };
    saveProduct({ isEdit: !!editingProduct, id: editingProduct?.id, payload });
  };

  const confirmArchive = (p) => {
    setConfirmation({
      isOpen: true,
      title: 'Archive Product',
      message: `Archive "${p.name}"? It will be permanently hidden from daily operations. Historical data is preserved for reports.`,
      action: () => archiveProduct(p),
      isDanger: true,
    });
  };

  const activeBrand = brands.find(b => b.id === activeBrandId);

  return (
    <div className="flex flex-col h-full">

      <LoadingOverlay open={submitting} message={busyMsg} />

      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Package size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Product Setup</h1>
            <p className="text-emerald-300 text-xs">Manage products per dairy brand</p>
          </div>
        </div>
        <button onClick={openAdd} className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition flex-shrink-0">
          <Plus size={14} /> Add Product
        </button>
      </div>

    <div className="flex-1 overflow-y-auto">
    <div className="p-5 md:p-8 max-w-5xl mx-auto space-y-5">

      {brands.length > 0 && (
        <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={id => setActive(id)} />
      )}

      {/* Search */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or category…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <Pagination
        currentPage={currentPage} totalPages={totalPages}
        startIndex={startIdx} endIndex={endIdx} total={totalFiltered}
        onPageChange={setCurrentPage}
      />

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-emerald-700 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Product</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Unit</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Container</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-white uppercase tracking-wider min-w-[9rem]">Cost Price</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider min-w-[7rem]">Cost From</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-amber-200 uppercase tracking-wider min-w-[8rem]">Upcoming Cost</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-amber-200 uppercase tracking-wider min-w-[7rem]">Cost From</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-white uppercase tracking-wider min-w-[9rem]">Sell Price</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-amber-200 uppercase tracking-wider min-w-[8rem]">Upcoming Sell</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-amber-200 uppercase tracking-wider min-w-[7rem]">Sell From</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Show in Receipt</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {(brandsLoading || loading) ? (
                <tr><td colSpan={13}><BrandedLoader size="sm" hideBrand inlinePadY="py-12" /></td></tr>
              ) : pageGroups.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-6 py-14 text-center text-slate-400 text-sm">
                    {search ? 'No products match your search.' : `No products yet for ${activeBrand?.name}. Click Add Product.`}
                  </td>
                </tr>
              ) : (
                pageGroups.map(([category, items]) => (
                  <React.Fragment key={category}>
                    <tr className="cat-row bg-slate-100 border-l-4 border-emerald-500">
                      <td colSpan={13} className="px-6 py-2 text-xs font-bold text-slate-600 uppercase tracking-widest">
                        {category}
                      </td>
                    </tr>
                    {items.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-semibold text-slate-800">{p.name}</td>
                        <td className="px-6 py-4 text-sm text-slate-500 text-center">{p.category || '—'}</td>
                        <td className="px-6 py-4 text-sm text-slate-500 text-center">
                          {p.unitType === 'ml' ? `${p.unitSize ?? '?'} ml` : p.unitType === 'gram' ? `${p.unitSize ?? '?'} g` : 'piece'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500 text-center">
                          {p.containerType && p.unitsPerContainer
                            ? <span className="inline-flex items-center gap-1"><span className="font-semibold text-slate-700">{p.unitsPerContainer}</span><span className="text-slate-400">/ {p.containerType}</span></span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums">
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-sm font-semibold text-slate-800">₹{Number(p.costPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                            {(() => { const f = fmtPriceDate(p.costPrices?.[0]?.createdAt); return f
                              ? <div className="inline-flex flex-col items-center px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
                                  <span className="text-amber-700 text-[10px] font-bold leading-tight whitespace-nowrap">{f.date}</span>
                                  <span className="text-amber-500 text-[9px] leading-tight whitespace-nowrap">{f.time}</span>
                                </div>
                              : null; })()}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-center tabular-nums">
                          {p.costPrices?.[0]?.effectiveFrom
                            ? <span className="text-amber-700 font-semibold">{new Date(p.costPrices[0].effectiveFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-4 text-right tabular-nums">
                          {p.upcomingCostPrice != null
                            ? <span className="text-sm font-semibold text-amber-700">₹{Number(p.upcomingCostPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-4 text-xs text-center tabular-nums">
                          {p.upcomingCostPriceFrom
                            ? <span className="text-amber-700 font-semibold">{new Date(p.upcomingCostPriceFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums">
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-sm font-semibold text-slate-800">₹{Number(p.sellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                            {(() => { const f = fmtPriceDate(p.sellingPrices?.[0]?.createdAt); return f
                              ? <div className="inline-flex flex-col items-center px-2.5 py-1.5 rounded-lg bg-violet-50 border border-violet-200">
                                  <span className="text-violet-700 text-[10px] font-bold leading-tight whitespace-nowrap">{f.date}</span>
                                  <span className="text-violet-400 text-[9px] leading-tight whitespace-nowrap">{f.time}</span>
                                </div>
                              : null; })()}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right tabular-nums">
                          {p.upcomingSellingPrice != null
                            ? <span className="text-sm font-semibold text-amber-700">₹{Number(p.upcomingSellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-4 text-xs text-center tabular-nums">
                          {p.upcomingSellingPriceFrom
                            ? <span className="text-amber-700 font-semibold">{new Date(p.upcomingSellingPriceFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => toggleShowInReceipt(p)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${p.showInStockReceipt ? 'bg-emerald-500' : 'bg-slate-300'}`}
                            title={p.showInStockReceipt ? 'Hide from Stock Receipt' : 'Show in Stock Receipt'}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${p.showInStockReceipt ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-3">
                            <button onClick={() => openEdit(p)} className="text-emerald-600 hover:text-emerald-800 transition-colors" title="Edit">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => confirmArchive(p)} className="text-amber-500 hover:text-amber-700 transition-colors" title="Archive">
                              <Archive className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {modal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[92vh]" style={{ animation: 'popIn 0.2s ease' }}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 bg-emerald-800 rounded-t-2xl flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-700 flex items-center justify-center">
                  <Package size={15} className="text-emerald-300" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-tight">
                    {editingProduct ? 'Edit Product' : 'Add New Product'}
                  </p>
                  <p className="text-emerald-300 text-[11px]">
                    {editingProduct ? 'Update product details' : 'Fill in the details below'}
                  </p>
                </div>
              </div>
              <button onClick={closeModal} className="p-1.5 text-emerald-300 hover:text-white hover:bg-emerald-700 rounded-lg transition">
                <X size={15} />
              </button>
            </div>

            {/* Scrollable form body */}
            <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
              <div className="px-5 py-4 space-y-4">

                {/* Product name */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    Product Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    autoFocus required
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Homogenised Milk"
                    className="ddm-input"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Category</label>
                  <select
                    value={form.categoryId}
                    onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                    className="ddm-input bg-white"
                  >
                    <option value="">— No category —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {categories.length === 0 && (
                    <p className="text-[11px] text-slate-400 mt-1">Add categories in <strong>Dairy → Categories</strong> first.</p>
                  )}
                </div>

                {/* Divider: Unit & Container */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest whitespace-nowrap">Unit & Container</span>
                  <div className="flex-1 h-px bg-emerald-100" />
                </div>

                {/* Unit type — pill buttons */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Unit Type</label>
                  <div className="flex gap-2">
                    {['ml', 'gram', 'piece'].map(u => (
                      <button
                        key={u} type="button"
                        onClick={() => setForm(f => ({ ...f, unitType: u, unitSize: u !== 'piece' ? (f.unitSize || '500') : '' }))}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
                          form.unitType === u
                            ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300 hover:text-emerald-700'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Size per unit */}
                {form.unitType !== 'piece' && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                      Size per unit ({form.unitType})
                    </label>
                    <select
                      value={form.unitSize}
                      onChange={e => setForm(f => ({ ...f, unitSize: e.target.value }))}
                      className="ddm-input bg-white"
                    >
                      <option value="">— Select size —</option>
                      {sizeOptions(form.unitSize).map(s => <option key={s} value={s}>{s} {form.unitType}</option>)}
                    </select>
                  </div>
                )}

                {/* Container type — pill buttons */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Container</label>
                  <div className="flex gap-2">
                    {[{ val: '', label: 'None' }, { val: 'crate', label: 'Crate' }, { val: 'box', label: 'Box' }].map(({ val, label }) => (
                      <button
                        key={val} type="button"
                        onClick={() => setForm(f => ({ ...f, containerType: val, unitsPerContainer: val ? f.unitsPerContainer : '' }))}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
                          form.containerType === val
                            ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300 hover:text-emerald-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Units per container */}
                {form.containerType && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                      Units per {form.containerType === 'crate' ? 'Crate' : 'Box'}
                    </label>
                    <input
                      type="number" min="1"
                      value={form.unitsPerContainer}
                      onChange={e => setForm(f => ({ ...f, unitsPerContainer: e.target.value }))}
                      placeholder="e.g. 12"
                      className="ddm-input"
                    />
                  </div>
                )}

                {/* Divider: Pricing */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest whitespace-nowrap">Pricing</span>
                  <div className="flex-1 h-px bg-emerald-100" />
                </div>

                {/* Cost + Selling price */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'costPrice',    label: 'Cost Price',    hint: 'What you pay' },
                    { key: 'sellingPrice', label: 'Selling Price', hint: 'What you charge' },
                  ].map(({ key, label, hint }) => (
                    <div key={key} className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
                      <p className="text-[10px] text-slate-400 mb-2">{hint}</p>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">₹</span>
                        <input
                          type="number" step="0.0001" min="0"
                          value={form[key]}
                          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                          placeholder="0.00"
                          className="w-full pl-7 pr-2 py-2 border border-slate-200 rounded-lg text-sm font-bold text-right tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Price effective date (applies to both cost and selling price) */}
                <div className="bg-amber-50 rounded-xl border border-amber-200 p-3">
                  <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mb-0.5">Price Change Effective From</p>
                  <p className="text-[10px] text-amber-600 mb-2">Applies to both cost and selling price · today or future</p>
                  <input
                    type="date"
                    value={form.effectiveFrom}
                    onChange={e => setForm(f => ({ ...f, effectiveFrom: e.target.value }))}
                    min={getIndiaDate()}
                    className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  {form.effectiveFrom && form.effectiveFrom > getIndiaDate() && (
                    <p className="text-[10px] text-amber-700 font-semibold mt-1.5">
                      Scheduled — kicks in on {new Date(form.effectiveFrom + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. Stock receipts before then keep the current price.
                    </p>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-3 px-5 pb-5 pt-4">
                <button
                  type="button" onClick={closeModal}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl transition"
                >
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="ddm-btn-primary flex-1 justify-center">
                  {editingProduct ? 'Save Changes' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmation.isOpen}
        onClose={() => setConfirmation({ ...confirmation, isOpen: false })}
        onConfirm={confirmation.action}
        title={confirmation.title}
        message={confirmation.message}
        isDanger={confirmation.isDanger}
        confirmText="Archive"
      />
    </div>
    </div>
    </div>
  );
}
