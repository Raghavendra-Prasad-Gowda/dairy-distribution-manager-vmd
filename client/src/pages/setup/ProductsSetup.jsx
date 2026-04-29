import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, Search, Loader2, X, Package } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import Pagination from '../../components/Pagination';
import ConfirmationModal from '../../components/ConfirmationModal';
import { useNotification } from '../../context/NotificationContext';
import api from '../../api/axios';

const ITEMS_PER_PAGE = 10;
const UNIT_SIZES = [8, 10, 12, 20, 25, 30, 50, 75, 100, 140, 160, 180, 200, 225, 250, 400, 450, 500, 1000, 2000, 5000, 15000];
const EMPTY_FORM = { name: '', categoryId: '', unitType: 'ml', unitSize: '500', containerType: '', unitsPerContainer: '', costPrice: '', sellingPrice: '' };

export default function ProductsSetup() {
  const { notify } = useNotification();
  const [brands, setBrands]         = useState([]);
  const [activeBrandId, setActive]  = useState(null);
  const [products, setProducts]     = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch]         = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [confirmation, setConfirmation] = useState({ isOpen: false });

  useEffect(() => {
    api.get('/brands')
      .then(r => { const b = r.data.data; setBrands(b); if (b.length) setActive(b[0].id); })
      .catch(() => notify('Failed to load brands', 'error'));
  }, []);

  useEffect(() => {
    if (!activeBrandId) return;
    fetchAll();
    setSearch('');
    setCurrentPage(1);
  }, [activeBrandId]);

  useEffect(() => { setCurrentPage(1); }, [search]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [prodRes, catRes] = await Promise.all([
        api.get(`/products?brandId=${activeBrandId}`),
        api.get(`/categories?brandId=${activeBrandId}`),
      ]);
      setProducts(prodRes.data.data);
      setCategories(catRes.data.data);
    } catch {
      notify('Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
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

    return Object.entries(grouped);
  }, [products, search]);

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

  // ── Modal ─────────────────────────────────────────────────────────────────────
  const openAdd = () => { setEditingProduct(null); setForm(EMPTY_FORM); setIsModalOpen(true); };

  const openEdit = (p) => {
    const cat = categories.find(c => c.name === p.category);
    setEditingProduct(p);
    setForm({ name: p.name, categoryId: cat?.id ?? '', unitType: p.unitType ?? 'piece', unitSize: p.unitSize ?? '', containerType: p.containerType ?? '', unitsPerContainer: p.unitsPerContainer ?? '', costPrice: Number(p.costPrice), sellingPrice: Number(p.sellingPrice) });
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingProduct(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
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
    };
    try {
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload);
        notify('Product updated', 'success');
      } else {
        await api.post('/products', { brandId: activeBrandId, ...payload });
        notify('Product added', 'success');
      }
      closeModal();
      fetchAll();
    } catch (err) {
      notify(err.response?.data?.error ?? 'Save failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = (p) => {
    setConfirmation({
      isOpen: true,
      title: 'Delete Product',
      message: `Delete "${p.name}"? It will be removed from daily operations but historical data is kept.`,
      action: () => archiveProduct(p),
      isDanger: true,
    });
  };

  const archiveProduct = async (p) => {
    setSubmitting(true);
    try {
      await api.put(`/products/${p.id}`, { isActive: false });
      notify('Product deleted', 'success');
      fetchAll();
    } catch {
      notify('Failed to delete', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleShowInReceipt = async (p) => {
    try {
      await api.put(`/products/${p.id}`, { showInStockReceipt: !p.showInStockReceipt });
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, showInStockReceipt: !x.showInStockReceipt } : x));
    } catch {
      notify('Failed to update', 'error');
    }
  };

  const activeBrand = brands.find(b => b.id === activeBrandId);

  return (
    <div className="flex flex-col h-full">

      {submitting && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-slate-700 font-semibold text-sm">Processing…</p>
          </div>
        </div>
      )}

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
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
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
                <th className="px-6 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Cost Price</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Sell Price</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">Show in Receipt</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <Loader2 className="w-6 h-6 text-emerald-600 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : pageGroups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-14 text-center text-slate-400 text-sm">
                    {search ? 'No products match your search.' : `No products yet for ${activeBrand?.name}. Click Add Product.`}
                  </td>
                </tr>
              ) : (
                pageGroups.map(([category, items]) => (
                  <React.Fragment key={category}>
                    <tr className="cat-row bg-slate-100 border-l-4 border-emerald-500">
                      <td colSpan={8} className="px-6 py-2 text-xs font-bold text-slate-600 uppercase tracking-widest">
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
                        <td className="px-6 py-4 text-sm font-semibold text-slate-800 text-right tabular-nums">
                          ₹{Number(p.costPrice).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-800 text-right tabular-nums">
                          ₹{Number(p.sellingPrice).toFixed(2)}
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
                            <button onClick={() => confirmDelete(p)} className="text-red-500 hover:text-red-700 transition-colors" title="Delete">
                              <Trash2 className="w-4 h-4" />
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
      {isModalOpen && (
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
                      {UNIT_SIZES.map(s => <option key={s} value={s}>{s} {form.unitType}</option>)}
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
                          type="number" step="0.01" min="0"
                          value={form[key]}
                          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                          placeholder="0.00"
                          className="w-full pl-7 pr-2 py-2 border border-slate-200 rounded-lg text-sm font-bold text-right tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-3 px-5 pb-5 pt-1">
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
        confirmText="Delete"
      />
    </div>
    </div>
    </div>
  );
}
