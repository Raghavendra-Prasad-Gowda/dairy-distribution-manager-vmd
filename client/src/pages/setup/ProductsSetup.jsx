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
  const [edits, setEdits]          = useState({});   // { [productId]: { name, dairyPrice } }
  const [loading, setLoading]      = useState(false);
  const [saving, setSaving]        = useState(null); // productId being saved
  const [showAdd, setShowAdd]      = useState(false);
  const [newProduct, setNewProd]   = useState({ name: '', dairyPrice: '' });

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
      await api.put(`/products/${product.id}`, {
        name:       payload.name       ?? product.name,
        dairyPrice: parseFloat(payload.dairyPrice ?? product.dairyPrice) || 0,
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
        dairyPrice: parseFloat(newProduct.dairyPrice) || 0,
      });
      notify('Product added', 'success');
      setNewProd({ name: '', dairyPrice: '' });
      setShowAdd(false);
      fetchProducts();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to add product', 'error');
    }
  };

  const activeBrand = brands.find((b) => b.id === activeBrandId);

  return (
    <div className="p-5 md:p-8 max-w-4xl mx-auto space-y-6">

      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Products &amp; Pricing</h1>
          <p className="text-slate-500 text-sm mt-1">Manage products and dairy purchase prices</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="ddm-btn-primary flex-shrink-0"
        >
          <Plus size={15} /> Add Product
        </button>
      </div>

      {/* ── Rate master notice ─────────────────────────────────────── */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-xs">
        <Info size={13} className="flex-shrink-0 mt-0.5" />
        <span>
          <strong>Rate Master:</strong> Dairy purchase prices configured here are used automatically
          when recording stock receipts. Prices cannot be overridden on any other page.
        </span>
      </div>

      {brands.length > 0 && (
        <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={(id) => { setActive(id); setEdits({}); }} />
      )}

      {/* ── Add product form ───────────────────────────────────────── */}
      {showAdd && (
        <form onSubmit={handleAddProduct} className="ddm-card p-5 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Product Name
            </label>
            <input
              value={newProduct.name}
              onChange={(e) => setNewProd((p) => ({ ...p, name: e.target.value }))}
              required
              placeholder="e.g. Homogenised Milk"
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
                type="number"
                step="0.01"
                min="0"
                value={newProduct.dairyPrice}
                onChange={(e) => setNewProd((p) => ({ ...p, dairyPrice: e.target.value }))}
                placeholder="0.00"
                className="w-28 pl-7 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white tabular-nums"
              />
            </div>
          </div>
          <button type="submit" className="ddm-btn-primary">
            <Plus size={14} /> Add to {activeBrand?.name}
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(false)}
            className="ddm-btn-secondary"
          >
            Cancel
          </button>
        </form>
      )}

      {/* ── Products table ─────────────────────────────────────────── */}
      <div className="ddm-card overflow-hidden">
        {/* Table header */}
        <div className="flex items-center px-5 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Name</div>
          <div className="w-32 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Dairy Price</div>
          <div className="w-16 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Active</div>
          <div className="w-16 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Save</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            No products yet. Add your first product above.
          </div>
        ) : (
          products.map((p) => {
            const isDirty = edits[p.id] !== undefined;
            return (
              <div
                key={p.id}
                className={`flex items-center px-5 py-3.5 border-b border-slate-100 transition-colors last:border-0 ${
                  !p.isActive ? 'opacity-40' : isDirty ? 'bg-indigo-50/40' : 'hover:bg-slate-50/60'
                }`}
              >
                {/* Product name — editable */}
                <div className="flex-1 min-w-0 pr-4">
                  <input
                    value={edits[p.id]?.name ?? p.name}
                    onChange={(e) => handleEdit(p.id, 'name', e.target.value)}
                    disabled={!p.isActive}
                    className="w-full text-sm font-semibold text-slate-800 bg-transparent border-b border-transparent focus:border-indigo-400 focus:outline-none py-0.5 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Dairy price — editable (master rate) */}
                <div className="w-32 flex justify-end">
                  <div className="relative w-24">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={!p.isActive}
                      value={edits[p.id]?.dairyPrice ?? p.dairyPrice}
                      onChange={(e) => handleEdit(p.id, 'dairyPrice', e.target.value)}
                      className="w-full pl-6 pr-2 py-2 border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white disabled:bg-slate-50 disabled:cursor-not-allowed tabular-nums"
                    />
                  </div>
                </div>

                {/* Status toggle */}
                <div className="w-16 flex justify-center">
                  <button
                    onClick={() => toggleActive(p)}
                    className="text-slate-400 hover:text-indigo-600 transition"
                    title={p.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {p.isActive
                      ? <ToggleRight size={22} className="text-indigo-600" />
                      : <ToggleLeft size={22} />
                    }
                  </button>
                </div>

                {/* Save button — shows only when dirty */}
                <div className="w-16 flex justify-end">
                  {isDirty && (
                    <button
                      onClick={() => handleSave(p)}
                      disabled={saving === p.id}
                      className="flex items-center gap-1 text-xs bg-indigo-700 hover:bg-indigo-800 text-white px-3 py-1.5 rounded-lg transition font-semibold"
                    >
                      {saving === p.id ? <Loader2 className="animate-spin" size={12} /> : <Save size={12} />}
                      Save
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
