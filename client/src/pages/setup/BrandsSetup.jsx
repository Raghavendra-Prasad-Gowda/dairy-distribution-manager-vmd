import { useState, useEffect } from 'react';
import { Store, Loader2, Save } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
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

// ── Category + products deposit config ────────────────────────────────────────
function BrandDepositConfig({ brand, onCategoryToggle, onProductToggle }) {
  const [expanded, setExpanded] = useState({});

  const grouped = {};
  for (const p of brand.products ?? []) {
    const key = p.category || 'Other';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  }

  const catOrderMap = Object.fromEntries(
    (brand.categories ?? []).map(c => [c.name, c.displayOrder ?? 0])
  );
  const entries = Object.entries(grouped).sort(([a], [b]) => {
    const oa = catOrderMap[a] ?? 9999;
    const ob = catOrderMap[b] ?? 9999;
    return oa !== ob ? oa - ob : a.localeCompare(b);
  });

  if (entries.length === 0) {
    return <p className="text-xs text-slate-400 italic">No products enabled in stock receipt</p>;
  }

  return (
    <div className="space-y-1.5">
      {entries.map(([catName, catProds]) => {
        const cat = (brand.categories ?? []).find(c => c.name === catName);
        const isOpen = expanded[catName] ?? true;
        return (
          <div key={catName}>
            <div
              className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 cursor-pointer select-none"
              onClick={() => setExpanded(prev => ({ ...prev, [catName]: !isOpen }))}
            >
              <span className="flex-1 text-sm font-bold text-slate-700">{catName}</span>
              <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Deposit</span>
                {cat ? (
                  <DepositToggle
                    enabled={cat.depositEnabled}
                    disabled={!brand.depositEnabled}
                    onToggle={() => onCategoryToggle(cat)}
                  />
                ) : (
                  <span className="text-[10px] text-slate-300">—</span>
                )}
              </div>
              <span className="text-xs text-slate-400 ml-1">{isOpen ? '▲' : '▼'}</span>
            </div>

            {isOpen && (
              <div className="ml-5 mt-1 space-y-1">
                {catProds.map(p => (
                  <div key={p.id} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
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
                        onToggle={() => onProductToggle(p)}
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
  const [brands, setBrands]         = useState([]);
  const [activeBrandId, setActive]  = useState(null);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);

  // Load all brands with their categories + products on mount
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
      const enriched  = rawBrands.map(b => {
        const qualifyingProds = allProds.filter(p =>
          p.brandId === b.id &&
          (p.unitType === 'ml' || p.unitType === 'gram') &&
          p.containerType === 'crate'
        );
        const qualifyingCatNames = new Set(qualifyingProds.map(p => p.category || 'Other'));
        return {
          ...b,
          categories: allCats.filter(c => c.brandId === b.id && qualifyingCatNames.has(c.name)),
          products:   qualifyingProds,
        };
      });
      setBrands(enriched);
      if (enriched.length) setActive(enriched[0].id);
    }).catch(() => notify('Failed to load brands', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const brand = brands.find(b => b.id === activeBrandId) ?? null;

  const updateBrandField = (field, value) => {
    setBrands(prev => prev.map(b => b.id === activeBrandId ? { ...b, [field]: value } : b));
  };

  const handleSave = async () => {
    if (!brand) return;
    setSaving(true);
    try {
      await api.put(`/brands/${brand.id}`, {
        depositEnabled:    brand.depositEnabled,
        depositPerLitre:   parseFloat(brand.depositPerLitre) || 0,
        depositCalcMethod: brand.depositCalcMethod ?? 'litre',
      });
      notify(`${brand.name} deposit settings saved`, 'success');
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCategoryToggle = async (cat) => {
    const next = !cat.depositEnabled;
    // Optimistically update category + all products in that category
    setBrands(prev => prev.map(b => b.id === activeBrandId
      ? {
          ...b,
          categories: b.categories.map(c => c.id === cat.id ? { ...c, depositEnabled: next } : c),
          products:   b.products.map(p => (p.category || 'Other') === cat.name ? { ...p, depositEnabled: next } : p),
        }
      : b
    ));
    try {
      const brand = brands.find(b => b.id === activeBrandId);
      const prodsInCat = (brand?.products ?? []).filter(p => (p.category || 'Other') === cat.name);
      await Promise.all([
        api.put(`/categories/${cat.id}`, { depositEnabled: next }),
        ...prodsInCat.map(p => api.put(`/products/${p.id}`, { depositEnabled: next })),
      ]);
    } catch {
      // Revert
      setBrands(prev => prev.map(b => b.id === activeBrandId
        ? {
            ...b,
            categories: b.categories.map(c => c.id === cat.id ? { ...c, depositEnabled: cat.depositEnabled } : c),
            products:   b.products.map(p => (p.category || 'Other') === cat.name ? { ...p, depositEnabled: cat.depositEnabled } : p),
          }
        : b
      ));
      notify('Failed to update deposit setting', 'error');
    }
  };

  const handleProductToggle = async (prod) => {
    const next = !prod.depositEnabled;
    setBrands(prev => prev.map(b => b.id === activeBrandId
      ? { ...b, products: b.products.map(p => p.id === prod.id ? { ...p, depositEnabled: next } : p) }
      : b
    ));
    try {
      await api.put(`/products/${prod.id}`, { depositEnabled: next });
    } catch {
      setBrands(prev => prev.map(b => b.id === activeBrandId
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

      {/* Brand tabs strip */}
      {!loading && brands.length > 0 && (
        <div className="bg-white border-b border-slate-200 px-4 md:px-6 pt-3 pb-0">
          <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={setActive} />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 md:p-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
          </div>
        ) : !brand ? null : (
          <div className="max-w-xl space-y-6">

            {/* Deposit toggle */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Deposit settings</p>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Charge deposit</p>
                  <p className="text-xs text-slate-400 mt-0.5">Calculate deposit on ml/gram crate products — ₹X per 1000ml or 1kg</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateBrandField('depositEnabled', !brand.depositEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${brand.depositEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${brand.depositEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {brand.depositEnabled && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    Deposit rate (₹ per 1000ml / 1kg)
                  </label>
                  <div className="relative max-w-xs">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">₹</span>
                    <input
                      type="number" step="0.01" min="0"
                      value={brand.depositPerLitre ?? ''}
                      onChange={e => updateBrandField('depositPerLitre', e.target.value)}
                      placeholder="e.g. 0.20"
                      className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">e.g. ₹0.20 means 20 paise per 1000ml (or per 1kg) received</p>
                </div>
              )}

              {brand.depositEnabled && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    Calculation method
                  </label>
                  <div className="flex gap-2">
                    {[
                      { value: 'litre', label: 'Per litre', desc: 'qty × size × rate' },
                      { value: 'crate', label: 'Per crate', desc: 'full crates only' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => updateBrandField('depositCalcMethod', opt.value)}
                        className={`flex-1 rounded-xl border-2 px-3 py-2.5 text-left transition ${
                          (brand.depositCalcMethod ?? 'litre') === opt.value
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <p className={`text-sm font-bold ${(brand.depositCalcMethod ?? 'litre') === opt.value ? 'text-emerald-700' : 'text-slate-700'}`}>{opt.label}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                  {(brand.depositCalcMethod ?? 'litre') === 'crate' && (
                    <p className="text-[11px] text-amber-600 mt-1.5 font-medium">Rounds down to full crates — partial crates not charged</p>
                  )}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold px-4 py-2 rounded-xl transition text-sm"
              >
                {saving ? <><Loader2 className="animate-spin" size={14} /> Saving…</> : <><Save size={14} /> Save</>}
              </button>
            </div>

            {/* Category + product toggles */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
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
        )}
      </div>
    </div>
  );
}
