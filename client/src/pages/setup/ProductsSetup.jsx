import { useState, useEffect } from 'react';
import { Plus, Save, Loader2, ToggleLeft, ToggleRight, Info } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import { useNotification } from '../../context/NotificationContext';
import api from '../../api/axios';

export default function ProductsSetup() {
  const { notify } = useNotification();
  const [brands, setBrands]        = useState([]);
  const [activeBrandId, setActive] = useState(null);
  const [products, setProducts]    = useState([]);
  const [edits, setEdits]          = useState({});
  const [loading, setLoading]      = useState(false);
  const [saving, setSaving]        = useState(null);
  const [showAdd, setShowAdd]      = useState(false);
  const [newProduct, setNewProd]   = useState({ name: '', category: '', mlPerCrate: '', dairyPrice: '' });

  useEffect(() => {
    api.get('/brands')
      .then((r) => { const b = r.data.data; setBrands(b); if (b.length) setActive(b[0].id); })
      .catch(() => notify('Failed to load brands', 'error'));
  }, []);

  useEffect(() => {
    if (!activeBrandId) return;
    fetchProducts();
  }, [activeBrandId]);

  async function fetchProducts() {
    setLoading(true);
    try {
      const r = await api.get(`/products?brandId=${activeBrandId}&all=true`);
      setProducts(r.data.data);
      setEdits({});
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }

  const handleEdit = (id, field, value) => {
    setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [field]: value } }));
  };

  const handleSave = async (product) => {
    setSaving(product.id);
    try {
      const payload = edits[product.id] ?? {};
      const mlRaw = payload.mlPerCrate ?? product.mlPerCrate;
      await api.put(`/products/${product.id}`, {
        name:       payload.name       ?? product.name,
        category:   payload.category   !== undefined ? (payload.category || null) : (product.category || null),
        mlPerCrate: mlRaw ? parseInt(mlRaw, 10) : null,
        dairyPrice: Number(payload.dairyPrice ?? product.dairyPrice),
      });
      notify('Product updated', 'success');
      fetchProducts();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Update failed', 'error');
    } finally {
      setSaving(null);
    }
  };

  const toggleActive = async (product) => {
    try {
      await api.put(`/products/${product.id}`, { isActive: !product.isActive });
      notify(`Product ${product.isActive ? 'deactivated' : 'activated'}`, 'success');
      fetchProducts();
    } catch {
      notify('Failed to update status', 'error');
    }
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    try {
      await api.post('/products', {
        brandId:    activeBrandId,
        name:       newProduct.name,
        category:   newProduct.category || null,
        mlPerCrate: newProduct.mlPerCrate ? parseInt(newProduct.mlPerCrate, 10) : null,
        dairyPrice: parseFloat(newProduct.dairyPrice) || 0,
      });
      notify('Product added', 'success');
      setNewProd({ name: '', category: '', mlPerCrate: '', dairyPrice: '' });
      setShowAdd(false);
      fetchProducts();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to add product', 'error');
    }
  };

  const activeBrand = brands.find((b) => b.id === activeBrandId);

  // Group products by category for display
  const grouped = products.reduce((acc, p) => {
    const key = p.category || 'Uncategorised';
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  return (
    <div className="p-5 md:p-8 max-w-4xl mx-auto space-y-6">

      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Product Setup</h1>
          <p className="text-slate-400 text-sm mt-0.5">Manage products per dairy brand</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="ddm-btn-primary flex-shrink-0">
          <Plus size={15} /> Add Product
        </button>
      </div>

      {/* ── Notice ─────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-xs">
        <Info size={13} className="flex-shrink-0 mt-0.5" />
        <span>
          Use <strong>Dairy → Price Setup</strong> to configure dairy purchase prices.
          Set <strong>Category</strong> to group products in Stock Receipt.
          Set <strong>ml/Crate</strong> to enable litre → crate auto-conversion (e.g. 12000 for 12×1L crate).
        </span>
      </div>

      {brands.length > 0 && (
        <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={(id) => { setActive(id); setEdits({}); }} />
      )}

      {/* ── Add product form ───────────────────────────────────────── */}
      {showAdd && (
        <form onSubmit={handleAddProduct} className="ddm-card p-5 space-y-4">
          <p className="text-sm font-bold text-slate-700">New Product — {activeBrand?.name}</p>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Product Name <span className="text-red-400">*</span>
              </label>
              <input
                value={newProduct.name}
                onChange={(e) => setNewProd((p) => ({ ...p, name: e.target.value }))}
                required
                placeholder="e.g. Homogenised Milk"
                className="ddm-input"
              />
            </div>
            <div className="flex-1 min-w-[130px]">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Category
              </label>
              <input
                value={newProduct.category}
                onChange={(e) => setNewProd((p) => ({ ...p, category: e.target.value }))}
                placeholder="e.g. Curd, Milk"
                className="ddm-input"
              />
            </div>
            <div className="w-32">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                ml / Crate
              </label>
              <input
                type="number"
                min="1"
                value={newProduct.mlPerCrate}
                onChange={(e) => setNewProd((p) => ({ ...p, mlPerCrate: e.target.value }))}
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
                  value={newProduct.dairyPrice}
                  onChange={(e) => setNewProd((p) => ({ ...p, dairyPrice: e.target.value }))}
                  placeholder="0.00"
                  className="w-28 pl-7 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white tabular-nums"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="ddm-btn-primary">
              <Plus size={14} /> Add
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="ddm-btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── Products table ─────────────────────────────────────────── */}
      <div className="ddm-card overflow-hidden">
        {/* Table header */}
        <div className="grid px-5 py-3 bg-white border-b border-slate-200"
             style={{ gridTemplateColumns: '1fr 110px 90px 60px 56px' }}>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</div>
          <div className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">ml/Crate</div>
          <div className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Active</div>
          <div className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Save</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            No products yet. Add your first product above.
          </div>
        ) : (
          Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              {/* Category row */}
              <div className="px-5 py-1.5 bg-slate-50 border-b border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{category}</span>
              </div>
              {items.map((p) => {
                const isDirty = edits[p.id] !== undefined;
                return (
                  <div
                    key={p.id}
                    className={`grid items-center px-5 py-3 border-b border-slate-100 last:border-0 transition-colors ${
                      !p.isActive ? 'opacity-40' : isDirty ? 'bg-emerald-50/40' : 'hover:bg-slate-50/60'
                    }`}
                    style={{ gridTemplateColumns: '1fr 110px 90px 60px 56px' }}
                  >
                    {/* Name */}
                    <div className="pr-3">
                      <input
                        value={edits[p.id]?.name ?? p.name}
                        onChange={(e) => handleEdit(p.id, 'name', e.target.value)}
                        disabled={!p.isActive}
                        className="w-full text-sm font-semibold text-slate-800 bg-transparent border-b border-transparent focus:border-emerald-400 focus:outline-none py-0.5 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* Category */}
                    <div className="pr-3">
                      <input
                        value={edits[p.id]?.category ?? p.category ?? ''}
                        onChange={(e) => handleEdit(p.id, 'category', e.target.value)}
                        disabled={!p.isActive}
                        placeholder="—"
                        className="w-full text-sm text-slate-600 bg-transparent border-b border-transparent focus:border-emerald-400 focus:outline-none py-0.5 disabled:cursor-not-allowed placeholder:text-slate-300"
                      />
                    </div>

                    {/* ml/Crate */}
                    <div className="flex justify-center">
                      <input
                        type="number"
                        min="1"
                        value={edits[p.id]?.mlPerCrate ?? p.mlPerCrate ?? ''}
                        onChange={(e) => handleEdit(p.id, 'mlPerCrate', e.target.value)}
                        disabled={!p.isActive}
                        placeholder="—"
                        className="w-20 text-center text-sm text-slate-600 bg-transparent border-b border-transparent focus:border-emerald-400 focus:outline-none py-0.5 disabled:cursor-not-allowed placeholder:text-slate-300 tabular-nums"
                      />
                    </div>

                    {/* Toggle */}
                    <div className="flex justify-center">
                      <button onClick={() => toggleActive(p)} className="text-slate-400 hover:text-emerald-600 transition">
                        {p.isActive
                          ? <ToggleRight size={22} className="text-emerald-600" />
                          : <ToggleLeft size={22} />}
                      </button>
                    </div>

                    {/* Save */}
                    <div className="flex justify-end">
                      {isDirty && (
                        <button
                          onClick={() => handleSave(p)}
                          disabled={saving === p.id}
                          className="flex items-center gap-1 text-xs bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 rounded-lg transition font-semibold"
                        >
                          {saving === p.id ? <Loader2 className="animate-spin" size={12} /> : <Save size={12} />}
                          Save
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
