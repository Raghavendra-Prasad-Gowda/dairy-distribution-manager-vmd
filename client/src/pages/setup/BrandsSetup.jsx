import { useState, useEffect, useRef } from 'react';
import { Store, Loader2, Save, Plus, Pencil, Check, X as XIcon } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import BrandedLoader from '../../components/ui/BrandedLoader';
import { useNotification } from '../../context/NotificationContext';
import { getBrandColors } from '../../utils/constants';
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
export default function BrandsSetup({ shellActiveBrandId } = {}) {
  const inShell = shellActiveBrandId != null;
  const { notify } = useNotification();

  const [brands, setBrands]         = useState([]);
  const [activeBrandId, setActive]  = useState(null);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);

  // Brand management state
  const [addingNew, setAddingNew]       = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [addSaving, setAddSaving]       = useState(false);
  const [renamingId, setRenamingId]     = useState(null);
  const [renameValue, setRenameValue]   = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  const addInputRef    = useRef(null);
  const renameInputRef = useRef(null);

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
      setActive(shellActiveBrandId ?? (enriched.length ? enriched[0].id : null));
    }).catch(() => notify('Failed to load brands', 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (inShell) setActive(shellActiveBrandId);
  }, [shellActiveBrandId]);

  useEffect(() => {
    if (addingNew) addInputRef.current?.focus();
  }, [addingNew]);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  const brand = brands.find(b => b.id === activeBrandId) ?? null;

  const updateBrandField = (field, value) => {
    setBrands(prev => prev.map(b => b.id === activeBrandId ? { ...b, [field]: value } : b));
  };

  // ── Deposit save ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!brand) return;
    setSaving(true);
    try {
      await api.put(`/brands/${brand.id}`, {
        depositEnabled:  brand.depositEnabled,
        depositPerLitre: parseFloat(brand.depositPerLitre) || 0,
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

  // ── Brand management ──────────────────────────────────────────────────────
  const handleAddBrand = async () => {
    const name = newBrandName.trim();
    if (!name) return;
    setAddSaving(true);
    try {
      const res = await api.post('/brands', { name });
      const created = res.data.data;
      setBrands(prev => [...prev, { ...created, categories: [], products: [] }]);
      setNewBrandName('');
      setAddingNew(false);
      notify(`Brand "${created.name}" added`, 'success');
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to add brand', 'error');
    } finally {
      setAddSaving(false);
    }
  };

  const handleStartRename = (b) => {
    setRenamingId(b.id);
    setRenameValue(b.name);
    setAddingNew(false);
  };

  const handleCancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  const handleConfirmRename = async (id) => {
    const name = renameValue.trim();
    if (!name) return;
    const original = brands.find(b => b.id === id)?.name;
    if (name === original) { handleCancelRename(); return; }
    setRenameSaving(true);
    try {
      await api.put(`/brands/${id}`, { name });
      setBrands(prev => prev.map(b => b.id === id ? { ...b, name } : b));
      setRenamingId(null);
      setRenameValue('');
      notify(`Brand renamed to "${name}"`, 'success');
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to rename brand', 'error');
    } finally {
      setRenameSaving(false);
    }
  };

  const handleAddKeyDown = (e) => {
    if (e.key === 'Enter') handleAddBrand();
    if (e.key === 'Escape') { setAddingNew(false); setNewBrandName(''); }
  };

  const handleRenameKeyDown = (e, id) => {
    if (e.key === 'Enter') handleConfirmRename(id);
    if (e.key === 'Escape') handleCancelRename();
  };

  return (
    <div className="flex flex-col h-full">

      {/* Header — hidden in shell mode */}
      {!inShell && (
        <div className="flex items-center gap-2.5 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
          <Store size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Brands</h1>
            <p className="text-emerald-300 text-xs">Add, rename and configure dairy brands</p>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 md:p-8">
        {loading ? (
          <BrandedLoader />
        ) : (
          <div className="max-w-xl space-y-6">

            {/* ── Brand management card (standalone mode only) ── */}
            {!inShell && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dairy Brands</p>
                  <button
                    type="button"
                    onClick={() => { setAddingNew(true); setRenamingId(null); }}
                    disabled={addingNew}
                    className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    <Plus size={13} />
                    Add Brand
                  </button>
                </div>

                <ul className="divide-y divide-slate-100">
                  {brands.map((b, index) => {
                    const colors = getBrandColors(b.name, index);
                    const isRenaming = renamingId === b.id;
                    return (
                      <li key={b.id} className="flex items-center gap-3 px-5 py-3">
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors.dot}`} />
                        {isRenaming ? (
                          <>
                            <input
                              ref={renameInputRef}
                              type="text"
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onKeyDown={e => handleRenameKeyDown(e, b.id)}
                              className="flex-1 text-sm font-medium border border-slate-300 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                            />
                            <button
                              type="button"
                              onClick={() => handleConfirmRename(b.id)}
                              disabled={renameSaving || !renameValue.trim()}
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 transition"
                            >
                              {renameSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelRename}
                              disabled={renameSaving}
                              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-40 transition"
                            >
                              <XIcon size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm font-medium text-slate-700">{b.name}</span>
                            <button
                              type="button"
                              onClick={() => handleStartRename(b)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                              title="Rename brand"
                            >
                              <Pencil size={13} />
                            </button>
                          </>
                        )}
                      </li>
                    );
                  })}

                  {/* Add brand form row */}
                  {addingNew && (
                    <li className="flex items-center gap-3 px-5 py-3 bg-emerald-50/50">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-slate-300" />
                      <input
                        ref={addInputRef}
                        type="text"
                        value={newBrandName}
                        onChange={e => setNewBrandName(e.target.value)}
                        onKeyDown={handleAddKeyDown}
                        placeholder="Brand name"
                        className="flex-1 text-sm font-medium border border-slate-300 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddBrand}
                        disabled={addSaving || !newBrandName.trim()}
                        className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-100 disabled:opacity-40 transition"
                      >
                        {addSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAddingNew(false); setNewBrandName(''); }}
                        disabled={addSaving}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-40 transition"
                      >
                        <XIcon size={14} />
                      </button>
                    </li>
                  )}

                  {brands.length === 0 && !addingNew && (
                    <li className="px-5 py-6 text-center text-sm text-slate-400 italic">
                      No brands yet — add one above
                    </li>
                  )}
                </ul>

                {!inShell && brands.length > 0 && (
                  <p className="px-5 py-2.5 text-[10px] text-slate-400 border-t border-slate-100">
                    Renaming a brand updates its navigation link — old bookmarks may break.
                  </p>
                )}
              </div>
            )}

            {/* ── Deposit settings section ── */}
            {!inShell && brands.length > 0 && (
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest -mb-2">Deposit Settings</p>
            )}

            {/* Brand tabs strip */}
            {!inShell && !loading && brands.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 pt-3 pb-0">
                <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={setActive} />
                <div className="h-3" />
              </div>
            )}

            {brand && (
              <>
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
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
