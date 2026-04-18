import { useState, useEffect, useMemo } from 'react';
import { Save, Loader2, Info, Search, X } from 'lucide-react';
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
  const [search, setSearch]       = useState('');

  useEffect(() => {
    api.get('/brands')
      .then(r => { const b = r.data.data; setBrands(b); if (b.length) setActive(b[0].id); })
      .catch(() => notify('Failed to load brands', 'error'));
  }, []);

  useEffect(() => {
    if (!activeBrandId) return;
    fetchProducts();
    setSearch('');
    setEdits({});
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

  // Group by category, apply search filter
  const filteredGrouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? products.filter(p =>
          p.name.toLowerCase().includes(q) ||
          (p.category ?? '').toLowerCase().includes(q)
        )
      : products;

    const grouped = filtered.reduce((acc, p) => {
      const key = p.category || 'Uncategorised';
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    }, {});

    return grouped;
  }, [products, search]);

  return (
    <div className="p-5 md:p-8 max-w-3xl mx-auto space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Dairy Price Setup</h1>
        <p className="text-slate-400 text-sm mt-0.5">Set dairy purchase prices per product per brand</p>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-xs">
        <Info size={13} className="flex-shrink-0 mt-0.5" />
        <span>
          <strong>Rate Master:</strong> Prices set here are used automatically when recording stock receipts.
          Changes apply to future receipts only.
        </span>
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
          placeholder="Search products or categories…"
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
             style={{ gridTemplateColumns: '1fr 140px 64px' }}>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product</div>
          <div className="text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Dairy Price (₹)</div>
          <div className="text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Save</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            No products yet. Add them in Dairy → Product Setup.
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

              {items.map(p => {
                const isDirty = edits[p.id] !== undefined;
                return (
                  <div
                    key={p.id}
                    className={`grid items-center px-5 py-3.5 border-b border-slate-100 last:border-0 transition-colors ${
                      !p.isActive ? 'opacity-40' : isDirty ? 'bg-emerald-50/40' : 'hover:bg-slate-50/60'
                    }`}
                    style={{ gridTemplateColumns: '1fr 140px 64px' }}
                  >
                    {/* Product */}
                    <div className="min-w-0 pr-4">
                      <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                      {!p.isActive && <p className="text-xs text-slate-400">Inactive</p>}
                    </div>

                    {/* Price input */}
                    <div className="flex justify-end">
                      <div className="relative w-32">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                        <input
                          type="number" step="0.01" min="0"
                          disabled={!p.isActive}
                          value={edits[p.id] ?? Number(p.dairyPrice).toFixed(2)}
                          onChange={e => setEdits(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-full pl-6 pr-2 py-2 border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white disabled:bg-slate-50 disabled:cursor-not-allowed tabular-nums"
                        />
                      </div>
                    </div>

                    {/* Save */}
                    <div className="flex justify-end">
                      {isDirty ? (
                        <button
                          onClick={() => handleSave(p)}
                          disabled={saving === p.id}
                          className="flex items-center gap-1 text-xs bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 rounded-lg transition font-semibold"
                        >
                          {saving === p.id ? <Loader2 className="animate-spin" size={12} /> : <Save size={12} />}
                          Save
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300 font-medium">Saved</span>
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
