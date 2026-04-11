import { useState, useEffect } from 'react';
import { Plus, Save, Loader2, CheckCircle, XCircle, Pencil, ToggleLeft, ToggleRight } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import api from '../../api/axios';

export default function ProductsSetup() {
  const [brands, setBrands]         = useState([]);
  const [activeBrandId, setActive]  = useState(null);
  const [products, setProducts]     = useState([]);
  const [edits, setEdits]           = useState({});   // { [productId]: { name, dairyPrice } }
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(null); // productId being saved
  const [notification, setNotif]    = useState(null);
  const [showAdd, setShowAdd]       = useState(false);
  const [newProduct, setNewProd]    = useState({ name: '', dairyPrice: '' });

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

  const notify = (message, type = 'success') => {
    setNotif({ message, type });
    setTimeout(() => setNotif(null), 4000);
  };

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
      notify('Product updated');
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
      notify(`Product ${product.isActive ? 'deactivated' : 'activated'}`);
      fetchProducts();
    } catch {
      notify('Failed to update', 'error');
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
      notify('Product added');
      setNewProd({ name: '', dairyPrice: '' });
      setShowAdd(false);
      fetchProducts();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to add product', 'error');
    }
  };

  const activeBrand = brands.find((b) => b.id === activeBrandId);

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
      {notification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`} style={{ animation: 'popIn 0.25s ease' }}>
          {notification.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {notification.message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Products & Pricing</h1><p className="text-gray-500 text-sm">Manage products and dairy purchase prices</p></div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition">
          <Plus size={15} /> Add Product
        </button>
      </div>

      {brands.length > 0 && <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={setActive} />}

      {/* Add product form */}
      {showAdd && (
        <form onSubmit={handleAddProduct} className="ddm-card p-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Product Name</label>
            <input value={newProduct.name} onChange={(e) => setNewProd((p) => ({ ...p, name: e.target.value }))} required placeholder={`e.g. HM`}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dairy Price (₹)</label>
            <input type="number" step="0.01" min="0" value={newProduct.dairyPrice} onChange={(e) => setNewProd((p) => ({ ...p, dairyPrice: e.target.value }))} placeholder="0.00"
              className="w-28 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
          </div>
          <button type="submit" className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm">
            <Plus size={14} /> Add to {activeBrand?.name}
          </button>
          <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
        </form>
      )}

      <div className="ddm-card overflow-hidden">
        <div className="hidden sm:grid sm:grid-cols-12 sm:gap-2 bg-gray-50 border-b border-gray-100 px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">
          <div className="col-span-5">Product Name</div>
          <div className="col-span-3 text-right">Dairy Price (₹)</div>
          <div className="col-span-2 text-center">Status</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        <div className="sm:hidden bg-gray-50 border-b border-gray-100 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Products
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-teal-600 animate-spin" /></div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No products yet. Add your first product.</div>
        ) : (
          products.map((p) => {
            const isDirty = edits[p.id] !== undefined;
            return (
              <div key={p.id} className={`border-b border-gray-50 ${!p.isActive ? 'opacity-50' : 'hover:bg-gray-50'} transition`}>
                {/* ── Mobile layout ──────────────────────────────── */}
                <div className="sm:hidden px-4 py-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <input
                      value={edits[p.id]?.name ?? p.name}
                      onChange={(e) => handleEdit(p.id, 'name', e.target.value)}
                      disabled={!p.isActive}
                      className="flex-1 font-medium text-gray-800 text-sm bg-transparent border-b border-transparent focus:border-teal-400 focus:outline-none px-0 py-0.5 disabled:cursor-not-allowed"
                    />
                    <button onClick={() => toggleActive(p)} className="text-gray-400 hover:text-teal-600 transition flex-shrink-0">
                      {p.isActive ? <ToggleRight size={22} className="text-teal-600" /> : <ToggleLeft size={22} />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                      <input
                        type="number" step="0.01" min="0" disabled={!p.isActive}
                        value={edits[p.id]?.dairyPrice ?? p.dairyPrice}
                        onChange={(e) => handleEdit(p.id, 'dairyPrice', e.target.value)}
                        className="w-full pl-6 pr-2 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white disabled:bg-gray-50 disabled:cursor-not-allowed"
                      />
                    </div>
                    {isDirty && (
                      <button onClick={() => handleSave(p)} disabled={saving === p.id} className="flex items-center gap-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-lg transition font-medium">
                        {saving === p.id ? <Loader2 className="animate-spin" size={12} /> : <Save size={12} />} Save
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Desktop layout ─────────────────────────────── */}
                <div className="hidden sm:grid sm:grid-cols-12 sm:gap-2 sm:items-center px-4 py-3">
                  <div className="col-span-5">
                    <input
                      value={edits[p.id]?.name ?? p.name}
                      onChange={(e) => handleEdit(p.id, 'name', e.target.value)}
                      disabled={!p.isActive}
                      className="w-full font-medium text-gray-800 text-sm bg-transparent border-b border-transparent focus:border-teal-400 focus:outline-none px-0 py-0.5 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div className="col-span-3 flex justify-end">
                    <div className="relative w-24">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                      <input
                        type="number" step="0.01" min="0" disabled={!p.isActive}
                        value={edits[p.id]?.dairyPrice ?? p.dairyPrice}
                        onChange={(e) => handleEdit(p.id, 'dairyPrice', e.target.value)}
                        className="w-full pl-6 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white disabled:bg-gray-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <button onClick={() => toggleActive(p)} className="text-gray-400 hover:text-teal-600 transition">
                      {p.isActive ? <ToggleRight size={22} className="text-teal-600" /> : <ToggleLeft size={22} />}
                    </button>
                  </div>
                  <div className="col-span-2 flex justify-end">
                    {isDirty && (
                      <button onClick={() => handleSave(p)} disabled={saving === p.id} className="flex items-center gap-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg transition font-medium">
                        {saving === p.id ? <Loader2 className="animate-spin" size={12} /> : <Save size={12} />} Save
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
