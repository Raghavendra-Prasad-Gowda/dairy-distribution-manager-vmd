import { useState, useEffect } from 'react';
import { Save, Loader2, Info } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import { useNotification } from '../../context/NotificationContext';
import api from '../../api/axios';

export default function DairyPriceSetup() {
  const { notify } = useNotification();
  const [brands, setBrands]       = useState([]);
  const [activeBrandId, setActive] = useState(null);
  const [products, setProducts]   = useState([]);
  const [edits, setEdits]         = useState({});
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(null);

  useEffect(() => {
    api.get('/brands')
      .then(r => { const b = r.data.data; setBrands(b); if (b.length) setActive(b[0].id); })
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
    } catch {
      notify('Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async (product) => {
    if (edits[product.id] === undefined) return;
    setSaving(product.id);
    try {
      await api.put(`/products/${product.id}`, {
        name:       product.name,
        dairyPrice: parseFloat(edits[product.id]) || 0,
      });
      notify('Price updated', 'success');
      fetchProducts();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Update failed', 'error');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="p-5 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dairy Price Setup</h1>
        <p className="text-slate-500 text-sm mt-1">Set dairy purchase prices per product per brand</p>
      </div>

      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-xs">
        <Info size={13} className="flex-shrink-0 mt-0.5" />
        <span>
          <strong>Rate Master:</strong> Prices set here are used automatically when recording stock receipts.
          Changes apply to future receipts only.
        </span>
      </div>

      {brands.length > 0 && (
        <BrandTabs
          brands={brands}
          activeBrandId={activeBrandId}
          onChange={id => { setActive(id); setEdits({}); }}
        />
      )}

      <div className="ddm-card overflow-hidden">
        <div className="flex items-center px-5 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</div>
          <div className="w-40 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Dairy Price (₹)</div>
          <div className="w-16 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Save</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            No products yet. Add them in Dairy → Product Setup.
          </div>
        ) : (
          products.map(p => {
            const isDirty = edits[p.id] !== undefined;
            return (
              <div
                key={p.id}
                className={`flex items-center px-5 py-3.5 border-b border-slate-100 last:border-0 transition-colors ${
                  !p.isActive ? 'opacity-40' : isDirty ? 'bg-indigo-50/40' : 'hover:bg-slate-50/60'
                }`}
              >
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                  {!p.isActive && <p className="text-xs text-slate-400">Inactive</p>}
                </div>

                <div className="w-40 flex justify-end">
                  <div className="relative w-28">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={!p.isActive}
                      value={edits[p.id] ?? p.dairyPrice}
                      onChange={e => setEdits(prev => ({ ...prev, [p.id]: e.target.value }))}
                      className="w-full pl-6 pr-2 py-2 border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white disabled:bg-slate-50 disabled:cursor-not-allowed tabular-nums"
                    />
                  </div>
                </div>

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
