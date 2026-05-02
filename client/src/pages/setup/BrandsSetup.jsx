import { useState, useEffect } from 'react';
import { Store, Loader2, Save } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import api from '../../api/axios';

// ── Small deposit toggle pill ─────────────────────────────────────────────────
function DepositToggle({ enabled, disabled, onToggle }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${enabled && !disabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${enabled && !disabled ? 'translate-x-[1.125rem]' : 'translate-x-0.5'}`} />
    </button>
  );
}

// ── Category + products section for a brand ───────────────────────────────────
function BrandDepositConfig({ brand, onCategoryToggle, onProductToggle }) {
  const [expanded, setExpanded] = useState({});

  // Group products by category
  const grouped = {};
  for (const p of brand.products ?? []) {
    const key = p.category || 'Other';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  }

  // Sort by category display order from brand.categories
  const catOrderMap = Object.fromEntries(
    (brand.categories ?? []).map((c, i) => [c.name, c.displayOrder ?? i])
  );
  const entries = Object.entries(grouped).sort(([a], [b]) => {
    const oa = catOrderMap[a] ?? 9999;
    const ob = catOrderMap[b] ?? 9999;
    return oa !== ob ? oa - ob : a.localeCompare(b);
  });

  if (entries.length === 0) {
    return (
      <p className="text-xs text-slate-400 italic">No products enabled in stock receipt</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {entries.map(([catName, catProds]) => {
        const cat = (brand.categories ?? []).find(c => c.name === catName);
        const isOpen = expanded[catName] ?? true;
        return (
          <div key={catName}>
            {/* Category row */}
            <div
              className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 cursor-pointer select-none"
              onClick={() => setExpanded(prev => ({ ...prev, [catName]: !isOpen }))}
            >
              <span className="flex-1 text-sm font-bold text-slate-700">{catName}</span>
              <div
                className="flex items-center gap-1.5"
                onClick={e => e.stopPropagation()}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Deposit</span>
                {cat ? (
                  <DepositToggle
                    enabled={cat.depositEnabled}
                    disabled={!brand.depositEnabled}
                    onToggle={() => onCategoryToggle(brand.id, cat)}
                  />
                ) : (
                  <span className="text-[10px] text-slate-300">—</span>
                )}
              </div>
              <span className="text-xs text-slate-400 ml-1">{isOpen ? '▲' : '▼'}</span>
            </div>

            {/* Products */}
            {isOpen && (
              <div className="ml-5 mt-1 space-y-1">
                {catProds.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2"
                  >
                    <span className="flex-1 text-sm text-slate-700">{p.name}</span>
                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                      {p.unitType === 'ml'
                        ? `${p.unitSize ?? '?'}ml`
                        : p.unitType === 'gram'
                        ? `${p.unitSize ?? '?'}g`
                        : 'piece'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Deposit</span>
                      <DepositToggle
                        enabled={p.depositEnabled}
                        disabled={!brand.depositEnabled}
                        onToggle={() => onProductToggle(brand.id, p)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function BrandsSetup() {
  const { notify } = useNotification();
  const [brands, setBrands]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(null); // brandId being saved

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/brands'),
      api.get('/categories'),
      api.get('/products?all=true'),
    ]).then(([brandsRes, catsRes, prodsRes]) => {
      const rawBrands = brandsRes.data.data ?? [];
      const allCats   = catsRes.data.data ?? [];
      const allProds  = (prodsRes.data.data ?? []).filter(p => p.isActive && p.showInStockReceipt);

      // Attach categories and products to each brand
      const enriched = rawBrands.map(b => ({
        ...b,
        categories: allCats.filter(c => c.brandId === b.id),
        products:   allProds.filter(p => p.brandId === b.id),
      }));
      setBrands(enriched);
    }).catch(() => notify('Failed to load brands', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const updateBrandField = (id, field, value) => {
    setBrands(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));
  };

  const handleSave = async (brand) => {
    setSaving(brand.id);
    try {
      await api.put(`/brands/${brand.id}`, {
        depositEnabled:  brand.depositEnabled,
        depositPerLitre: parseFloat(brand.depositPerLitre) || 0,
      });
      notify(`${brand.name} deposit settings saved`, 'success');
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to save', 'error');
    } finally {
      setSaving(null);
    }
  };

  // Immediate toggle — no save button needed
  const handleCategoryToggle = async (brandId, cat) => {
    const next = !cat.depositEnabled;
    setBrands(prev => prev.map(b => b.id === brandId
      ? { ...b, categories: b.categories.map(c => c.id === cat.id ? { ...c, depositEnabled: next } : c) }
      : b
    ));
    try {
      await api.put(`/categories/${cat.id}`, { depositEnabled: next });
    } catch {
      // revert
      setBrands(prev => prev.map(b => b.id === brandId
        ? { ...b, categories: b.categories.map(c => c.id === cat.id ? { ...c, depositEnabled: cat.depositEnabled } : c) }
        : b
      ));
      notify('Failed to update deposit setting', 'error');
    }
  };

  const handleProductToggle = async (brandId, prod) => {
    const next = !prod.depositEnabled;
    setBrands(prev => prev.map(b => b.id === brandId
      ? { ...b, products: b.products.map(p => p.id === prod.id ? { ...p, depositEnabled: next } : p) }
      : b
    ));
    try {
      await api.put(`/products/${prod.id}`, { depositEnabled: next });
    } catch {
      // revert
      setBrands(prev => prev.map(b => b.id === brandId
        ? { ...b, products: b.products.map(p => p.id === prod.id ? { ...p, depositEnabled: prod.depositEnabled } : p) }
        : b
      ));
      notify('Failed to update deposit setting', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <Store size={17} className="text-emerald-300 flex-shrink-0" />
        <div>
          <h1 className="text-sm font-bold text-white leading-tight">Brands</h1>
          <p className="text-emerald-300 text-xs">Configure deposit settings per dairy brand</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 md:p-8 max-w-2xl mx-auto w-full space-y-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
          </div>
        ) : (
          brands.map(brand => (
            <div key={brand.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

              {/* Brand name bar */}
              <div className="flex items-center gap-2.5 px-5 py-3.5 bg-emerald-50 border-b border-emerald-100">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
                <span className="font-bold text-emerald-800 text-sm">{brand.name}</span>
              </div>

              <div className="px-5 py-4 space-y-4">

                {/* Deposit toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Charge deposit</p>
                    <p className="text-xs text-slate-400 mt-0.5">Calculate deposit on every litre of ml products received</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateBrandField(brand.id, 'depositEnabled', !brand.depositEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${brand.depositEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${brand.depositEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* Deposit rate — only when enabled */}
                {brand.depositEnabled && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                      Deposit rate (₹ per litre)
                    </label>
                    <div className="relative max-w-xs">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">₹</span>
                      <input
                        type="number" step="0.01" min="0"
                        value={brand.depositPerLitre ?? ''}
                        onChange={e => updateBrandField(brand.id, 'depositPerLitre', e.target.value)}
                        placeholder="e.g. 0.20"
                        className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      e.g. ₹0.20 means 20 paise per litre received
                    </p>
                  </div>
                )}

                {/* Save button */}
                <div className="pt-1">
                  <button
                    onClick={() => handleSave(brand)}
                    disabled={saving === brand.id}
                    className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold px-4 py-2 rounded-xl transition text-sm"
                  >
                    {saving === brand.id
                      ? <><Loader2 className="animate-spin" size={14} /> Saving…</>
                      : <><Save size={14} /> Save</>
                    }
                  </button>
                </div>

                {/* Category + product deposit toggles */}
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                    Deposit by category &amp; product
                    {!brand.depositEnabled && (
                      <span className="ml-2 normal-case font-normal text-slate-300">(enable deposit above to configure)</span>
                    )}
                  </p>
                  <BrandDepositConfig
                    brand={brand}
                    onCategoryToggle={handleCategoryToggle}
                    onProductToggle={handleProductToggle}
                  />
                </div>

              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
