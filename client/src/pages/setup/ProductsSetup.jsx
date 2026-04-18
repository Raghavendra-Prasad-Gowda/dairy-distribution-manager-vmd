import { useState, useEffect, useMemo } from 'react';
import { Plus, Loader2, ToggleLeft, ToggleRight, Pencil, X, Search } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import { useNotification } from '../../context/NotificationContext';
import api from '../../api/axios';

const EMPTY_FORM = { name: '', categoryId: '', mlPerCrate: '', dairyPrice: '' };

export default function ProductsSetup() {
  const { notify } = useNotification();
  const [brands, setBrands]         = useState([]);
  const [activeBrandId, setActive]  = useState(null);
  const [products, setProducts]     = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [toggling, setToggling]     = useState(null);
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState('');
  // modal: null | { mode: 'add' } | { mode: 'edit', product }
  const [modal, setModal]   = useState(null);
  const [form, setForm]     = useState(EMPTY_FORM);

  useEffect(() => {
    api.get('/brands')
      .then(r => { const b = r.data.data; setBrands(b); if (b.length) setActive(b[0].id); })
      .catch(() => notify('Failed to load brands', 'error'));
  }, []);

  useEffect(() => {
    if (!activeBrandId) return;
    fetchProducts();
    fetchCategories();
    setSearch('');
  }, [activeBrandId]);

  async function fetchProducts() {
    setLoading(true);
    try {
      const r = await api.get(`/products?brandId=${activeBrandId}&all=true`);
      setProducts(r.data.data);
    } catch {
      notify('Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchCategories() {
    try {
      const r = await api.get(`/categories?brandId=${activeBrandId}`);
      setCategories(r.data.data);
    } catch {}
  }

  // ── Filtered + grouped ────────────────────────────────────────────────────────
  const filteredGrouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? products.filter(p =>
          p.name.toLowerCase().includes(q) ||
          (p.category ?? '').toLowerCase().includes(q)
        )
      : products;
    return filtered.reduce((acc, p) => {
      const key = p.category || 'Uncategorised';
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    }, {});
  }, [products, search]);

  // ── Modal helpers ─────────────────────────────────────────────────────────────
  function openAddModal() {
    setForm(EMPTY_FORM);
    setModal({ mode: 'add' });
  }

  function openEditModal(product) {
    const cat = categories.find(c => c.name === product.category);
    setForm({
      name:       product.name,
      categoryId: cat?.id ?? '',
      mlPerCrate: product.mlPerCrate ?? '',
      dairyPrice: product.dairyPrice,
    });
    setModal({ mode: 'edit', product });
  }

  function closeModal() { setModal(null); }

  const handleFormChange = (field, value) =>
    setForm(prev => ({ ...prev, [field]: value }));

  // ── Submit modal form ─────────────────────────────────────────────────────────
  const handleModalSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const categoryName = categories.find(c => c.id === Number(form.categoryId))?.name ?? null;
    const payload = {
      name:       form.name.trim(),
      category:   categoryName,
      mlPerCrate: form.mlPerCrate ? parseInt(form.mlPerCrate, 10) : null,
      dairyPrice: parseFloat(form.dairyPrice) || 0,
    };
    try {
      if (modal.mode === 'add') {
        await api.post('/products', { brandId: activeBrandId, ...payload });
        notify('Product added', 'success');
      } else {
        await api.put(`/products/${modal.product.id}`, payload);
        notify('Product updated', 'success');
      }
      closeModal();
      fetchProducts();
    } catch (err) {
      notify(err.response?.data?.error ?? 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle active ─────────────────────────────────────────────────────────────
  const toggleActive = async (product) => {
    setToggling(product.id);
    try {
      await api.put(`/products/${product.id}`, { isActive: !product.isActive });
      notify(`Product ${product.isActive ? 'deactivated' : 'activated'}`, 'success');
      fetchProducts();
    } catch {
      notify('Failed to update status', 'error');
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="p-5 md:p-8 max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Product Setup</h1>
          <p className="text-slate-400 text-sm mt-0.5">Manage products per dairy brand</p>
        </div>
        <button onClick={openAddModal} className="ddm-btn-primary flex-shrink-0">
          <Plus size={15} /> Add Product
        </button>
      </div>

      {brands.length > 0 && (
        <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={id => { setActive(id); }} />
      )}

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by product name or category…"
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-300"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="ddm-card overflow-hidden">
        {/* Column headers */}
        <div className="grid items-center px-5 py-3 bg-slate-50 border-b border-slate-200"
             style={{ gridTemplateColumns: '1fr 80px 52px 44px' }}>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product</div>
          <div className="text-center text-xs font-bold text-slate-500 uppercase tracking-wider">ml/Crate</div>
          <div className="text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Active</div>
          <div className="text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Edit</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            No products yet. Click <strong>Add Product</strong> to get started.
          </div>
        ) : Object.keys(filteredGrouped).length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">No products match your search.</div>
        ) : (
          Object.entries(filteredGrouped).map(([category, items]) => (
            <div key={category}>
              {/* Category header */}
              <div className="px-5 py-2 bg-slate-50 border-b border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{category}</span>
              </div>

              {items.map(p => (
                <div
                  key={p.id}
                  className={`grid items-center px-5 py-3.5 border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors ${!p.isActive ? 'opacity-50' : ''}`}
                  style={{ gridTemplateColumns: '1fr 80px 52px 44px' }}
                >
                  {/* Product name + category */}
                  <div className="pr-3 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                    {p.category && (
                      <p className="text-xs text-slate-400 truncate">{p.category}</p>
                    )}
                  </div>

                  {/* ml/Crate */}
                  <div className="text-center">
                    <span className="text-sm tabular-nums text-slate-600">
                      {p.mlPerCrate ?? <span className="text-slate-300">—</span>}
                    </span>
                  </div>

                  {/* Active toggle */}
                  <div className="flex justify-center">
                    {toggling === p.id ? (
                      <Loader2 size={18} className="animate-spin text-slate-400" />
                    ) : (
                      <button onClick={() => toggleActive(p)}>
                        {p.isActive
                          ? <ToggleRight size={22} className="text-emerald-600" />
                          : <ToggleLeft size={22} className="text-slate-400" />}
                      </button>
                    )}
                  </div>

                  {/* Edit */}
                  <div className="flex justify-end">
                    <button
                      onClick={() => openEditModal(p)}
                      className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                    >
                      <Pencil size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* ── Add / Edit Modal ─────────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" style={{ animation: 'fadeIn 0.15s ease' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" style={{ animation: 'popIn 0.2s ease' }}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">
                {modal.mode === 'add' ? 'Add Product' : 'Edit Product'}
              </h2>
              <button onClick={closeModal} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>

            {/* Modal form */}
            <form onSubmit={handleModalSubmit} className="px-6 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Product Name <span className="text-red-400">*</span>
                </label>
                <input
                  autoFocus
                  required
                  value={form.name}
                  onChange={e => handleFormChange('name', e.target.value)}
                  placeholder="e.g. Homogenised Milk"
                  className="ddm-input"
                />
              </div>

              {/* Category dropdown */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Category
                </label>
                <select
                  value={form.categoryId}
                  onChange={e => handleFormChange('categoryId', e.target.value)}
                  className="ddm-input bg-white"
                >
                  <option value="">— No category —</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {categories.length === 0 && (
                  <p className="text-xs text-slate-400 mt-1">
                    Add categories in <strong>Dairy → Categories</strong> first.
                  </p>
                )}
              </div>

              {/* ml/Crate + Dairy Price row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    ml / Crate
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.mlPerCrate}
                    onChange={e => handleFormChange('mlPerCrate', e.target.value)}
                    placeholder="e.g. 12000"
                    className="ddm-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Dairy Price (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                    <input
                      type="number" step="0.01" min="0"
                      value={form.dairyPrice}
                      onChange={e => handleFormChange('dairyPrice', e.target.value)}
                      placeholder="0.00"
                      className="ddm-input pl-7 text-right tabular-nums"
                    />
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal} className="ddm-btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="ddm-btn-primary flex-1">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {modal.mode === 'add' ? 'Add Product' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
