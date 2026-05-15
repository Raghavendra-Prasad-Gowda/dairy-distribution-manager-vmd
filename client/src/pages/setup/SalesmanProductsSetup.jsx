import { useState, useEffect } from 'react';
import { Save, Loader2, ToggleLeft, ToggleRight, Tag } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import { useNotification } from '../../context/NotificationContext';
import api from '../../api/axios';

export default function SalesmanProductsSetup() {
  const { notify } = useNotification();
  const [salespeople, setSalespeople] = useState([]);
  const [selectedSpId, setSelectedSpId] = useState('');
  const [brands, setBrands] = useState([]);
  const [activeBrandId, setActiveBrandId] = useState(null);
  const [spProducts, setSpProducts] = useState([]);
  const [dirtyProducts, setDirtyProducts] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/salespeople?all=true'), api.get('/brands')])
      .then(([spRes, brandRes]) => {
        setSalespeople(spRes.data.data.filter(s => s.isActive));
        const b = brandRes.data.data;
        setBrands(b);
        if (b.length) setActiveBrandId(b[0].id);
      })
      .catch(() => notify('Failed to load data', 'error'));
  }, []);

  useEffect(() => {
    if (!selectedSpId) return;
    fetchProducts();
  }, [selectedSpId]);

  async function fetchProducts() {
    setLoading(true);
    try {
      const r = await api.get(`/salespeople/${selectedSpId}/products`);
      setSpProducts(r.data.data);
      setDirtyProducts({});
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }

  const handleToggle = (productId, currentEnabled) => {
    const newValue = !currentEnabled;
    setDirtyProducts(prev => ({ ...prev, [productId]: newValue }));
    setSpProducts(prev => prev.map(p => p.productId === productId ? { ...p, isEnabled: newValue } : p));
  };

  const handleSave = async () => {
    const changed = Object.keys(dirtyProducts);
    if (!changed.length) { notify('No changes to save', 'warning'); return; }
    setSaving(true);
    try {
      const products = changed.map(id => ({ productId: parseInt(id, 10), isEnabled: dirtyProducts[id] }));
      await api.post(`/salespeople/${selectedSpId}/products/bulk`, { products });
      notify('Product access updated', 'success');
      setDirtyProducts({});
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = spProducts.filter(p => p.brandId === activeBrandId);
  const hasDirty = Object.keys(dirtyProducts).length > 0;
  const selectedSp = salespeople.find(s => String(s.id) === String(selectedSpId));

  return (
    <div className="flex flex-col h-full">

      {saving && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-slate-700 font-semibold text-sm">Saving product access…</p>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <Tag size={17} className="text-emerald-300 flex-shrink-0" />
        <div>
          <h1 className="text-sm font-bold text-white leading-tight">Salesman Layout</h1>
          <p className="text-emerald-300 text-xs">Enable or disable which products each salesperson sees in their stock entry</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 md:p-8 max-w-4xl mx-auto space-y-5">

          {/* Controls bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Salesperson</label>
              <select
                value={selectedSpId}
                onChange={e => { setSelectedSpId(e.target.value); setDirtyProducts({}); }}
                className="w-full ddm-input"
              >
                <option value="">Select salesperson…</option>
                {salespeople.map(sp => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name}{sp.route ? ` — ${sp.route}` : ''}
                  </option>
                ))}
              </select>
            </div>
            {selectedSp && (
              <button
                onClick={handleSave}
                disabled={saving || !hasDirty}
                className="ddm-btn-primary disabled:opacity-50"
              >
                {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                Save Access
              </button>
            )}
          </div>

          {selectedSp && (
            <>
              {brands.length > 0 && (
                <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={id => setActiveBrandId(id)} />
              )}

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-emerald-700 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Product</th>
                        <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-36">Access</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {loading ? (
                        <tr>
                          <td colSpan={2} className="py-16 text-center">
                            <Loader2 className="w-5 h-5 text-emerald-600 animate-spin mx-auto" />
                          </td>
                        </tr>
                      ) : filteredProducts.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="py-12 text-center text-slate-400 text-sm">No products for this brand</td>
                        </tr>
                      ) : (
                        filteredProducts.map(p => {
                          const isDirty = dirtyProducts[p.productId] !== undefined;
                          return (
                            <tr
                              key={p.productId}
                              className={`transition-colors cursor-pointer ${
                                p.isEnabled
                                  ? isDirty ? 'bg-emerald-50/60' : 'hover:bg-slate-50/60'
                                  : isDirty ? 'bg-slate-50/60' : 'hover:bg-slate-50/40'
                              }`}
                              onClick={() => handleToggle(p.productId, p.isEnabled)}
                            >
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm font-semibold ${p.isEnabled ? 'text-slate-800' : 'text-slate-400'}`}>
                                    {p.productName}
                                  </span>
                                  {p.category && (
                                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{p.category}</span>
                                  )}
                                  {isDirty && (
                                    <span className="text-[10px] text-amber-600 font-bold">unsaved</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); handleToggle(p.productId, p.isEnabled); }}
                                  className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition ${
                                    p.isEnabled
                                      ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
                                      : 'bg-white border-slate-200 text-slate-400 hover:border-emerald-300 hover:text-emerald-600'
                                  }`}
                                >
                                  {p.isEnabled ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                                  {p.isEnabled ? 'Enabled' : 'Disabled'}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {!selectedSp && salespeople.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 flex items-center justify-center h-40 text-slate-400 text-sm">
              Select a salesperson above to manage their product access
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
