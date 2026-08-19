import { Unlock, X, Search, Loader2 } from 'lucide-react';
import { getIndiaDate } from '../../../utils/dateUtils';

/**
 * Exception Manager (superadmin only) — enables or disables a
 * globally-disabled product for a specific set of salespeople without
 * touching the global flag, optionally setting a price in the same action.
 */
export default function ExceptionManagerModal({
  show,
  globalProducts,
  brands,
  salespeople,
  exceptionForm,
  setExceptionForm,
  exProductSearch,
  setExProductSearch,
  exSpSearch,
  setExSpSearch,
  savingExceptions,
  onClose,
  onSave,
}) {
  if (!show) return null;

  const disabledAll = globalProducts.filter(p => !p.salespersonEnabled);

  const productQ = exProductSearch.toLowerCase();
  const disabled = globalProducts
    .filter(p => !p.salespersonEnabled)
    .filter(p => !productQ || p.productName.toLowerCase().includes(productQ) || (p.category?.toLowerCase().includes(productQ)));

  // Group by brand, preserving brands array order (displayOrder)
  const brandOrder = brands.map(b => b.id);
  const byBrand = {};
  disabled.forEach(p => {
    if (!byBrand[p.brandId]) byBrand[p.brandId] = { brandName: p.brandName, products: [] };
    byBrand[p.brandId].products.push(p);
  });
  const sortedBrandIds = Object.keys(byBrand)
    .map(Number)
    .sort((a, b) => {
      const ai = brandOrder.indexOf(a);
      const bi = brandOrder.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

  const selectedDisabled = globalProducts.filter(
    p => !p.salespersonEnabled && exceptionForm.selectedProducts.has(p.productId)
  );

  const spQ = exSpSearch.toLowerCase();
  const filteredSp = salespeople.filter(sp =>
    !spQ || sp.name.toLowerCase().includes(spQ) || (sp.route?.toLowerCase().includes(spQ))
  );

  return (
    <div
      className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="bg-violet-700 px-5 py-4 flex items-center justify-between rounded-t-2xl sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <Unlock size={18} className="text-violet-200 flex-shrink-0" />
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Exception Manager</h3>
              <p className="text-[11px] text-violet-200 mt-0.5">Enable globally-disabled products for specific salespeople only</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-violet-200 hover:text-white hover:bg-violet-600 rounded-lg transition"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">

          {/* Action selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Action</label>
            <div className="flex gap-3">
              {[
                { value: 'enable',  label: '✓ Enable for selected salespeople' },
                { value: 'disable', label: '✗ Remove exception (disable)' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setExceptionForm(f => ({ ...f, action: value }))}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-xl border transition ${
                    exceptionForm.action === value
                      ? value === 'enable'
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-slate-700 border-slate-700 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              {exceptionForm.action === 'enable'
                ? 'Selected products will appear for the chosen salespeople only. The global setting stays off for everyone else.'
                : 'Removes the per-salesperson exception — these products go back to globally disabled for the selected salespeople.'}
            </p>
          </div>

          {/* Globally-disabled product list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Globally Disabled Products ({exceptionForm.selectedProducts.size} selected)
              </label>
              {disabledAll.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExceptionForm(f => ({
                    ...f,
                    selectedProducts: f.selectedProducts.size === disabledAll.length
                      ? new Set()
                      : new Set(disabledAll.map(p => p.productId)),
                  }))}
                  className="text-xs font-semibold text-violet-600 hover:text-violet-700"
                >
                  {exceptionForm.selectedProducts.size === disabledAll.length
                    ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search disabled products…"
                value={exProductSearch}
                onChange={e => setExProductSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
              />
            </div>
            {disabled.length === 0 ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-700 text-center">
                {exProductSearch
                  ? 'No matching globally-disabled products.'
                  : 'All products are currently globally enabled — nothing to create exceptions for.'}
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
                {sortedBrandIds.map(brandId => {
                  const { brandName, products: brandProducts } = byBrand[brandId];

                  // Group products within the brand by category, sorted by categoryDisplayOrder
                  const byCat = {};
                  brandProducts.forEach(p => {
                    const key = p.category || '';
                    if (!byCat[key]) byCat[key] = { catOrder: p.categoryDisplayOrder ?? 999, products: [] };
                    byCat[key].products.push(p);
                  });
                  const sortedCats = Object.entries(byCat)
                    .sort(([, a], [, b]) => a.catOrder - b.catOrder);

                  return (
                    <div key={brandId}>
                      {/* Brand header */}
                      <div className="sticky top-0 z-10 bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white uppercase tracking-wider">
                        {brandName}
                      </div>
                      {sortedCats.map(([cat, { products: catProducts }]) => {
                        // Sort products within category by displayOrder → name
                        const sorted = [...catProducts].sort((a, b) =>
                          (a.displayOrder ?? 999) - (b.displayOrder ?? 999) ||
                          a.productName.localeCompare(b.productName)
                        );
                        return (
                          <div key={cat || '_none'}>
                            {cat && (
                              <div className="bg-slate-100 border-y border-slate-200 px-3 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                                {cat}
                              </div>
                            )}
                            <div className="divide-y divide-slate-100">
                              {sorted.map(p => {
                                const checked = exceptionForm.selectedProducts.has(p.productId);
                                const showPrice = exceptionForm.action === 'enable' && checked;
                                return (
                                  <label
                                    key={p.productId}
                                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-white transition ${checked ? 'bg-violet-50' : ''}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => setExceptionForm(f => {
                                        const s = new Set(f.selectedProducts);
                                        if (s.has(p.productId)) s.delete(p.productId); else s.add(p.productId);
                                        return { ...f, selectedProducts: s };
                                      })}
                                      className="w-4 h-4 rounded border-slate-300 text-violet-600 flex-shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-slate-800 truncate">{p.productName}</p>
                                      {/* Dairy cost / MRP reference */}
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] text-slate-400">
                                          Cost <span className="font-semibold text-slate-500">₹{Number(p.dairyCostPrice ?? 0).toFixed(2)}</span>
                                        </span>
                                        <span className="text-slate-200 text-[10px]">|</span>
                                        <span className="text-[10px] text-slate-400">
                                          MRP <span className="font-semibold text-emerald-600">₹{Number(p.dairySellingPrice ?? 0).toFixed(2)}</span>
                                        </span>
                                      </div>
                                    </div>
                                    {/* Inline price input — only when enabling this product */}
                                    {showPrice && (
                                      <div className="relative flex-shrink-0" onClick={e => e.preventDefault()}>
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={exceptionForm.prices[p.productId] ?? ''}
                                          onChange={e => setExceptionForm(f => ({ ...f, prices: { ...f.prices, [p.productId]: e.target.value } }))}
                                          onClick={e => e.stopPropagation()}
                                          placeholder={p.dairySellingPrice > 0 ? String(p.dairySellingPrice) : 'Price'}
                                          className="w-24 pl-5 pr-2 py-1.5 text-xs text-right font-semibold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400"
                                        />
                                      </div>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
            {exceptionForm.action === 'enable' && exceptionForm.selectedProducts.size > 0 && (
              <div className="flex items-center justify-between mt-1.5 gap-2">
                <p className="text-[10px] text-slate-400">
                  Price is optional — leave blank to use the global default price.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const newPrices = { ...exceptionForm.prices };
                    selectedDisabled.forEach(p => {
                      if (p.dairySellingPrice > 0) {
                        newPrices[p.productId] = String(p.dairySellingPrice);
                      }
                    });
                    setExceptionForm(f => ({ ...f, prices: newPrices }));
                  }}
                  className="flex-shrink-0 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700 underline underline-offset-2 whitespace-nowrap"
                >
                  Use dairy MRP for all
                </button>
              </div>
            )}
          </div>

          {/* Effective From — shown only when enabling and at least one price is entered */}
          {exceptionForm.action === 'enable' &&
            Object.values(exceptionForm.prices).some(v => v !== '' && v !== undefined) && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Prices From</label>
              <input
                type="date"
                value={exceptionForm.effectiveFrom}
                onChange={e => setExceptionForm(f => ({ ...f, effectiveFrom: e.target.value }))}
                min={getIndiaDate()}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Today = immediate; future date = schedule the price change.
              </p>
            </div>
          )}

          {/* Salespeople */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Salespeople ({exceptionForm.selectedSalesmen.size} selected)
              </label>
              {salespeople.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExceptionForm(f => ({
                    ...f,
                    selectedSalesmen: f.selectedSalesmen.size === salespeople.length
                      ? new Set()
                      : new Set(salespeople.map(sp => sp.id)),
                  }))}
                  className="text-xs font-semibold text-violet-600 hover:text-violet-700"
                >
                  {exceptionForm.selectedSalesmen.size === salespeople.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search salespeople…"
                value={exSpSearch}
                onChange={e => setExSpSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-52 overflow-y-auto space-y-1">
              {filteredSp.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No salespeople found</p>
              ) : (
                filteredSp.map(sp => (
                  <label key={sp.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1.5 rounded transition">
                    <input
                      type="checkbox"
                      checked={exceptionForm.selectedSalesmen.has(sp.id)}
                      onChange={() => setExceptionForm(f => {
                        const s = new Set(f.selectedSalesmen);
                        if (s.has(sp.id)) s.delete(sp.id); else s.add(sp.id);
                        return { ...f, selectedSalesmen: s };
                      })}
                      className="w-4 h-4 rounded border-slate-300 text-violet-600 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{sp.name}</p>
                      {sp.route && <p className="text-xs text-slate-400 truncate">{sp.route}</p>}
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex gap-3 pt-1 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={
                savingExceptions ||
                exceptionForm.selectedProducts.size === 0 ||
                exceptionForm.selectedSalesmen.size === 0
              }
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-violet-700 hover:bg-violet-800 disabled:bg-violet-300 text-white rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
            >
              {savingExceptions
                ? <Loader2 className="animate-spin" size={14} />
                : <Unlock size={14} />
              }
              {savingExceptions
                ? 'Applying…'
                : `${exceptionForm.action === 'enable' ? 'Enable' : 'Disable'} (${exceptionForm.selectedProducts.size}P × ${exceptionForm.selectedSalesmen.size}S)`
              }
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
